// Prints the CHANGELOG.md section of a version (used as GitHub release body).
// Usage: node scripts/changelog-section.mjs 0.1.11  -> section "## [0.1.11]" (falls back to "Unreleased").
import { readFileSync } from "node:fs";

const version = (process.argv[2] || "").replace(/^v/, "");
const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
function section(name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim().toLowerCase() === `## [${name}]`.toLowerCase());
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}
const body = section(version) || section("Unreleased");
process.stdout.write(body || "See the assets below to download and install JTech Browser.");
