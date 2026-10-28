/**
 * Shared vocabulary for model definitions.
 *
 * Adding a model = drop one file in this directory (see any existing one). It is picked up
 * automatically at boot and rendered by the UI without touching HTML, CSS or the server.
 *
 * Adding a *parameter* that no model uses yet = add one entry to PARAMS below. The server
 * assembles it into the fal payload and the browser renders a control for it, both driven
 * from this table.
 */

/** Every control the UI knows how to render, and the fal field each one maps to. */
export const PARAMS = {
  steps: {
    field: "num_inference_steps", type: "range", label: "Steps",
    min: 1, max: 100, step: 1, default: 30,
  },
  guidance: {
    field: "guidance_scale", type: "range", label: "Guidance",
    min: 0, max: 12, step: 0.1, decimals: 1, default: 3.5,
  },
  num_images: {
    field: "num_images", type: "range", label: "Images",
    min: 1, max: 4, step: 1, default: 1,
  },
  max_images: {
    field: "max_images", type: "range", label: "Max images",
    min: 1, max: 6, step: 1, default: 1,
  },
  negative: {
    field: "negative_prompt", type: "text", label: "Negative prompt",
    placeholder: "what to avoid (optional)", omitIfEmpty: true, default: "",
  },
  acceleration: {
    field: "acceleration", type: "select", label: "Acceleration",
    options: ["regular", "none"], default: "regular",
  },
  output_format: {
    field: "output_format", type: "select", label: "Output format",
    options: ["png", "jpeg"], default: "png",
  },
  resolution: {
    field: "resolution", type: "select", label: "Output resolution",
    options: ["1K", "2K", "4K"], default: "1K",
  },
  // same fal field as `resolution`, different vocabulary — video endpoints name a line count
  video_resolution: {
    field: "resolution", type: "select", label: "Resolution",
    options: ["480p", "720p", "1080p"], default: "1080p",
  },
  duration: {
    field: "duration", type: "range", label: "Duration (s)",
    min: 2, max: 30, step: 1, default: 5,
  },
  audio: {
    field: "audio", type: "toggle", label: "Audio",
    hint: "generate a soundtrack", default: true,
  },
  prompt_expansion: {
    field: "enable_prompt_expansion", type: "toggle", label: "Prompt expansion",
    hint: "adds 20–60 s", default: true,
  },
  thinking: {
    field: "enable_thinking", type: "toggle", label: "Thinking",
    hint: "slower, better", default: true,
  },
  sync_mode: {
    field: "sync_mode", type: "toggle", label: "Sync mode",
    hint: "return as data URI", default: false,
  },
};

export const SIZE_PRESETS = [
  "square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9",
];

export const clampInt = (v, min, max, dflt) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

const clampNum = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function normalizeSize(v, model) {
  const max = model.size.max || 4096;
  if (v && typeof v === "object") {
    return { width: clampInt(v.width, 256, max, 1024), height: clampInt(v.height, 256, max, 1024) };
  }
  if (SIZE_PRESETS.includes(v)) return v;
  return model.size.modes?.includes("auto") ? "auto" : "square_hd";
}

const REQUIRED = ["key", "id", "label", "images", "size", "safety"];

/** Reference media a model can take, and the spec key that describes each. */
export const MEDIA = { image: "images", video: "videos", audio: "audios" };

/**
 * Validates one model definition and fills in the parts every model shares.
 * Throws loudly at boot rather than failing mysteriously at submit time.
 */
export function defineModel(spec) {
  const missing = REQUIRED.filter((f) => spec[f] === undefined);
  if (missing.length) {
    throw new Error(`Model "${spec.key || spec.id || "?"}" is missing: ${missing.join(", ")}`);
  }
  for (const p of spec.params || []) {
    if (!PARAMS[p]) {
      throw new Error(`Model "${spec.key}" uses unknown param "${p}" — add it to PARAMS in models/_schema.js`);
    }
  }
  if (!["dims", "aspect"].includes(spec.size.kind)) {
    throw new Error(`Model "${spec.key}" has unknown size.kind "${spec.size.kind}"`);
  }
  if (spec.safety.param && spec.safety.value === undefined) {
    throw new Error(`Model "${spec.key}" declares safety.param without a value`);
  }
  if (spec.output !== undefined && !["image", "video"].includes(spec.output)) {
    throw new Error(`Model "${spec.key}" has unknown output "${spec.output}"`);
  }
  for (const key of ["videos", "audios"]) {
    if (spec[key] && (!spec[key].field || !spec[key].max)) {
      throw new Error(`Model "${spec.key}" ${key} needs both field and max`);
    }
  }
  return {
    blurb: "", note: "", docs: "", hosting: "fal", params: [], defaults: {}, pricing: {},
    // gated = the provider enforces its own policy above fal's dial, so the dial is not the story
    order: 100, gated: false, output: "image", videos: null, audios: null,
    ...spec,
    images: { min: 1, field: "image_urls", ...spec.images },
    // slots in the UI grid, shared by every media type the model takes
    slots: spec.slots ?? spec.images.max,
  };
}

/**
 * Assembles one model's fal payload from the generic form body.
 * `b.params` is keyed by PARAMS name; `refs` maps media type -> already-uploaded URLs.
 */
export function buildPayload(model, b, refs) {
  const input = { prompt: String(b.prompt || "").trim() };

  for (const [media, key] of Object.entries(MEDIA)) {
    const spec = model[key];
    const urls = refs[media] || [];
    if (!spec) continue;
    if (spec.field === "image_url") input.image_url = urls[0];
    // optional reference lists are left out entirely rather than sent empty
    else if (urls.length || spec.min > 0) input[spec.field] = urls.slice(0, spec.max);
  }

  if (model.size.kind === "aspect") {
    const ar = String(b.aspect_ratio ?? model.size.default ?? "");
    if (ar && model.size.options.includes(ar)) input.aspect_ratio = ar;
  } else {
    input.image_size = normalizeSize(b.image_size, model);
  }

  const sent = b.params || {};
  for (const name of model.params) {
    const spec = PARAMS[name];
    const fallback = model.defaults[name] ?? spec.default;
    let v = sent[name];
    if (v === undefined || v === null || v === "") v = fallback;

    switch (spec.type) {
      case "range": {
        const n = clampNum(v, spec.min, spec.max, fallback);
        v = spec.step >= 1 ? Math.trunc(n) : n;
        break;
      }
      case "select":
        v = spec.options.includes(v) ? v : fallback;
        break;
      case "toggle":
        v = typeof v === "boolean" ? v : Boolean(fallback);
        break;
      case "text":
        v = String(v).trim();
        if (!v && spec.omitIfEmpty) continue;
        break;
    }
    input[spec.field] = v;
  }

  // Safety parameter comes from the model definition, never from the client.
  if (model.safety.param) input[model.safety.param] = model.safety.value;

  if (b.seed !== null && b.seed !== undefined && b.seed !== "") {
    const s = Number(b.seed);
    if (Number.isFinite(s)) input.seed = Math.trunc(s);
  }
  return input;
}
