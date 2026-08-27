/* Stages dist/ into .deploy/lore for a prebuilt Vercel deploy — the manual
   escape hatch next to the Vercel Git build, which runs `vercel-build` from
   the repo-root vercel.json instead. Routing config has one source of truth
   (that same vercel.json); the build fields are stripped on the way in,
   because the staging dir is already built and must not be rebuilt.
   Run via `bun run deploy:web` (export → stage → vercel deploy --prod). */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(appRoot, "dist");
const stage = join(appRoot, ".deploy", "lore");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(dist, stage, { recursive: true });

/* Expo exports font assets under assets/node_modules/…, which Vercel's
   default ignore list would silently drop — un-ignore them explicitly. */
writeFileSync(
  join(stage, ".vercelignore"),
  "!assets/node_modules\n!assets/node_modules/**\n",
);

const { installCommand, buildCommand, outputDirectory, ...routing } = JSON.parse(
  readFileSync(join(appRoot, "..", "vercel.json"), "utf8"),
);
writeFileSync(
  join(stage, "vercel.json"),
  JSON.stringify(routing, null, 2) + "\n",
);

/* Pin the deploy to the existing project by id (ids survive a project rename,
   the dir name does not — without this, `--yes` would read the staging dir's
   name as a project name and create a second project). Not secrets: the same
   values the Vercel CLI writes when it links a directory. */
mkdirSync(join(stage, ".vercel"), { recursive: true });
writeFileSync(
  join(stage, ".vercel", "project.json"),
  JSON.stringify(
    {
      projectId: "prj_fr2HUgeadfK4aS4sLDSp8rhTyTtb",
      orgId: "team_si9uvTEwRwmnkCLygC9wtC5Y",
    },
    null,
    2,
  ) + "\n",
);

console.log(`lore: staged web deploy → ${stage}`);
