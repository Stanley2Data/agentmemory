import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseJsonlText } from "../src/replay/jsonl-parser.js";
import { projectTimeline } from "../src/replay/timeline.js";
import { registerReplayFunctions } from "../src/functions/replay.js";
import { KV } from "../src/state/schema.js";
import type { Crystal, Session } from "../src/types.js";

const fx = (name: string) =>
  readFileSync(join(__dirname, "fixtures/jsonl", name), "utf-8");

describe("parseJsonlText", () => {
  it("parses basic user/assistant exchange", () => {
    const out = parseJsonlText(fx("basic.jsonl"));
    expect(out.sessionId).toBe("sess-basic");
    expect(out.project).toBe("project");
    expect(out.cwd).toBe("/Users/alice/project");
    expect(out.observations).toHaveLength(2);
    expect(out.observations[0].hookType).toBe("prompt_submit");
    expect(out.observations[0].userPrompt).toBe("Fix the login bug");
    expect(out.observations[1].hookType).toBe("stop");
    expect(out.observations[1].assistantResponse).toBe("Looking into it now.");
  });

  it("parses tool_use + tool_result pairs", () => {
    const out = parseJsonlText(fx("tool-use.jsonl"));
    expect(out.sessionId).toBe("sess-tool");
    const kinds = out.observations.map((o) => o.hookType);
    expect(kinds).toEqual([
      "prompt_submit",
      "pre_tool_use",
      "post_tool_use",
      "stop",
    ]);
    const toolCall = out.observations[1];
    expect(toolCall.toolName).toBe("Bash");
    expect((toolCall.toolInput as { command: string }).command).toBe("ls");
    const toolResult = out.observations[2];
    expect(toolResult.toolOutput).toBe("README.md\nsrc\n");
  });

  it("tolerates malformed lines and marks tool errors", () => {
    const out = parseJsonlText(fx("errors.jsonl"));
    const errObs = out.observations.find((o) => o.hookType === "post_tool_failure");
    expect(errObs).toBeDefined();
    expect(errObs?.toolOutput).toBe("exit 1");
  });

  it("falls back to generated sessionId when missing", () => {
    const text = JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text);
    expect(out.sessionId).toMatch(/^sess_/);
  });

  it("returns empty observations for blank input", () => {
    const out = parseJsonlText("");
    expect(out.observations).toHaveLength(0);
  });

  it("prefers the file's sessionId over the fallback", () => {
    const text = [
      JSON.stringify({
        type: "user",
        sessionId: "real-session-from-file",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    ].join("\n");
    const out = parseJsonlText(text, "fallback-should-be-ignored");
    expect(out.sessionId).toBe("real-session-from-file");
    for (const obs of out.observations) {
      expect(obs.sessionId).toBe("real-session-from-file");
    }
  });

  it("returns the same sessionId across repeated parses of one file", () => {
    const text = JSON.stringify({
      type: "user",
      sessionId: "stable-id",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const a = parseJsonlText(text, "fb-1");
    const b = parseJsonlText(text, "fb-2");
    expect(a.sessionId).toBe("stable-id");
    expect(b.sessionId).toBe("stable-id");
  });

  it("uses the fallback only when the file has no sessionId", () => {
    const text = JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text, "fb-used");
    expect(out.sessionId).toBe("fb-used");
  });

  it("parses Codex Desktop rollout response items", () => {
    const text = [
      JSON.stringify({
        timestamp: "2026-05-23T00:00:00.000Z",
        type: "session_meta",
        payload: { id: "codex-sess", cwd: "C:\\src\\agentmemory" },
      }),
      JSON.stringify({
        timestamp: "2026-05-23T00:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "<environment_context><cwd>C:\\src</cwd></environment_context>",
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-23T00:00:02.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Fix session snapshots" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-23T00:00:03.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell_command",
          call_id: "call_1",
          arguments: '{"command":"rg replay"}',
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-23T00:00:04.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_1",
          output: "done",
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-23T00:00:05.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Complete" }],
        },
      }),
    ].join("\n");

    const out = parseJsonlText(text, "fallback");

    expect(out.sessionId).toBe("codex-sess");
    expect(out.cwd).toBe("C:\\src\\agentmemory");
    expect(out.observations.map((o) => o.hookType)).toEqual([
      "prompt_submit",
      "prompt_submit",
      "pre_tool_use",
      "post_tool_use",
      "stop",
    ]);
    expect(out.observations[1].userPrompt).toBe("Fix session snapshots");
    expect(out.observations[2].toolName).toBe("shell_command");
    expect((out.observations[2].toolInput as { command: string }).command).toBe("rg replay");
    expect(out.observations[3].toolOutput).toBe("done");
  });
});

describe("projectTimeline", () => {
  it("preserves ordering and computes offsets from real timestamps", () => {
    const parsed = parseJsonlText(fx("tool-use.jsonl"));
    const tl = projectTimeline(parsed.observations);
    expect(tl.eventCount).toBe(4);
    expect(tl.events[0].kind).toBe("prompt");
    expect(tl.events[1].kind).toBe("tool_call");
    expect(tl.events[2].kind).toBe("tool_result");
    expect(tl.events[3].kind).toBe("response");
    expect(tl.events[0].offsetMs).toBe(0);
    expect(tl.events[3].offsetMs).toBeGreaterThan(0);
  });

  it("synthesizes pacing when all timestamps identical", () => {
    const parsed = parseJsonlText(fx("basic.jsonl"));
    for (const obs of parsed.observations) obs.timestamp = "2026-04-17T10:00:00.000Z";
    const tl = projectTimeline(parsed.observations);
    expect(tl.events[0].offsetMs).toBe(0);
    expect(tl.events[1].offsetMs).toBeGreaterThanOrEqual(300);
  });

  it("returns empty timeline for no observations", () => {
    const tl = projectTimeline([]);
    expect(tl.eventCount).toBe(0);
    expect(tl.totalDurationMs).toBe(0);
    expect(tl.events).toHaveLength(0);
  });

  it("marks errored tool results as tool_error kind", () => {
    const parsed = parseJsonlText(fx("errors.jsonl"));
    const tl = projectTimeline(parsed.observations);
    expect(tl.events.some((e) => e.kind === "tool_error")).toBe(true);
  });

  it("uses one shared fallback timestamp when metadata missing", () => {
    const text = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text);
    expect(out.startedAt).toBe(out.endedAt);
  });
});

describe("mem::replay::import-jsonl", () => {
  it("uses the first informative user prompt for imported session snapshots", async () => {
    const store = new Map<string, Map<string, unknown>>();
    const kv = {
      async get<T>(scope: string, key: string): Promise<T | null> {
        return (store.get(scope)?.get(key) as T | undefined) ?? null;
      },
      async set<T>(scope: string, key: string, value: T): Promise<T> {
        if (!store.has(scope)) store.set(scope, new Map());
        store.get(scope)!.set(key, value);
        return value;
      },
      async list<T>(scope: string): Promise<T[]> {
        return Array.from(store.get(scope)?.values() ?? []) as T[];
      },
    };
    const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
    const sdk = {
      registerFunction(id: string, fn: (data: unknown) => Promise<unknown>) {
        handlers.set(id, fn);
      },
    };
    registerReplayFunctions(sdk as never, kv as never);

    const dir = mkdtempSync(join(tmpdir(), "agentmemory-replay-"));
    const file = join(dir, "session.jsonl");
    try {
      const base = {
        sessionId: "sess-informative",
        cwd: "C:/src/agentmemory",
        timestamp: "2026-05-23T10:00:00.000Z",
      };
      writeFileSync(
        file,
        [
          JSON.stringify({
            ...base,
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "<environment_context><cwd>C:/src</cwd><shell>powershell</shell></environment_context>",
                },
              ],
            },
          }),
          JSON.stringify({
            ...base,
            timestamp: "2026-05-23T10:01:00.000Z",
            type: "user",
            message: {
              role: "user",
              content: [{ type: "text", text: "Fix viewer session snapshot summaries" }],
            },
          }),
          JSON.stringify({
            ...base,
            timestamp: "2026-05-23T10:02:00.000Z",
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Fixed the replay summary fallback." }],
            },
          }),
        ].join("\n"),
      );

      const result = await handlers.get("mem::replay::import-jsonl")!({ path: file });
      expect(result).toMatchObject({ success: true });

      const sessions = await kv.list<Session>(KV.sessions);
      expect(sessions[0].firstPrompt).toBe("Fix viewer session snapshot summaries");

      const crystals = await kv.list<Crystal>(KV.crystals);
      expect(crystals).toHaveLength(1);
      expect(crystals[0].narrative).toBe("Fix viewer session snapshot summaries");
      expect(crystals[0].narrative).not.toContain("<environment_context>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

