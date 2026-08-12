/**
 * Auto-loads every model definition in this directory.
 *
 * Files starting with "_" are helpers and skipped. To add a model, copy an existing file,
 * edit it, and restart — nothing else references it by name.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PARAMS, buildPayload } from "./_schema.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".js") && !f.startsWith("_") && f !== "index.js")
  .sort();

const loaded = [];
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  if (!mod.default) throw new Error(`models/${f} has no default export`);
  loaded.push({ ...mod.default, file: f });
}

const seen = new Set();
for (const m of loaded) {
  if (seen.has(m.key)) throw new Error(`Duplicate model key "${m.key}" in models/${m.file}`);
  seen.add(m.key);
}

export const MODELS = loaded.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

export const byKey = (key) => MODELS.find((m) => m.key === key) || MODELS[0];

export const buildInput = (model, body, image_urls) => buildPayload(model, body, image_urls);

/** Registry + control vocabulary for the browser. */
export function publicRegistry() {
  return {
    params: PARAMS,
    models: MODELS.map(({ file, ...m }) => m),
  };
}
