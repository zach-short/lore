/* Copies the pipeline's site/data.json into the app:
   - public/data.json          → served same-origin on web (dev + static export)
   - src/lib/data/snapshot.json → bundled offline fallback for native
   Run `lore all` (repo root) first to refresh the payload itself. */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(appRoot, "..", "site", "data.json");
const targets = [
  join(appRoot, "public", "data.json"),
  join(appRoot, "src", "lib", "data", "snapshot.json"),
];

/* The Vercel Git build has no site/data.json — the pipeline's output is
   private and gitignored — so --optional downgrades the miss to a warning.
   Web then has no same-origin /data.json and reads the payload `lore publish`
   put in Supabase; native still carries whatever snapshot it was built with. */
if (!existsSync(source)) {
  if (process.argv.includes("--optional")) {
    console.warn(`lore: ${source} not found — skipping data sync.`);
    process.exit(0);
  }
  console.error(
    `lore: ${source} not found — run the pipeline first (uv run lore all).`,
  );
  process.exit(1);
}

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

const kb = Math.round(statSync(source).size / 1024);
console.log(`lore: synced data.json (${kb} KB) → public/ + snapshot`);
