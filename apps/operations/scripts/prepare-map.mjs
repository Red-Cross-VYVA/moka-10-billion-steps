import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dist = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
const destination = new URL("../public/maplibre/", import.meta.url);
await mkdir(destination, { recursive: true });
// MapLibre 6 uses a separate module worker. Serve its packaged files unchanged
// from the same origin instead of relying on bundlers rewriting import.meta.url.
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
  await copyFile(join(dist, name), new URL(name, destination));
