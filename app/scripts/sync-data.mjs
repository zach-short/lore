/* Copies the pipeline's site/data.json into the app:
   - public/data.json          → served same-origin on web (dev + static export)
   - src/lib/data/snapshot.json → bundled offline fallback for native
   Run `movienight all` (repo root) first to refresh the payload itself. */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(appRoot, "..", "site", "data.json");
const targets = [
  join(appRoot, "public", "data.json"),
  join(appRoot, "src", "lib", "data", "snapshot.json"),
];

if (!existsSync(source)) {
  console.error(
    `movienight: ${source} not found — run the pipeline first (uv run movienight all).`,
  );
  process.exit(1);
}

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

const kb = Math.round(statSync(source).size / 1024);
console.log(`movienight: synced data.json (${kb} KB) → public/ + snapshot`);
