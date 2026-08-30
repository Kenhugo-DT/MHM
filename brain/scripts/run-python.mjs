import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [, , scriptPath, ...scriptArgs] = process.argv;

if (!scriptPath) {
  console.error("Usage: node brain/scripts/run-python.mjs <script.py | -m module> [...args]");
  process.exit(1);
}

const candidates = [
  ...(process.env.PYTHON ? [{ command: process.env.PYTHON, args: [] }] : []),
  {
    command: path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      process.platform === "win32" ? "python.exe" : "bin/python",
    ),
    args: [],
  },
  { command: "python3", args: [] },
  { command: "python", args: [] },
  { command: "py", args: ["-3"] },
];

for (const candidate of candidates) {
  if (candidate.command.includes(path.sep) && !fs.existsSync(candidate.command)) {
    continue;
  }

  const result = spawnSync(candidate.command, [...candidate.args, scriptPath, ...scriptArgs], {
    stdio: "inherit",
    shell: false,
  });

  if (result.error?.code === "ENOENT") {
    continue;
  }

  if (typeof result.status === "number") {
    process.exit(result.status);
  }

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
}

console.error(
  [
    "Could not find Python.",
    "Install Python 3.12+ or set the PYTHON environment variable to a Python executable.",
    "Example: PYTHON=/path/to/python npm run brain:process-inbox",
  ].join("\n"),
);
process.exit(1);
