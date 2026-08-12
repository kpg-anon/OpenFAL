/* OpenFAL -- talks only to the local server, never to fal directly. */

const $ = (id) => document.getElementById(id);
const HIST_KEY = "openfal.history";
const FORM_KEY = "openfal.form";

let MAX_SLOTS = 3;

const state = {
  slots: [null, null, null],   // { src, name, kind: 'data'|'url', w, h }
  models: [],
  paramSpecs: {},              // the PARAMS vocabulary from models/_schema.js
  paramEls: {},                // name -> { el, spec } for the controls on screen
  model: null,
  requestId: null,
  polling: null,
  startedAt: 0,
  ticker: null,
  lastInput: null,
  lastModelKey: null,
};

const qModel = () => `model=${encodeURIComponent(state.model?.key || "")}`;

/* --------------------------------------------------------------- toasts -- */

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, kind === "err" ? 6000 : 2600);
  setTimeout(() => el.remove(), kind === "err" ? 6400 : 3000);
}

/* ------------------------------------------------------------- api key -- */

async function refreshConfig() {
  try {
    const cfg = await (await fetch("/api/config")).json();
    if (!cfg.hasKey) {
      $("keyPanel").hidden = false;
      $("keyBtn").textContent = "Set API key";
    } else {
      $("keyBtn").textContent = `key ${cfg.keyHint}`;
    }
    state.models = cfg.models || [];
    state.paramSpecs = cfg.params || {};
    renderTabs();
    const saved = readForm().model;
    applyModel(state.models.some((m) => m.key === saved) ? saved : state.models[0]?.key);
    loadForm();
    sizeCtl.refresh();
    syncJson();
    if (cfg.hasKey) refreshBalance();
  } catch {
    toast("Local server unreachable", "err");
  }
}

$("keyBtn").onclick = () => { $("keyPanel").hidden = !$("keyPanel").hidden; $("keyInput").focus(); };

$("keySave").onclick = async () => {
  const key = $("keyInput").value.trim();
  if (!key) return;
  const r = await fetch("/api/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const j = await r.json();
  if (!r.ok) return toast(j.error || "Could not save key", "err");
  $("keyInput").value = "";
  $("keyPanel").hidden = true;
  $("keyBtn").textContent = `key ${j.keyHint}`;
  toast("API key saved to .env", "ok");
  refreshBalance();
};
$("keyInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("keySave").click(); });

/* -------------------------------------------------------------- balance -- */

async function refreshBalance() {
  const b = $("balance");
  b.textContent = "…";
  b.className = "ghost balance";
  try {
    const r = await fetch("/api/balance");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "unavailable");
    b.textContent = `$${j.balance.toFixed(2)}`;
    b.title = `fal credit balance (${j.source})${j.username ? " · " + j.username : ""} — click to refresh`;
    if (j.balance < 5) b.classList.add("low");
  } catch (err) {
    b.textContent = "balance n/a";
    b.className = "ghost balance err";
    b.title = String(err.message);
  }
}
$("balance").onclick = refreshBalance;

/* --------------------------------------------------------------- models -- */

function renderTabs() {
  const bar = $("tabs");
  bar.innerHTML = "";
  for (const m of state.models) {
    const b = document.createElement("button");
    b.className = "tab";
    b.dataset.key = m.key;
    b.type = "button";
    // pip marks where moderation lives, not how permissive a model is
    const pip = m.safety.kind === "off" ? "" : m.hosting === "partner" && m.key === "nano-banana" ? "gated" : "dial";
    b.innerHTML = `<span class="pip ${pip}"></span>${m.label}`;
    b.title = `${m.id}\n${m.blurb}`;
    b.onclick = () => { applyModel(m.key); saveForm(); };
    bar.appendChild(b);
  }
}

function applyModel(key) {
  const m = state.models.find((x) => x.key === key) || state.models[0];
  if (!m) return;
  state.model = m;

  for (const t of $("tabs").children) t.classList.toggle("on", t.dataset.key === m.key);
  $("modelId").textContent = m.id;

  const badge = $("safetyBadge");
  if (m.safety.kind === "off") {
    badge.className = "badge badge-off";
    badge.textContent = "safety checker: off";
    badge.title = "enable_safety_checker is sent as false, applied server-side";
  } else {
    badge.className = "badge badge-dial";
    badge.textContent = `safety_tolerance: ${m.safety.value}`;
    badge.title = "Partner-served: no enable_safety_checker exists. This dial only relaxes fal's side.";
  }
  const cls = m.safety.kind === "off" ? "" : (m.key === "nano-banana" ? "gated" : "dial");
  $("modelNote").className = "model-note " + cls;
  $("modelNote").innerHTML = `<b>${escapeHtml(m.label)}</b> — ${escapeHtml(m.blurb)}<br>${escapeHtml(m.note)}`;
  $("safetyRow").innerHTML = `<div class="safety-line">sends <b>${m.safety.param}</b>:
    <span class="val-${m.safety.kind}">${m.safety.value}</span>
    <span class="muted">· ${m.hosting === "fal" ? "fal-hosted weights" : "partner-served"}</span></div>`;

  MAX_SLOTS = m.images.max;
  state.slots.length = MAX_SLOTS;
  for (let i = 0; i < MAX_SLOTS; i++) if (!state.slots[i]) state.slots[i] = null;
  $("slotHint").textContent = m.images.max === 1
    ? "1 image · drag, click or paste"
    : `up to ${m.images.max} images · drag, click or paste`;
  renderSlots();

  renderParams(m);
  restoreParams(m.key);

  const dims = m.size.kind === "dims";
  $("sizeBlock").hidden = !dims;
  $("aspectField").hidden = dims;
  if (dims) {
    for (const b of $("sizeMode").children) b.hidden = !m.size.modes.includes(b.dataset.mode);
    if (!m.size.modes.includes(sizeCtl.mode)) sizeCtl.setMode(m.size.modes[0]);
  } else {
    const sel = $("aspect_ratio");
    sel.innerHTML = m.size.options.map((o) => `<option value="${o}">${o || "match input"}</option>`).join("");
    sel.value = readForm().aspectByModel?.[m.key] ?? m.size.default ?? m.size.options[0];
  }

  sizeCtl.refresh();
  syncJson();
}

/* ------------------------------------------------- generated parameters -- */

function renderParams(model) {
  const box = $("dynParams");
  box.innerHTML = "";
  state.paramEls = {};

  for (const name of model.params) {
    const spec = state.paramSpecs[name];
    if (!spec) continue;
    const dflt = model.defaults?.[name] ?? spec.default;
    const wrap = document.createElement(spec.type === "toggle" ? "div" : "label");
    wrap.className = "field" + (spec.type === "text" ? " wide" : "");
    let el;

    if (spec.type === "range") {
      wrap.innerHTML = `<span class="field-label">${spec.label} <output></output></span>
        <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}">`;
      el = wrap.querySelector("input");
      const out = wrap.querySelector("output");
      el.value = dflt;
      const paint = () => { out.value = spec.decimals ? Number(el.value).toFixed(spec.decimals) : el.value; };
      paint();
      el.addEventListener("input", () => { paint(); onParamChange(); });

    } else if (spec.type === "select") {
      wrap.innerHTML = `<span class="field-label">${spec.label}</span><select></select>`;
      el = wrap.querySelector("select");
      el.innerHTML = spec.options.map((o) => `<option value="${o}">${o}</option>`).join("");
      el.value = dflt;
      el.addEventListener("change", onParamChange);

    } else if (spec.type === "text") {
      wrap.innerHTML = `<span class="field-label">${spec.label}</span>
        <input type="text" spellcheck="false" placeholder="${spec.placeholder || ""}">`;
      el = wrap.querySelector("input");
      el.value = dflt || "";
      el.addEventListener("input", onParamChange);

    } else if (spec.type === "toggle") {
      wrap.innerHTML = `<span class="field-label">${spec.label}</span>
        <label class="switch"><input type="checkbox">
        <span>enabled ${spec.hint ? `<span class="muted small">(${spec.hint})</span>` : ""}</span></label>`;
      el = wrap.querySelector("input");
      el.checked = Boolean(dflt);
      el.addEventListener("change", onParamChange);
    }

    if (el) { state.paramEls[name] = { el, spec }; box.appendChild(wrap); }
  }
}

function onParamChange() { sizeCtl.refresh(); syncJson(); saveForm(); }

function paramValues() {
  const out = {};
  for (const [name, { el, spec }] of Object.entries(state.paramEls)) {
    out[name] = spec.type === "toggle" ? el.checked
      : spec.type === "range" ? Number(el.value)
      : el.value;
  }
  return out;
}

function setParam(name, value) {
  const p = state.paramEls[name];
  if (!p || value === undefined || value === null) return;
  if (p.spec.type === "toggle") p.el.checked = Boolean(value);
  else p.el.value = value;
  const out = p.el.parentElement?.querySelector("output");
  if (out) out.value = p.spec.decimals ? Number(p.el.value).toFixed(p.spec.decimals) : p.el.value;
}

function restoreParams(modelKey) {
  const saved = readForm().paramsByModel?.[modelKey];
  if (saved) for (const [k, v] of Object.entries(saved)) setParam(k, v);
}

/** Convenience for the couple of places that care about a specific control. */
const paramVal = (name, dflt) => (state.paramEls[name] ? paramValues()[name] : dflt);

/* --------------------------------------------------------------- slots -- */

function renderSlots() {
  const wrap = $("slots");
  wrap.innerHTML = "";
  for (let i = 0; i < MAX_SLOTS; i++) {
    const s = state.slots[i];
    const el = document.createElement("div");
    el.className = "slot" + (s ? " filled" : "");
    el.dataset.i = String(i);
    el.innerHTML = s
      ? `<img src="${s.kind === "url" ? "/api/fetch?url=" + encodeURIComponent(s.src) : s.src}" alt="">
         <span class="tag">image ${i + 1}</span>
         <button class="kill" title="Remove">✕</button>`
      : `<div class="ph"><b>+</b>image ${i + 1}</div>`;

    if (!s) el.onclick = () => pickFile(i);
    const kill = el.querySelector(".kill");
    if (kill) kill.onclick = (e) => { e.stopPropagation(); setSlot(i, null); };

    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("drag");
      await handleDrop(e, i);
    });

    wrap.appendChild(el);
  }
}

function pickFile(i) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = async () => { if (inp.files[0]) await setSlotFromFile(i, inp.files[0]); };
  inp.click();
}

async function handleDrop(e, i) {
  const file = [...(e.dataTransfer.files || [])].find((f) => f.type.startsWith("image/"));
  if (file) return setSlotFromFile(i, file);
  const text = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || "").trim();
  if (/^https?:\/\//i.test(text)) setSlot(i, { src: text, name: text.split("/").pop(), kind: "url" });
}

/** Single entry point for filling a slot: renders, then measures for the size panel. */
function setSlot(i, slot) {
  state.slots[i] = slot;
  renderSlots();
  syncJson();
  if (slot && (!slot.w || !slot.h)) {
    const img = new Image();
    img.onload = () => {
      slot.w = img.naturalWidth;
      slot.h = img.naturalHeight;
      if (state.slots[i] === slot) sizeCtl.onBaseChange();
    };
    img.src = slot.kind === "url" ? "/api/fetch?url=" + encodeURIComponent(slot.src) : slot.src;
  } else {
    sizeCtl.onBaseChange();
  }
}

function firstEmpty() {
  const i = state.slots.findIndex((s) => !s);
  return i === -1 ? 0 : i;
}

async function setSlotFromFile(i, file) {
  if (file.size > 24 * 1024 * 1024) return toast("Image is over 24 MB — please shrink it first", "err");
  const src = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  setSlot(i, { src, name: file.name || `image-${i + 1}.png`, kind: "data" });
}

document.addEventListener("paste", async (e) => {
  // An image on the clipboard always fills a slot, even while the prompt has focus.
  const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
  if (item) {
    e.preventDefault();
    return setSlotFromFile(firstEmpty(), item.getAsFile());
  }
  const inField = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  const txt = (e.clipboardData?.getData("text") || "").trim();
  if (inField || !/^https?:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(txt)) return;
  e.preventDefault();
  setSlot(firstEmpty(), { src: txt, name: txt.split("/").pop(), kind: "url" });
});

/* ----------------------------------------------------------- size panel -- */

const PRESET_DIMS = {
  square_hd: [1024, 1024], square: [512, 512],
  portrait_4_3: [768, 1024], portrait_16_9: [576, 1024],
  landscape_4_3: [1024, 768], landscape_16_9: [1024, 576],
};
const MIN_PX = 256, MAX_PX = 4096;

const sizeCtl = {
  mode: "auto",
  lockAR: false,          // off by default: typing an exact W and H should not fight itself
  ratio: 1024 / 1536,

  base() {
    const s = state.slots.find(Boolean);
    return s && s.w && s.h ? { w: s.w, h: s.h } : null;
  },

  maxPx() { return state.model?.size?.max || MAX_PX; },

  snapTo(v) {
    const step = Number($("snap").value) || 1;
    return Math.max(MIN_PX, Math.min(this.maxPx(), Math.round(v / step) * step));
  },

  applyCap(w, h) {
    if (!$("capOn").checked) return [w, h];
    const cap = Math.max(MIN_PX, Math.min(this.maxPx(), Number($("capPx").value) || this.maxPx()));
    const side = $("capSide").value;
    const measured = side === "height" ? h : side === "width" ? w : Math.max(w, h);
    if (measured <= cap) return [w, h];
    const f = cap / measured;
    return [w * f, h * f];
  },

  derive() {
    const base = this.base();
    if (!base) return;
    const scale = Number($("scale").value);
    let [w, h] = this.applyCap(base.w * scale, base.h * scale);
    $("out_w").value = this.snapTo(w);
    $("out_h").value = this.snapTo(h);
    this.ratio = base.w / base.h;
  },

  normalize() {
    let w = Number($("out_w").value) || 1024;
    let h = Number($("out_h").value) || 1024;
    [w, h] = this.applyCap(w, h);
    $("out_w").value = this.snapTo(w);
    $("out_h").value = this.snapTo(h);
  },

  setMode(mode) {
    this.mode = mode;
    for (const b of $("sizeMode").children) b.classList.toggle("on", b.dataset.mode === mode);
    $("sizePreset").hidden = mode !== "preset";
    $("customSize").hidden = mode !== "custom";
    if (mode === "custom" && $("linkInput").checked) this.derive();
    this.refresh();
  },

  onBaseChange() {
    if (this.mode === "custom" && $("linkInput").checked) this.derive();
    this.refresh();
  },

  effective() {
    if (state.model?.size?.kind === "aspect") return null;
    if (this.mode === "custom") return { w: Number($("out_w").value), h: Number($("out_h").value), exact: true };
    if (this.mode === "preset") {
      const [w, h] = PRESET_DIMS[$("sizePreset").value] || [1024, 1024];
      return { w, h, exact: true };
    }
    const base = this.base();
    return base ? { w: base.w, h: base.h, exact: false } : null;
  },

  refresh() {
    const base = this.base();
    $("baseDims").textContent = base ? `(${base.w}×${base.h})` : "(no image yet)";
    $("scaleOut").value = Number($("scale").value).toFixed(2) + "×";
    $("scaleRow").style.display = $("linkInput").checked ? "" : "none";
    $("lockAR").classList.toggle("on", this.lockAR);
    for (const id of ["out_w", "out_h"]) $(id).step = Number($("snap").value);

    const eff = this.effective();
    const hint = $("sizeHint");
    if (this.mode === "custom" && eff) {
      const cap = $("capOn").checked ? Number($("capPx").value) : null;
      const capped = cap && (($("capSide").value === "long" && Math.max(eff.w, eff.h) >= cap) ||
                             ($("capSide").value === "height" && eff.h >= cap) ||
                             ($("capSide").value === "width" && eff.w >= cap));
      const ar = eff.h ? (eff.w / eff.h) : 1;
      const orient = ar > 1.02 ? "landscape" : ar < 0.98 ? "portrait" : "square";
      const floor = state.model?.size?.minArea;
      const tiny = floor && eff.w * eff.h < floor;
      hint.innerHTML = (base
        ? `${base.w}×${base.h} → <b>${eff.w}×${eff.h}</b> ${orient}`
        : `<b>${eff.w}×${eff.h}</b> ${orient} · add an image to scale from it`)
        + (capped ? ' <span class="warn">· capped</span>' : "")
        + (tiny ? `<br><span class="warn">under this model's ~${(floor / 1e6).toFixed(2)} MP floor — it will return a larger image</span>` : "");
    } else {
      hint.textContent = "";
    }

    const cost = costLabel(eff);
    $("sizeCost").value = cost;
    $("runCost").textContent = cost ? `estimated ${cost.replace(/^.*· /, "")} per run` : "";
  },
};

/** Cost line: per-megapixel for models priced that way, otherwise per image. */
function costLabel(eff) {
  const m = state.model;
  if (!m) return "";
  const n = paramVal("num_images", 1) || 1;
  const p = m.pricing || {};
  if (p.mp) {
    if (!eff) return "";
    const mp = (eff.w * eff.h) / 1e6;
    const rate = paramVal("thinking", false) ? (p.mpThinking || p.mp) : p.mp;
    return `${mp.toFixed(2)} MP · ${eff.exact ? "" : "~"}$${(mp * rate * n).toFixed(2)}`;
  }
  if (p.perImage) return `$${(p.perImage * n).toFixed(2)}`;
  return "";
}

$("sizeMode").onclick = (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b) return;
  sizeCtl.setMode(b.dataset.mode);
  syncJson(); saveForm();
};

$("sizePreset").onchange = () => { sizeCtl.refresh(); syncJson(); saveForm(); };
$("aspect_ratio").onchange = () => { syncJson(); saveForm(); };

$("linkInput").onchange = () => {
  if ($("linkInput").checked) sizeCtl.derive();
  sizeCtl.refresh(); syncJson(); saveForm();
};

$("scale").oninput = () => {
  if (!$("linkInput").checked) $("linkInput").checked = true;
  sizeCtl.derive(); sizeCtl.refresh(); syncJson(); saveForm();
};

$("matchInput").onclick = () => {
  $("scale").value = 1;
  $("linkInput").checked = true;
  sizeCtl.derive(); sizeCtl.refresh(); syncJson(); saveForm();
};

for (const id of ["out_w", "out_h"]) {
  $(id).addEventListener("input", () => {
    $("linkInput").checked = false;
    if (sizeCtl.lockAR) {
      const v = Number($(id).value);
      if (v > 0) {
        if (id === "out_w") $("out_h").value = Math.round(v / sizeCtl.ratio);
        else $("out_w").value = Math.round(v * sizeCtl.ratio);
      }
    }
    sizeCtl.refresh(); syncJson(); saveForm();
  });
  $(id).addEventListener("change", () => { sizeCtl.normalize(); sizeCtl.refresh(); syncJson(); saveForm(); });
}

$("lockAR").onclick = () => {
  sizeCtl.lockAR = !sizeCtl.lockAR;
  const w = Number($("out_w").value), h = Number($("out_h").value);
  if (sizeCtl.lockAR && w && h) sizeCtl.ratio = w / h;
  sizeCtl.refresh(); saveForm();
};

$("swapWH").onclick = () => {
  const w = $("out_w").value;
  $("out_w").value = $("out_h").value;
  $("out_h").value = w;
  $("linkInput").checked = false;
  sizeCtl.ratio = 1 / (sizeCtl.ratio || 1);
  sizeCtl.refresh(); syncJson(); saveForm();
};

for (const id of ["capOn", "capSide", "capPx", "snap"]) {
  $(id).addEventListener("change", () => {
    if ($("linkInput").checked) sizeCtl.derive(); else sizeCtl.normalize();
    sizeCtl.refresh(); syncJson(); saveForm();
  });
}

/** Restores the size panel from an image_size value (string preset or {width,height}). */
function applySizeFromInput(v) {
  if (v && typeof v === "object" && v.width && v.height) {
    $("out_w").value = v.width;
    $("out_h").value = v.height;
    $("linkInput").checked = false;
    sizeCtl.ratio = v.width / v.height;
    sizeCtl.setMode("custom");
  } else if (typeof v === "string" && PRESET_DIMS[v]) {
    $("sizePreset").value = v;
    sizeCtl.setMode("preset");
  } else {
    sizeCtl.setMode("auto");
  }
}

function imageSizeValue() {
  if (sizeCtl.mode === "preset") return $("sizePreset").value;
  if (sizeCtl.mode === "custom") {
    return { width: Number($("out_w").value) || 1024, height: Number($("out_h").value) || 1024 };
  }
  return "auto";
}

/* ---------------------------------------------------------------- form -- */

for (const id of ["prompt", "seed"]) {
  $(id).addEventListener("input", () => { syncJson(); saveForm(); });
}

$("seedDice").onclick = () => { $("seed").value = Math.floor(Math.random() * 2 ** 31); syncJson(); saveForm(); };
$("seedClear").onclick = () => { $("seed").value = ""; syncJson(); saveForm(); };

$("presets").onclick = (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  $("prompt").value = b.dataset.p;
  $("prompt").focus();
  syncJson(); saveForm();
};

/** Mirrors models/_schema.js buildPayload so the preview matches what gets sent. */
function buildInput() {
  const m = state.model;
  if (!m) return {};
  const imgs = state.slots.filter(Boolean).map((s) => (s.kind === "url" ? s.src : `<${s.name}>`));

  const input = { prompt: $("prompt").value.trim() };
  if (m.images.field === "image_url") input.image_url = imgs[0];
  else input.image_urls = imgs.slice(0, m.images.max);

  if (m.size.kind === "aspect") {
    const ar = $("aspect_ratio").value;
    if (ar) input.aspect_ratio = ar;
  } else {
    input.image_size = imageSizeValue();
  }

  const vals = paramValues();
  for (const name of m.params) {
    const spec = state.paramSpecs[name];
    if (!spec) continue;
    let v = vals[name];
    if (spec.type === "text") {
      v = String(v || "").trim();
      if (!v && spec.omitIfEmpty) continue;
    }
    input[spec.field] = v;
  }

  input[m.safety.param] = m.safety.value;

  const seed = $("seed").value.trim();
  if (seed !== "") input.seed = Number(seed);
  return input;
}

function syncJson() { $("reqJson").textContent = JSON.stringify(buildInput(), null, 2); }

function readForm() {
  try { return JSON.parse(localStorage.getItem(FORM_KEY) || "{}"); } catch { return {}; }
}

function saveForm() {
  const prev = readForm();
  const key = state.model?.key;
  localStorage.setItem(FORM_KEY, JSON.stringify({
    ...prev,
    model: key,
    prompt: $("prompt").value,
    seed: $("seed").value,
    paramsByModel: { ...(prev.paramsByModel || {}), ...(key ? { [key]: paramValues() } : {}) },
    aspectByModel: { ...(prev.aspectByModel || {}), ...(key ? { [key]: $("aspect_ratio").value } : {}) },
    size: {
      mode: sizeCtl.mode,
      preset: $("sizePreset").value,
      w: $("out_w").value, h: $("out_h").value,
      link: $("linkInput").checked, scale: $("scale").value,
      capOn: $("capOn").checked, capSide: $("capSide").value, capPx: $("capPx").value,
      snap: $("snap").value, lockAR: sizeCtl.lockAR,
    },
  }));
}

function loadForm() {
  const f = readForm();
  if (f.prompt) $("prompt").value = f.prompt;
  if (f.seed) $("seed").value = f.seed;
  const s = f.size || {};
  if (s.preset) $("sizePreset").value = s.preset;
  if (s.w) $("out_w").value = s.w;
  if (s.h) $("out_h").value = s.h;
  if (typeof s.link === "boolean") $("linkInput").checked = s.link;
  if (s.scale) $("scale").value = s.scale;
  if (typeof s.capOn === "boolean") $("capOn").checked = s.capOn;
  if (s.capSide) $("capSide").value = s.capSide;
  if (s.capPx) $("capPx").value = s.capPx;
  if (s.snap) $("snap").value = s.snap;
  if (typeof s.lockAR === "boolean") sizeCtl.lockAR = s.lockAR;
  const w = Number($("out_w").value), h = Number($("out_h").value);
  if (w && h) sizeCtl.ratio = w / h;
  if (state.model?.size?.kind !== "aspect") {
    const modes = state.model?.size?.modes;
    let mode = s.mode || "auto";
    if (modes && !modes.includes(mode)) mode = modes[0];
    sizeCtl.setMode(mode);
  }
}

/* ----------------------------------------------------------------- run -- */

function setStatus(text, cls) {
  const p = $("statusPill");
  p.textContent = text;
  p.className = "pill " + cls;
}

function startTicker() {
  state.startedAt = Date.now();
  clearInterval(state.ticker);
  state.ticker = setInterval(() => {
    const s = ((Date.now() - state.startedAt) / 1000).toFixed(1);
    $("timer").textContent = `${s}s`;
    const tick = document.querySelector(".working .tick");
    if (tick) tick.textContent = `${s}s elapsed`;
  }, 100);
}
function stopTicker() { clearInterval(state.ticker); state.ticker = null; }

function showWorking(label) {
  $("stage").className = "stage";
  $("stage").innerHTML = `<div class="working"><div class="spinner"></div><div>${label}</div><div class="tick">0.0s elapsed</div></div>`;
}

function busy(on) {
  $("run").disabled = on;
  $("run").textContent = on ? "Running…" : "Run edit";
  $("cancel").hidden = !on;
}

$("run").onclick = async () => {
  const images = state.slots.filter(Boolean);
  if (!$("prompt").value.trim()) return toast("Write a prompt first", "err");
  if (images.length < (state.model?.images.min ?? 1)) return toast("Add at least one input image", "err");
  state.lastModelKey = state.model.key;

  busy(true);
  setStatus("uploading", "queued");
  $("meta").hidden = true;
  $("logBox").hidden = true;
  $("logs").textContent = "";
  showWorking("Uploading images…");
  startTicker();

  try {
    const body = {
      model: state.model.key,
      prompt: $("prompt").value.trim(),
      images: images.map((s) => ({ url: s.src, name: s.name })),
      image_size: imageSizeValue(),
      aspect_ratio: $("aspect_ratio").value,
      params: paramValues(),
      seed: $("seed").value.trim() === "" ? null : Number($("seed").value),
    };
    const r = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) return fail(j.error || `Submit failed (${r.status})`, j);

    state.requestId = j.requestId;
    state.lastInput = j.input;
    $("reqJson").textContent = JSON.stringify(j.input, null, 2);
    showWorking("Queued…");
    poll();
  } catch (err) {
    fail(err.message);
  }
};

$("cancel").onclick = async () => {
  if (!state.requestId) return;
  clearTimeout(state.polling);
  try { await fetch(`/api/cancel/${state.requestId}?${qModel()}`, { method: "POST" }); } catch { /* ignore */ }
  stopTicker();
  busy(false);
  setStatus("cancelled", "error");
  $("stage").innerHTML = `<div class="empty"><div class="empty-art">✋</div><p>Run cancelled.</p></div>`;
  state.requestId = null;
};

function poll() {
  state.polling = setTimeout(async () => {
    if (!state.requestId) return;
    try {
      const r = await fetch(`/api/status/${state.requestId}?${qModel()}`);
      const s = await r.json();
      if (!r.ok) return fail(s.error || "Status check failed", s);

      if (Array.isArray(s.logs) && s.logs.length) {
        $("logBox").hidden = false;
        $("logs").textContent = s.logs.map((l) => l.message).join("\n");
        $("logs").scrollTop = $("logs").scrollHeight;
      }

      const label = document.querySelector(".working div:nth-child(2)");
      if (s.status === "IN_QUEUE") {
        setStatus(`queued${s.queue_position != null ? " #" + s.queue_position : ""}`, "queued");
        if (label) label.textContent = s.queue_position != null ? `In queue (position ${s.queue_position})…` : "Queued…";
      } else if (s.status === "IN_PROGRESS") {
        setStatus("running", "running");
        if (label) label.textContent = paramVal("thinking", false) ? "Thinking + diffusing…" : "Diffusing…";
      } else if (s.status === "COMPLETED") {
        return finish();
      } else {
        throw new Error(`Unexpected status: ${s.status}`);
      }
      poll();
    } catch (err) {
      fail(err.message);
    }
  }, 1500);
}

async function finish() {
  try {
    const r = await fetch(`/api/result/${state.requestId}?${qModel()}`);
    const data = await r.json();
    if (!r.ok) return fail(data.error || "Could not fetch result", data);
    stopTicker();
    busy(false);
    setStatus("done", "done");
    renderResult(data);
    pushHistory(data);
    state.requestId = null;
    refreshBalance();
  } catch (err) {
    fail(err.message);
  }
}

function fail(msg, info) {
  clearTimeout(state.polling);
  stopTicker();
  busy(false);
  state.requestId = null;
  setStatus("error", "error");

  // fal moderates *inputs* at its gateway (422 content_policy_violation), a different layer
  // from any model's own output checker. Spell that out so the two don't get confused.
  const moderated = info?.types?.includes("content_policy_violation") ||
    /flagged by a content checker/i.test(msg);
  const note = moderated
    ? `<p class="fail-note">This is fal's <b>input</b> filter, rejecting the request before the model runs
       (HTTP 422 <code>content_policy_violation</code>). It is separate from this model's own
       <code>${state.model?.safety?.param || "safety"}</code> setting, and it is applied at fal's
       gateway to every endpoint — so switching tabs is not a way around it.</p>`
    : "";

  $("stage").className = "stage";
  $("stage").innerHTML =
    `<div class="empty fail-box"><div class="empty-art">⚠️</div>
       <p>${escapeHtml(msg)}</p>${note}
       ${info?.status ? `<p class="fail-meta">HTTP ${info.status}${info.phase ? " · " + info.phase : ""}</p>` : ""}
     </div>`;
  toast(msg, "err");
}

/* -------------------------------------------------------------- results -- */

function renderResult(data) {
  const imgs = data.images || [];
  const stage = $("stage");
  stage.className = "stage" + (imgs.length > 1 ? " grid-2" : "");
  stage.innerHTML = "";

  imgs.forEach((im, idx) => {
    const local = "/api/fetch?url=" + encodeURIComponent(im.url);
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <img src="${local}" alt="result ${idx + 1}" />
      <div class="result-actions">
        <a href="${local}" download="openfal-${data.seed ?? "out"}-${idx + 1}.${(im.content_type || "image/png").split("/")[1]}">download</a>
        <button data-act="save">save to outputs/</button>
        <button data-act="reuse">use as input 1</button>
        <button data-act="open">open original</button>
      </div>`;
    card.querySelector("img").onclick = () => openLightbox(local);
    card.querySelector('[data-act="open"]').onclick = () => window.open(im.url, "_blank");
    card.querySelector('[data-act="save"]').onclick = async (e) => {
      e.target.textContent = "saving…";
      const rr = await fetch("/api/save", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: im.url }),
      });
      const jj = await rr.json();
      e.target.textContent = rr.ok ? "saved ✓" : "failed";
      toast(rr.ok ? `Saved to ${jj.path}` : jj.error, rr.ok ? "ok" : "err");
    };
    card.querySelector('[data-act="reuse"]').onclick = () => {
      setSlot(0, { src: im.url, name: im.file_name || "result.png", kind: "url", w: im.width, h: im.height });
      toast("Result loaded as image 1", "ok");
    };
    stage.appendChild(card);
  });

  const first = imgs[0] || {};
  const li = state.lastInput || {};
  const usedModel = state.models.find((x) => x.key === state.lastModelKey) || state.model;
  const safetyParam = usedModel?.safety?.param;
  const t = data.timings || {};
  const timing = Object.entries(t).map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(1) + "s" : v}`).join(" · ");

  const meta = $("meta");
  meta.hidden = false;
  meta.innerHTML = [
    usedModel ? `<span>${escapeHtml(usedModel.label)}</span>` : "",
    first.width ? `<span><b>${first.width}×${first.height}</b> px</span>` : "",
    data.seed != null ? `<span class="copyseed" title="Click to reuse this seed">seed <b>${data.seed}</b></span>` : "",
    li.num_inference_steps != null ? `<span>steps <b>${li.num_inference_steps}</b></span>` : "",
    li.guidance_scale != null ? `<span>cfg <b>${li.guidance_scale}</b></span>` : "",
    li.enable_thinking != null ? `<span>thinking <b>${li.enable_thinking ? "on" : "off"}</b></span>` : "",
    safetyParam ? `<span>${safetyParam} <b>${li[safetyParam]}</b></span>` : "",
    timing ? `<span>${escapeHtml(timing)}</span>` : "",
  ].filter(Boolean).join("");
  const cs = meta.querySelector(".copyseed");
  if (cs) cs.onclick = () => { $("seed").value = data.seed; syncJson(); saveForm(); toast("Seed pinned", "ok"); };
}

function openLightbox(src) {
  $("lightboxImg").src = src;
  $("lightbox").hidden = false;
}
$("lightbox").onclick = () => { $("lightbox").hidden = true; };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("lightbox").hidden = true;
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("run").click();
});

/* -------------------------------------------------------------- history -- */

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { return []; }
}

function pushHistory(data) {
  const items = readHistory();
  items.unshift({
    ts: Date.now(),
    model: state.lastModelKey || state.model?.key,
    prompt: state.lastInput?.prompt || "",
    input: state.lastInput,
    seed: data.seed,
    images: (data.images || []).map((i) => ({ url: i.url, width: i.width, height: i.height, content_type: i.content_type, file_name: i.file_name })),
  });
  localStorage.setItem(HIST_KEY, JSON.stringify(items.slice(0, 40)));
  renderHistory();
}

/** field name -> PARAMS key, for restoring a run's settings from its raw payload. */
function fieldToParam() {
  const map = {};
  for (const [name, spec] of Object.entries(state.paramSpecs)) map[spec.field] = name;
  return map;
}

function renderHistory() {
  const box = $("history");
  box.innerHTML = "";
  for (const item of readHistory()) {
    if (!item.images?.length) continue;
    const el = document.createElement("div");
    el.className = "history-item";
    const label = state.models.find((x) => x.key === item.model)?.label || item.model || "";
    el.title = `${label}\n${new Date(item.ts).toLocaleString()}\nseed ${item.seed}\n\n${item.prompt}`;
    el.innerHTML = `<img src="/api/fetch?url=${encodeURIComponent(item.images[0].url)}" alt="">`;
    el.onclick = () => {
      if (item.model) applyModel(item.model);
      state.lastInput = item.input;
      state.lastModelKey = item.model;
      setStatus("restored", "done");
      $("timer").textContent = "";
      renderResult({ images: item.images, seed: item.seed, timings: {} });
      const inp = item.input;
      if (inp) {
        $("prompt").value = inp.prompt || "";
        if (inp.image_size !== undefined) applySizeFromInput(inp.image_size);
        if (inp.aspect_ratio) $("aspect_ratio").value = inp.aspect_ratio;
        const back = fieldToParam();
        for (const [field, value] of Object.entries(inp)) {
          if (back[field]) setParam(back[field], value);
        }
        syncJson(); saveForm();
      }
    };
    box.appendChild(el);
  }
}

$("clearHistory").onclick = () => {
  if (!readHistory().length) return;
  localStorage.removeItem(HIST_KEY);
  renderHistory();
  toast("History cleared");
};

/* ---------------------------------------------------------------- utils -- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ----------------------------------------------------------------- boot -- */

renderSlots();
renderHistory();
refreshConfig();   // loads registry + params, applies the saved form on top
