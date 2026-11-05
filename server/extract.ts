/**
 * Turns uploaded files into what an LLM can take:
 * - PDF and images are passed on as-is (providers read them natively)
 * - Word (.docx), Excel (.xlsx) and PowerPoint (.pptx) are unzipped and their text extracted,
 *   keeping table rows and sheet cells as rows/columns
 * - text formats are read as text
 * Office files are zip archives of XML; this reads them without extra dependencies.
 */
import { inflateRawSync } from "node:zlib";

export type Prepared =
  | { kind: "pdf"; name: string; base64: string }
  | { kind: "image"; name: string; mime: string; base64: string }
  | { kind: "text"; name: string; text: string; from: "text" | "docx" | "xlsx" | "pptx" };

const TEXT_EXT = [
  "txt",
  "md",
  "csv",
  "tsv",
  "json",
  "xml",
  "html",
  "htm",
  "yaml",
  "yml",
  "log",
  "ini",
  "rtf",
];
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const LEGACY = ["doc", "xls", "ppt"];

export class UnsupportedFile extends Error {}

export async function prepareFile(file: File): Promise<Prepared> {
  const name = file.name || "file";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === "pdf" || file.type === "application/pdf")
    return { kind: "pdf", name, base64: Buffer.from(bytes).toString("base64") };
  if (IMAGE_MIME[ext])
    return {
      kind: "image",
      name,
      mime: IMAGE_MIME[ext],
      base64: Buffer.from(bytes).toString("base64"),
    };
  if (ext === "docx") return { kind: "text", name, from: "docx", text: docxText(unzip(bytes)) };
  if (ext === "xlsx" || ext === "xlsm")
    return { kind: "text", name, from: "xlsx", text: xlsxText(unzip(bytes)) };
  if (ext === "pptx") return { kind: "text", name, from: "pptx", text: pptxText(unzip(bytes)) };
  if (LEGACY.includes(ext))
    throw new UnsupportedFile(`${name}: old Office format. Save it as .${ext}x and try again.`);
  if (TEXT_EXT.includes(ext) || file.type.startsWith("text/"))
    return { kind: "text", name, from: "text", text: new TextDecoder().decode(bytes) };
  throw new UnsupportedFile(
    `${name}: file type .${ext} is not supported (use PDF, Word, Excel, PowerPoint, images or text).`,
  );
}

/* ---------- zip ---------- */
type Zip = Map<string, () => Uint8Array>;

function unzip(buf: Uint8Array): Zip {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory record: scan back from the end (it has a variable-length comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new UnsupportedFile("The file is not a valid Office document (no zip directory found).");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries: Zip = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method === 8) return new Uint8Array(inflateRawSync(data));
      throw new UnsupportedFile(`Unsupported compression in ${name}.`);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const read = (z: Zip, path: string) => {
  const e = z.get(path);
  return e ? new TextDecoder().decode(e()) : "";
};

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const tidy = (s: string) =>
  s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/* ---------- Word ---------- */
function docxText(z: Zip): string {
  const xml = read(z, "word/document.xml");
  if (!xml) throw new UnsupportedFile("No document text found in the Word file.");
  let out = "";
  let cellDepth = 0;
  const re =
    /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:tc[\s>]|<\/w:tc>|<\/w:tr>|<\/w:p>/g;
  for (const m of xml.matchAll(re)) {
    const tok = m[0];
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (tok === "<w:tab/>") out += "\t";
    else if (tok === "<w:br/>") out += "\n";
    else if (tok.startsWith("<w:tc")) cellDepth++;
    else if (tok === "</w:tc>") {
      cellDepth = Math.max(0, cellDepth - 1);
      out += " | ";
    } else if (tok === "</w:tr>") out += "\n";
    else if (tok === "</w:p>") out += cellDepth ? " " : "\n";
  }
  return tidy(out);
}

/* ---------- Excel ---------- */
const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const csvCell = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function xlsxText(z: Zip): string {
  const shared = [...read(z, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const rels = new Map(
    [
      ...read(z, "xl/_rels/workbook.xml.rels").matchAll(
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g,
      ),
    ].map((m) => [m[1], m[2]]),
  );
  const sheets = [
    ...read(z, "xl/workbook.xml").matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g),
  ].map((m) => ({ name: decodeXml(m[1]), target: rels.get(m[2]) ?? "" }));
  const parts: string[] = [];
  for (const sh of sheets) {
    const path = sh.target.startsWith("/")
      ? sh.target.slice(1)
      : `xl/${sh.target.replace(/^\.\//, "")}`;
    const xml = read(z, path);
    if (!xml) continue;
    const rows: string[] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const body = c[2] ?? "";
        let val = "";
        if (type === "s") val = shared[Number(/<v>([^<]*)<\/v>/.exec(body)?.[1])] ?? "";
        else if (type === "inlineStr")
          val = decodeXml(
            [...body.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => t[1]).join(""),
          );
        else val = decodeXml(/<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "");
        const i = ref ? colIndex(ref) : cells.length;
        while (cells.length < i) cells.push("");
        cells[i] = val;
      }
      if (cells.some((x) => x.trim())) rows.push(cells.map(csvCell).join(","));
      if (rows.length >= 5000) {
        rows.push("… (more rows not included)");
        break;
      }
    }
    if (rows.length) parts.push(`## Sheet: ${sh.name}\n${rows.join("\n")}`);
  }
  if (!parts.length) throw new UnsupportedFile("No data found in the Excel file.");
  return parts.join("\n\n");
}

/* ---------- PowerPoint ---------- */
function pptxText(z: Zip): string {
  const slides = [...z.keys()]
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const parts = slides.map((s, i) => {
    const xml = read(z, s);
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>/g)]
      .map((m) => (m[1] !== undefined ? decodeXml(m[1]) : "\n"))
      .join("");
    return `## Slide ${i + 1}\n${tidy(text)}`;
  });
  if (!parts.length) throw new UnsupportedFile("No slides found in the PowerPoint file.");
  return parts.join("\n\n");
}
