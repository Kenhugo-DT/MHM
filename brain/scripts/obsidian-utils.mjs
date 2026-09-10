import fs from "node:fs";
import path from "node:path";

export const ALLOWED_NODE_TYPES = new Set([
  "band",
  "guitarist",
  "artist",
  "guitar",
  "guitar_brand",
  "genre",
]);

export const EDITABLE_FIELDS = new Set([
  "zone",
  "aliases",
  "eraStart",
  "eraPeak",
  "primaryGenres",
  "secondaryZones",
  "layoutPinned",
  "layoutX",
  "layoutY",
  "starter",
]);

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function notePathFor(root, node) {
  return path.join(root, "entities", node.type, `${node.id}.md`);
}

export function entityFiles(root) {
  const entitiesRoot = path.join(root, "entities");
  if (!fs.existsSync(entitiesRoot)) return [];

  const files = [];
  const stack = [entitiesRoot];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "en"));
}

export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};

  const data = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    data[key] = parseYamlValue(value);
  }

  return data;
}

function parseYamlValue(value) {
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineArray(inner).map((item) => unquoteYaml(item.trim()));
  }
  return unquoteYaml(value);
}

function splitInlineArray(value) {
  const items = [];
  let current = "";
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "\"" || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "," && !quote) {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  items.push(current);
  return items;
}

function unquoteYaml(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, "\"").replace(/''/g, "'");
  }
  return value;
}

export function frontmatterBlock(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: ${formatYamlValue(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function formatYamlValue(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (Array.isArray(value)) {
    return `[${value.map((item) => quoteYaml(String(item))).join(", ")}]`;
  }
  return quoteYaml(String(value));
}

function quoteYaml(value) {
  if (!value) return "\"\"";
  if (/^[a-zA-Z0-9_./ -]+$/.test(value) && !/^(true|false|null|~)$/i.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export function coerceStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function coerceOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function keepEditable(existing = {}) {
  const kept = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.hasOwn(existing, key)) kept[key] = existing[key];
  }
  return kept;
}
