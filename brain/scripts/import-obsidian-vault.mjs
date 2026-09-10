import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_NODE_TYPES,
  coerceOptionalNumber,
  coerceStringArray,
  entityFiles,
  parseFrontmatter,
} from "./obsidian-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const vaultRoot = path.join(brainRoot, "obsidian");
const outputPath = path.join(brainRoot, "data", "approved", "obsidian-overrides.json");

const overrides = [];
const warnings = [];

for (const filePath of entityFiles(vaultRoot)) {
  const frontmatter = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
  const id = String(frontmatter.id ?? "").trim();
  const type = String(frontmatter.type ?? "").trim();

  if (!id) {
    warnings.push(`Skipped note without id: ${filePath}`);
    continue;
  }
  if (!ALLOWED_NODE_TYPES.has(type)) {
    warnings.push(`Skipped ${id} with unsupported type "${type}".`);
    continue;
  }

  const layoutX = coerceOptionalNumber(frontmatter.layoutX);
  const layoutY = coerceOptionalNumber(frontmatter.layoutY);
  const eraStart = coerceOptionalNumber(frontmatter.eraStart);
  const eraPeak = coerceOptionalNumber(frontmatter.eraPeak);

  overrides.push({
    id,
    label: String(frontmatter.label ?? "").trim() || undefined,
    type,
    zone: String(frontmatter.zone ?? "").trim() || undefined,
    roles: coerceStringArray(frontmatter.roles),
    aliases: coerceStringArray(frontmatter.aliases),
    starter: typeof frontmatter.starter === "boolean" ? frontmatter.starter : undefined,
    eraStart,
    eraPeak,
    primaryGenres: coerceStringArray(frontmatter.primaryGenres),
    curatorTags: coerceStringArray(frontmatter.curatorTags),
    secondaryZones: coerceStringArray(frontmatter.secondaryZones),
    layoutHints: {
      pinned: Boolean(frontmatter.layoutPinned),
      x: layoutX,
      y: layoutY,
    },
  });
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "brain/obsidian",
  nodes: overrides.sort((a, b) => a.id.localeCompare(b.id, "en")),
  warnings,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(JSON.stringify({
  importedNotes: overrides.length,
  warnings,
  outputPath,
}, null, 2));
