import { defineModel } from "./_schema.js";

export default defineModel({
  key: "qwen-plus",
  id: "fal-ai/qwen-image-edit-plus",
  label: "Qwen Image Edit Plus",
  order: 20,
  blurb: "Open-weight editor on fal's own GPUs. Targeted edits with little collateral drift.",
  docs: "https://fal.ai/models/fal-ai/qwen-image-edit-plus",
  hosting: "fal",

  safety: { param: "enable_safety_checker", value: false, kind: "off" },
  note: "Output checker off. Open weights served by fal, with no separate provider policy layer behind it. Takes exact dimensions, unlike HY-WU.",

  images: { min: 1, max: 3, field: "image_urls" },
  size: { kind: "dims", modes: ["preset", "custom"] },
  params: ["steps", "guidance", "negative", "acceleration", "num_images", "output_format"],
  defaults: { steps: 50, guidance: 4, acceleration: "regular" },
  pricing: { perImage: 0.03 },
});
