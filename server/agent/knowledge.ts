export interface KnowledgeChunk { id: string; document_id: string; content: string; title: string; embedding: string | null; embedding_model: string }
const stopwords = new Set("и в во на с со к по за от до о об у а но или не да нет это как что чем для при из то ли же мы вы я он она они про есть быть the a an is are to of in on for and or how what with".split(" "));

function tokens(value: string): string[] {
  return (value.toLocaleLowerCase("ru").replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 1 && !stopwords.has(word)).map(word => /^[а-я]{6,}$/.test(word) ? word.slice(0, -2) : word);
}

export function splitKnowledge(content: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  const chars = Array.from(content.replaceAll("\r\n", "\n").trim());
  for (let start = 0; start < chars.length;) {
    let end = Math.min(chars.length, start + size);
    if (end < chars.length) {
      for (let index = end; index > start + size * 0.7; index--) {
        if (/\s/.test(chars[index - 1]!)) { end = index; break; }
      }
    }
    const chunk = chars.slice(start, end).join("").trim();
    if (chunk) chunks.push(chunk);
    if (end === chars.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/** BM25 retrieves relevant fragments locally; hybrid mode adds semantic similarity. */
export function keywordScores(chunks: KnowledgeChunk[], query: string): Map<string, number> {
  const terms = [...new Set(tokens(query))].slice(0, 40);
  const documents = chunks.map(chunk => tokens(`${chunk.title} ${chunk.title} ${chunk.content}`));
  const average = documents.reduce((sum, words) => sum + words.length, 0) / Math.max(documents.length, 1) || 1;
  const frequency = new Map(terms.map(term => [term, documents.filter(words => words.includes(term)).length]));
  return new Map(chunks.map((chunk, index) => {
    const words = documents[index]!;
    let score = 0;
    for (const term of terms) {
      const count = words.filter(word => word === term).length;
      if (!count) continue;
      const idf = Math.log(1 + (chunks.length - frequency.get(term)! + 0.5) / (frequency.get(term)! + 0.5));
      score += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * words.length / average));
    }
    return [chunk.id, 1 - Math.exp(-score)];
  }));
}

export function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0; let a = 0; let b = 0;
  for (let i = 0; i < left.length; i++) { dot += left[i]! * right[i]!; a += left[i]! ** 2; b += right[i]! ** 2; }
  return a && b ? dot / Math.sqrt(a * b) : 0;
}
