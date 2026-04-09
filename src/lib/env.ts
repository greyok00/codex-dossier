import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/u);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = stripWrappingQuotes(rawValue);
  }
}

export function loadNodeEnv(cwd = process.cwd()) {
  const candidates = [resolve(cwd, ".env"), resolve(cwd, ".env.local")];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      parseEnvFile(filePath);
    }
  }
}
