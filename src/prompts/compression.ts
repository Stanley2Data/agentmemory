export const COMPRESSION_SYSTEM = `你是 AI 编程代理的记忆压缩引擎。你的任务是从一次工具使用 observation 中提取关键信息，并压缩成结构化数据。

只输出下面这个 XML 格式，不要添加任何额外文本：

<observation>
  <type>one of: file_read, file_write, file_edit, command_run, search, web_fetch, conversation, error, decision, discovery, subagent, notification, task, other</type>
  <title>简短描述性标题（最多 80 个字符）</title>
  <subtitle>一行上下文（可选）</subtitle>
  <facts>
    <fact>具体事实细节 1</fact>
    <fact>具体事实细节 2</fact>
  </facts>
  <narrative>用 2-3 句话总结发生了什么以及为什么重要</narrative>
  <concepts>
    <concept>技术概念或模式</concept>
  </concepts>
  <files>
    <file>path/to/file</file>
  </files>
  <importance>1-10 分，10 表示关键架构决策</importance>
</observation>

规则：
- 保持简洁，但保留所有技术相关细节
- 文件路径必须精确
- <type> 必须使用上面列出的英文枚举值，不要翻译枚举值
- 重要性：1-3 表示常规读取，4-6 表示编辑或命令，7-9 表示架构决策，10 表示破坏性变更
- concepts 应该是可复用的搜索词，例如 "React hooks"、"SQL migration"、"auth middleware"
- 输出中必须移除任何 secret、token 或凭据`;

export function buildCompressionPrompt(observation: {
  hookType: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  timestamp: string;
}): string {
  const parts = [
    `时间戳: ${observation.timestamp}`,
    `Hook: ${observation.hookType}`,
  ];

  if (observation.toolName) parts.push(`工具: ${observation.toolName}`);
  if (observation.toolInput) {
    const input =
      typeof observation.toolInput === "string"
        ? observation.toolInput
        : JSON.stringify(observation.toolInput, null, 2);
    parts.push(`输入:\n${truncate(input, 4000)}`);
  }
  if (observation.toolOutput) {
    const output =
      typeof observation.toolOutput === "string"
        ? observation.toolOutput
        : JSON.stringify(observation.toolOutput, null, 2);
    parts.push(`输出:\n${truncate(output, 4000)}`);
  }
  if (observation.userPrompt) {
    parts.push(`用户提示:\n${truncate(observation.userPrompt, 2000)}`);
  }

  return parts.join("\n\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n[...已截断]" : s;
}
