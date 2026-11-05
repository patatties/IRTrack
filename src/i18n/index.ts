import { en } from "./en";

const dictionaries = { en } as const;
type Lang = keyof typeof dictionaries;
let lang: Lang = "en";
export const setLanguage = (l: Lang) => {
  lang = l;
};

/** Look up a dotted key like "portal.question". Falls back to the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const v = key
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dictionaries[lang]);
  let s = typeof v === "string" ? v : key;
  if (vars) for (const [k, val] of Object.entries(vars)) s = s.replace(`{${k}}`, String(val));
  return s;
}
