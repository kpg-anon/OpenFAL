import { defineModel } from "./_schema.js";

export default defineModel({
  key: "seedream4",
  id: "fal-ai/bytedance/seedream/v4/edit",
  label: "Seedream v4 Edit",
  order: 30,
  blurb: "ByteDance editor. Up to 10 references and exact sizes to 4K.",
  docs: "https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit",
  hosting: "fal",

  safety: { param: "enable_safety_checker", value: false, kind: "off" },
  note: "Output checker off. Minimum total area 921,600 px; smaller requests are scaled up proportionally.",

  // the endpoint accepts 10; the UI caps the grid at 6
  images: { min: 1, max: 6, field: "image_urls" },
  size: { kind: "dims", modes: ["auto", "preset", "custom"], max: 4096, minArea: 921600 },
  params: ["num_images", "max_images"],
  defaults: {},
  pricing: { perImage: 0.03 },
});
