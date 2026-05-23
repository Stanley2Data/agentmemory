export const SEMANTIC_MERGE_SYSTEM = `你是记忆 consolidation 引擎。给定相互重叠的 episodic memories（session summaries），提取稳定的事实性知识。

输出格式（XML）：
<facts>
  <fact confidence="0.0-1.0">简洁的事实陈述</fact>
</facts>

规则：
- 只提取出现在 2 个以上 episodes 中的事实，或置信度很高的事实
- confidence 表示该事实在多个 episodes 中得到支持的程度
- 将重叠信息合并成单条简洁事实
- 跳过短暂细节，例如具体错误消息或临时状态`;

export function buildSemanticMergePrompt(
  episodes: Array<{ title: string; narrative: string; concepts: string[] }>,
): string {
  const items = episodes
    .map(
      (e, i) =>
        `[片段 ${i + 1}]\n标题: ${e.title}\n叙述: ${e.narrative}\n概念: ${e.concepts.join(", ")}`,
    )
    .join("\n\n");
  return `将这些 episodic memories consolidation 成稳定事实：\n\n${items}`;
}

export const PROCEDURAL_EXTRACTION_SYSTEM = `你是 procedural memory 提取器。给定跨 sessions 反复出现的模式和工作流，提取可复用的 procedures。

输出格式（XML）：
<procedures>
  <procedure name="简短描述性名称" trigger="何时使用这个 procedure">
    <step>步骤 1 描述</step>
    <step>步骤 2 描述</step>
  </procedure>
</procedures>

规则：
- 只提取观察到 2 次以上的 procedures
- 步骤应该具体且可执行
- trigger 条件应该足够具体，便于自动匹配`;

export function buildProceduralExtractionPrompt(
  patterns: Array<{ content: string; frequency: number }>,
): string {
  const items = patterns
    .map((p, i) => `[模式 ${i + 1}]（出现 ${p.frequency} 次）\n${p.content}`)
    .join("\n\n");
  return `从这些反复出现的模式中提取可复用 procedures：\n\n${items}`;
}
