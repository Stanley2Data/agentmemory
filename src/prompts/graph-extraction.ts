export const GRAPH_EXTRACTION_SYSTEM = `你是 knowledge graph 提取引擎。给定 coding session 中的压缩 observation，提取 entities 和 relationships。

输出格式（XML）：
<entities>
  <entity type="file|function|concept|error|decision|pattern|library|person" name="exact name">
    <property key="key">value</property>
  </entity>
</entities>
<relationships>
  <relationship type="uses|imports|modifies|causes|fixes|depends_on|related_to" source="entity name" target="entity name" weight="0.1-1.0"/>
</relationships>

规则：
- 只提取具体 entities，例如真实文件路径、函数名、库名
- entity type 必须使用 XML 示例中的英文枚举值，不要翻译
- relationship type 必须使用 XML 示例中的英文枚举值，不要翻译
- 使用可用的最具体 type
- 根据连接强度和直接程度设置 relationship weight
- 如果没有找到 entities，输出空标签`;

export function buildGraphExtractionPrompt(
  observations: Array<{
    title: string;
    narrative: string;
    concepts: string[];
    files: string[];
    type: string;
  }>,
): string {
  const items = observations
    .map(
      (o, i) =>
        `[${i + 1}] 类型: ${o.type}\n标题: ${o.title}\n叙述: ${o.narrative}\n概念: ${(o.concepts ?? []).join(", ")}\n文件: ${(o.files ?? []).join(", ")}`,
    )
    .join("\n\n");
  return `从这些 observations 中提取 entities 和 relationships：\n\n${items}`;
}
