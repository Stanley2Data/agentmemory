import type { HookType, RawObservation } from "../types.js";
import { generateId } from "../state/schema.js";

interface JsonlEntry {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  payload?: unknown;
  message?: {
    role?: string;
    content?: unknown;
  };
  toolUseResult?: unknown;
  [k: string]: unknown;
}

export interface ParsedTranscript {
  sessionId: string;
  project: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  observations: RawObservation[];
}

function deriveProject(cwd: string): string {
  if (!cwd) return "unknown";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (
      (entry.type === "text" ||
        entry.type === "input_text" ||
        entry.type === "output_text") &&
      typeof entry.text === "string"
    ) {
      parts.push(entry.text);
    }
  }
  return parts.join("\n");
}

function parseJsonObject(text: unknown): unknown {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractToolUses(content: unknown): Array<{ id: string; name: string; input: unknown }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ id: string; name: string; input: unknown }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === "tool_use") {
      out.push({
        id: typeof entry.id === "string" ? entry.id : "",
        name: typeof entry.name === "string" ? entry.name : "unknown",
        input: entry.input,
      });
    }
  }
  return out;
}

function extractToolResults(content: unknown): Array<{ toolUseId: string; output: unknown; isError: boolean }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ toolUseId: string; output: unknown; isError: boolean }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === "tool_result") {
      out.push({
        toolUseId: typeof entry.tool_use_id === "string" ? entry.tool_use_id : "",
        output: entry.content,
        isError: entry.is_error === true,
      });
    }
  }
  return out;
}

export function parseJsonlText(text: string, fallbackSessionId?: string): ParsedTranscript {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const entries: JsonlEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") entries.push(parsed as JsonlEntry);
    } catch {
      // skip malformed lines
    }
  }

  let sessionId = "";
  let cwd = "";
  let firstTs = "";
  let lastTs = "";

  const observations: RawObservation[] = [];

  for (const entry of entries) {
    if (entry.sessionId && !sessionId) sessionId = entry.sessionId;
    if (entry.cwd && !cwd) cwd = entry.cwd;
    if (entry.type === "session_meta" && entry.payload && typeof entry.payload === "object") {
      const payload = entry.payload as Record<string, unknown>;
      if (typeof payload.id === "string" && !sessionId) sessionId = payload.id;
      if (typeof payload.cwd === "string" && !cwd) cwd = payload.cwd;
      continue;
    }
    const ts = entry.timestamp || new Date().toISOString();
    if (!firstTs) firstTs = ts;
    lastTs = ts;

    const responsePayload =
      entry.type === "response_item" && entry.payload && typeof entry.payload === "object"
        ? (entry.payload as Record<string, unknown>)
        : null;
    const message =
      responsePayload?.type === "message"
        ? {
            role: responsePayload.role,
            content: responsePayload.content,
          }
        : entry.message;

    const role = message?.role;
    const content = message?.content;

    if ((entry.type === "user" || entry.type === "response_item") && role === "user") {
      const toolResults = extractToolResults(content);
      if (toolResults.length > 0) {
        for (const result of toolResults) {
          observations.push({
            id: generateId("obs"),
            sessionId: sessionId || "imported",
            timestamp: ts,
            hookType: (result.isError ? "post_tool_failure" : "post_tool_use") as HookType,
            toolName: undefined,
            toolInput: { toolUseId: result.toolUseId },
            toolOutput: result.output,
            raw: entry,
          });
        }
      } else {
        const text = toText(content);
        if (text.trim().length > 0) {
          observations.push({
            id: generateId("obs"),
            sessionId: sessionId || "imported",
            timestamp: ts,
            hookType: "prompt_submit" as HookType,
            userPrompt: text,
            raw: entry,
          });
        }
      }
    } else if (
      (entry.type === "assistant" || entry.type === "response_item") &&
      role === "assistant"
    ) {
      const text = toText(content);
      const tools = extractToolUses(content);
      if (text.trim().length > 0) {
        observations.push({
          id: generateId("obs"),
          sessionId: sessionId || "imported",
          timestamp: ts,
          hookType: "stop" as HookType,
          assistantResponse: text,
          raw: entry,
        });
      }
      for (const tool of tools) {
        observations.push({
          id: generateId("obs"),
          sessionId: sessionId || "imported",
          timestamp: ts,
          hookType: "pre_tool_use" as HookType,
          toolName: tool.name,
          toolInput: tool.input,
          raw: { toolUseId: tool.id, entry },
        });
      }
    } else if (responsePayload?.type === "function_call") {
      observations.push({
        id: generateId("obs"),
        sessionId: sessionId || "imported",
        timestamp: ts,
        hookType: "pre_tool_use" as HookType,
        toolName: typeof responsePayload.name === "string" ? responsePayload.name : "unknown",
        toolInput: parseJsonObject(responsePayload.arguments),
        raw: {
          callId: responsePayload.call_id,
          entry,
        },
      });
    } else if (responsePayload?.type === "function_call_output") {
      observations.push({
        id: generateId("obs"),
        sessionId: sessionId || "imported",
        timestamp: ts,
        hookType: "post_tool_use" as HookType,
        toolInput: { toolUseId: responsePayload.call_id },
        toolOutput: responsePayload.output,
        raw: entry,
      });
    } else if (entry.type === "summary" || entry.type === "system") {
      // ignore meta entries
    }
  }

  const effectiveSessionId = sessionId || fallbackSessionId || generateId("sess");
  for (const obs of observations) {
    if (obs.sessionId === "imported") obs.sessionId = effectiveSessionId;
  }

  const nowIso = new Date().toISOString();
  return {
    sessionId: effectiveSessionId,
    project: deriveProject(cwd),
    cwd: cwd || process.cwd(),
    startedAt: firstTs || nowIso,
    endedAt: lastTs || nowIso,
    observations,
  };
}
