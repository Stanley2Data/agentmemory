export const SUMMARY_SYSTEM = `你是 AI 编程代理记忆系统的 session 总结器。给定一个 coding session 中的所有压缩 observations，生成一份简洁的 session summary。

只输出下面这个 XML 格式，不要添加任何额外文本：

<summary>
  <title>简短 session 标题（最多 100 个字符）</title>
  <narrative>用 3-5 句话叙述完成了什么</narrative>
  <decisions>
    <decision>做出的关键技术决策</decision>
  </decisions>
  <files>
    <file>path/to/modified/file</file>
  </files>
  <concepts>
    <concept>session 中的关键概念</concept>
  </concepts>
</summary>

规则：
- 聚焦结果，而不是逐条工具调用
- 突出决策及其理由
- 列出所有创建或修改过的文件
- concepts 应该是便于未来上下文检索的搜索词`

export function buildSummaryPrompt(observations: Array<{
  type: string
  title: string
  facts: string[]
  narrative: string
  files: string[]
  concepts: string[]
}>): string {
  const lines = observations.map((obs, i) => {
    const facts = obs.facts.map((f) => `  - ${f}`).join('\n')
    return `[${i + 1}] ${obs.type}: ${obs.title}\n${obs.narrative}\n事实:\n${facts}\n文件: ${obs.files.join(', ')}`
  })
  return `Session observations（共 ${observations.length} 条）:\n\n${lines.join('\n\n---\n\n')}`
}

export const REDUCE_SYSTEM = `You are merging multiple partial summaries of the SAME coding session into one final session summary. The partials are chronological chunks of one continuous session — not separate sessions.

Output EXACTLY this XML format with no additional text:

<summary>
  <title>Short session title (max 100 chars)</title>
  <narrative>3-5 sentence narrative covering the whole session</narrative>
  <decisions>
    <decision>Key technical decision made</decision>
  </decisions>
  <files>
    <file>path/to/modified/file</file>
  </files>
  <concepts>
    <concept>key concept from session</concept>
  </concepts>
</summary>

Rules:
- Synthesize a single narrative that reflects the whole arc, not a chunk-by-chunk recap
- Preserve every distinct decision across chunks
- Union (deduplicate) all files and concepts
- Title should capture the session's overall outcome`

export function buildReducePrompt(partials: Array<{
  title: string
  narrative: string
  keyDecisions: string[]
  filesModified: string[]
  concepts: string[]
  obsRangeStart: number
  obsRangeEnd: number
}>): string {
  const sections = partials.map((p, i) => {
    const decisions = p.keyDecisions.map((d) => `  - ${d}`).join('\n')
    const files = p.filesModified.map((f) => `  - ${f}`).join('\n')
    const concepts = p.concepts.join(', ')
    return `[Chunk ${i + 1} of ${partials.length} — obs ${p.obsRangeStart}-${p.obsRangeEnd}]
Title: ${p.title}
Narrative: ${p.narrative}
Decisions:
${decisions}
Files:
${files}
Concepts: ${concepts}`
  })
  return `Partial summaries (${partials.length} chunks of one session, chronological):\n\n${sections.join('\n\n---\n\n')}`
}
