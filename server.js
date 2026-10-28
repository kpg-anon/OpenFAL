import express from "express";
import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, byKey, buildInput, publicRegistry } from "./models/index.js";
import { MEDIA } from "./models/_schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const OUT_DIR = path.join(__dirname, "outputs");

/* ------------------------------------------------------------------ env --- */

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function saveKeyToEnvFile(key) {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `FAL_KEY=${key}`;
  const next = /^\s*FAL_KEY\s*=.*$/m.test(existing)
    ? existing.replace(/^\s*FAL_KEY\s*=.*$/m, line)
    : (existing ? existing.replace(/\s*$/, "\n") : "") + line + "\n";
  fs.writeFileSync(ENV_PATH, next, "utf8");
}

const fileEnv = loadEnvFile();
let FAL_KEY = process.env.FAL_KEY || fileEnv.FAL_KEY || "";
const PORT = Number(process.env.PORT || fileEnv.PORT || 5178);

function applyKey(key) {
  FAL_KEY = key.trim();
  fal.config({ credentials: FAL_KEY });
}
if (FAL_KEY) applyKey(FAL_KEY);

/* ---------------------------------------------------------------- server --- */

const app = express();
// reference videos arrive as base64 data URIs inside the JSON body
app.use(express.json({ limit: "300mb" }));
app.use(express.static(path.join(__dirname, "public")));

const requireKey = (res) => {
  if (FAL_KEY) return true;
  res.status(400).json({ error: "No fal API key configured. Add it in the app header or in .env" });
  return false;
};

function falError(err, phase) {
  const detail = err?.body?.detail;
  const msg =
    (typeof detail === "string" && detail) ||
    (Array.isArray(detail) && detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ")) ||
    err?.message ||
    "Unknown error";
  // fal tags input-moderation rejections as content_policy_violation (422).
  const types = Array.isArray(detail) ? [...new Set(detail.map((d) => d.type).filter(Boolean))] : [];
  if (err?.status) console.error(`[${phase || "fal"}] ${err.status} ${msg}`);
  return { error: msg, status: err?.status, types, phase };
}

app.get("/api/config", (_req, res) => {
  res.json({
    hasKey: Boolean(FAL_KEY),
    keyHint: FAL_KEY ? FAL_KEY.slice(0, 8) + "…" : null,
    ...publicRegistry(),
  });
});

/**
 * Account credit balance.
 *
 * The documented endpoint (api.fal.ai/v1/account/billing) requires an *admin* key and 403s
 * for a normal one, so try it first and fall back to the alpha endpoint, which answers for
 * ordinary keys. Both are read-only.
 */
app.get("/api/balance", async (_req, res) => {
  if (!FAL_KEY) return res.status(400).json({ error: "No API key configured" });
  const headers = { Authorization: `Key ${FAL_KEY}` };
  try {
    const official = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", { headers });
    if (official.ok) {
      const j = await official.json();
      const bal = j?.credits?.current_balance;
      if (typeof bal === "number") {
        return res.json({ balance: bal, currency: j.credits.currency || "USD", source: "account/billing", username: j.username });
      }
    }
    const alpha = await fetch("https://rest.alpha.fal.ai/billing/user_balance", { headers });
    if (!alpha.ok) throw new Error(`balance lookup failed (${alpha.status})`);
    const raw = (await alpha.text()).trim();
    const balance = Number(raw.replace(/^"|"$/g, ""));
    if (!Number.isFinite(balance)) throw new Error("unparseable balance response");
    res.json({ balance, currency: "USD", source: "billing/user_balance" });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/key", (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key) return res.status(400).json({ error: "Empty key" });
  try {
    applyKey(key);
    if (req.body?.persist !== false) saveKeyToEnvFile(key);
    res.json({ ok: true, keyHint: key.slice(0, 8) + "…", persisted: req.body?.persist !== false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const EXT = { jpeg: "jpg", quicktime: "mov", mpeg: "mp3", "x-wav": "wav", "x-m4a": "m4a" };

/** data: URI -> uploaded fal storage URL. Plain http(s) URLs pass through. */
async function toRemoteUrl(entry, i) {
  const src = typeof entry === "string" ? entry : entry?.url;
  if (!src) throw new Error(`Reference ${i + 1} is empty`);
  if (/^https?:\/\//i.test(src)) return src;

  const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) throw new Error(`Reference ${i + 1} is not a URL or data URI`);
  const type = m[1] || "image/png";
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  const sub = type.split("/")[1] || "png";
  const ext = EXT[sub] || sub;
  const name = (typeof entry === "object" && entry.name) || `input-${i + 1}.${ext}`;
  return await fal.storage.upload(new File([buf], name, { type }));
}

app.post("/api/submit", async (req, res) => {
  if (!requireKey(res)) return;
  const b = req.body || {};
  const model = byKey(b.model);
  try {
    if (!String(b.prompt || "").trim()) throw new Error("Prompt is required");
    const entries = Array.isArray(b.refs) ? b.refs.filter(Boolean) : [];

    // grouped by media type, slot order kept within each group: the prompt says "Video 1"
    const refs = { image: [], video: [], audio: [] };
    for (const e of entries) {
      const media = refs[e.media] ? e.media : "image";
      const spec = model[MEDIA[media]];
      if (!spec) throw new Error(`${model.label} does not take ${media} references`);
      if (refs[media].length >= spec.max) throw new Error(`${model.label} takes at most ${spec.max} ${media} references`);
      refs[media].push(e);
    }
    if (refs.image.length < model.images.min) {
      throw new Error(`${model.label} needs at least ${model.images.min} input image`);
    }

    let n = 0;
    for (const media of Object.keys(refs)) {
      for (let i = 0; i < refs[media].length; i++) refs[media][i] = await toRemoteUrl(refs[media][i], n++);
    }

    const input = buildInput(model, b, refs);
    const { request_id } = await fal.queue.submit(model.id, { input });
    console.log(`[submit] ${model.id} ${request_id} ${JSON.stringify({ ...input, prompt: input.prompt.slice(0, 60) + "…" })}`);
    res.json({ requestId: request_id, model: model.key, modelId: model.id, input });
  } catch (err) {
    res.status(err?.status || 500).json(falError(err, "submit"));
  }
});

app.get("/api/status/:id", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const status = await fal.queue.status(byKey(req.query.model).id, { requestId: req.params.id, logs: true });
    res.json(status);
  } catch (err) {
    res.status(err?.status || 500).json(falError(err, "status"));
  }
});

app.get("/api/result/:id", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const result = await fal.queue.result(byKey(req.query.model).id, { requestId: req.params.id });
    res.json(result.data ?? result);
  } catch (err) {
    res.status(err?.status || 500).json(falError(err, "result"));
  }
});

app.post("/api/cancel/:id", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    await fal.queue.cancel(byKey(req.query.model).id, { requestId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(err?.status || 500).json(falError(err, "cancel"));
  }
});

/** Streams a result file through the local origin (CORS-free download / reuse as input). */
app.get("/api/fetch", async (req, res) => {
  const url = String(req.query.url || "");
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Bad url" });
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    res.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Saves a result file into ./outputs so runs survive fal's URL expiry. */
app.post("/api/save", async (req, res) => {
  const url = String(req.body?.url || "");
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Bad url" });
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ext = (url.split("?")[0].split(".").pop() || "png").slice(0, 4);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(OUT_DIR, `hywu-${stamp}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
    fs.writeFileSync(file, Buffer.from(await upstream.arrayBuffer()));
    res.json({ ok: true, path: file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  OpenFAL -> http://localhost:${PORT}`);
  for (const m of MODELS) {
    const s = m.safety.param ? `${m.safety.param}=${m.safety.value}` : "no safety param";
    console.log(`   · ${m.label.padEnd(30)} ${m.id.padEnd(38)} ${s}`);
  }
  console.log(FAL_KEY ? `\n  fal key: loaded (${FAL_KEY.slice(0, 8)}…)\n` : `\n  fal key: MISSING - set it in the app header or .env\n`);
});
