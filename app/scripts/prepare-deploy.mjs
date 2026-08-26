/* Stages dist/ into .deploy/movienight for a prebuilt Vercel deploy:
   - the staging dir's *name* becomes the Vercel project name on first deploy
   - film/[id].html is copied to film/detail.html because bracket paths are
     unreliable as rewrite destinations; vercel.json points /film/:id there
   Run via `bun run deploy:web` (export → stage → vercel deploy --prod). */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(appRoot, "dist");
const stage = join(appRoot, ".deploy", "movienight");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(dist, stage, { recursive: true });
cpSync(join(stage, "film", "[id].html"), join(stage, "film", "detail.html"));

/* Expo exports font assets under assets/node_modules/…, which Vercel's
   default ignore list would silently drop — un-ignore them explicitly. */
writeFileSync(
  join(stage, ".vercelignore"),
  "!assets/node_modules\n!assets/node_modules/**\n",
);

writeFileSync(
  join(stage, "vercel.json"),
  JSON.stringify(
    {
      cleanUrls: true,
      trailingSlash: false,
      /* destination is the cleanUrls path — .html there 308s and breaks the rewrite */
      rewrites: [{ source: "/film/:id", destination: "/film/detail" }],
    },
    null,
    2,
  ) + "\n",
);

console.log(`movienight: staged web deploy → ${stage}`);
