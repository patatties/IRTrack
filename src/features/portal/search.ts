import type { GuidanceContent } from "@/domain/types";

const STOP = new Set([
  "i",
  "a",
  "an",
  "the",
  "my",
  "is",
  "it",
  "to",
  "of",
  "and",
  "or",
  "me",
  "there",
  "some",
  "someone",
  "what",
  "do",
  "have",
  "has",
  "was",
  "with",
  "for",
  "on",
  "in",
]);
const SYN: Record<string, string[]> = {
  hacked: ["ransom", "malware"],
  virus: ["malware"],
  stolen: ["lost"],
  burning: ["fire", "smoke"],
  leak: ["water"],
  wet: ["water"],
  hurt: ["injured"],
  broken: ["down"],
  harassed: ["harassment"],
  password: ["phishing", "link"],
  mail: ["email"],
};

/** Plain-language search: scores situations by overlapping words and synonyms. */
export function searchSituations<T extends { content: GuidanceContent }>(
  items: T[],
  q: string,
): T[] {
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return items;
  const expanded = words.flatMap((w) => [w, ...(SYN[w] ?? [])]);
  return items
    .map((it) => {
      const hay =
        `${it.content.title} ${it.content.description} ${it.content.keywords.join(" ")} ${it.content.see.join(" ")}`.toLowerCase();
      const score = expanded.reduce(
        (s, w) => s + (hay.includes(w) ? (it.content.title.toLowerCase().includes(w) ? 3 : 1) : 0),
        0,
      );
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it);
}
