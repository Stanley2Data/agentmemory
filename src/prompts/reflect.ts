export const REFLECT_SYSTEM = `你是高阶推理引擎。给定一组相关的 concepts、facts、lessons 和 action outcomes，综合出横跨多条独立 memories 的 insights。

输出格式（XML）：
<insights>
  <insight confidence="0.0-1.0" title="简短描述性标题">
    高阶观察或原则。内容应当可行动且不显而易见，也就是只有同时观察多条 memories 时才会显现的东西。
  </insight>
</insights>

规则：
- 识别横跨 2 个以上 source items 的模式、原则或策略
- confidence 表示该 insight 在多个 sources 中得到支持的程度
- title 应该是简洁标签（少于 60 个字符）
- 内容应该是真正的观察结论（1-3 句话）
- 优先输出可行动 insights，而不是抽象摘要
- 跳过只是复述单个 source item 的 insights
- 始终先输出 confidence 属性，再输出 title 属性`;

export function buildReflectPrompt(cluster: {
  concepts: string[];
  facts: Array<{ fact: string; confidence: number }>;
  lessons: Array<{ content: string; confidence: number }>;
  crystalNarratives: string[];
}): string {
  const sections: string[] = [];

  sections.push(`## 概念簇: ${cluster.concepts.join(", ")}`);

  if (cluster.facts.length > 0) {
    sections.push(
      "\n## 已知事实",
      ...cluster.facts.map(
        (f) => `- [confidence=${f.confidence}] ${f.fact}`,
      ),
    );
  }

  if (cluster.lessons.length > 0) {
    sections.push(
      "\n## 经验教训",
      ...cluster.lessons.map(
        (l) => `- [confidence=${l.confidence}] ${l.content}`,
      ),
    );
  }

  if (cluster.crystalNarratives.length > 0) {
    sections.push(
      "\n## 已完成工作摘要",
      ...cluster.crystalNarratives.map((n) => `- ${n}`),
    );
  }

  return `从这组相关 memories 中综合高阶 insights：\n\n${sections.join("\n")}`;
}
