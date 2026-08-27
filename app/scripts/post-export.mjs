/* Fixups applied to dist/ after `expo export --platform web`, shared by every
   deploy path (the Vercel Git build and the prebuilt CLI staging alike):
   - film/[id].html is copied to film/detail.html because bracket paths are
     unreliable as rewrite destinations; vercel.json points /film/:id there */
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(appRoot, "dist");

cpSync(join(dist, "film", "[id].html"), join(dist, "film", "detail.html"));

console.log("lore: post-export fixups applied → dist/");
