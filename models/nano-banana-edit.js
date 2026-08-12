import { defineModel } from "./_schema.js";

export default defineModel({
  key: "nano-banana",
  id: "fal-ai/gemini-25-flash-image/edit",
  label: "Nano Banana (Gemini 2.5 Flash)",
  order: 50,
  blurb: "Google's editor. Strongest output quality, strictest refusals.",
  docs: "https://fal.ai/models/fal-ai/gemini-25-flash-image/edit",
  hosting: "partner",

  safety: { param: "safety_tolerance", value: 6, kind: "dial" },
  note: "Gated at source: blocks come from Google's non-configurable policy enforcement, which refuses even at safety_tolerance 6. Listed so the comparison is on the tab bar; nothing here makes it permissive.",

  images: { min: 1, max: 3, field: "image_urls" },
  size: { kind: "aspect", options: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], default: "auto" },
  params: ["num_images", "output_format"],
  defaults: {},
  pricing: { perImage: 0.039 },
});
