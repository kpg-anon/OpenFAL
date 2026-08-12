import { defineModel } from "./_schema.js";

export default defineModel({
  key: "hy-wu",
  id: "fal-ai/hy-wu-edit",
  label: "HY-WU Edit",
  order: 10,
  blurb: "Outfit transfer, face swap, texture blend across up to 3 references.",
  docs: "https://fal.ai/models/fal-ai/hy-wu-edit",
  hosting: "fal",

  // fal-hosted weights: the model's own output check is a real parameter
  safety: { param: "enable_safety_checker", value: false, kind: "off" },
  note: "Output checker off. Normalises output to roughly 1 MP, so exact sizes above or below that are not honoured — measured, see README.",

  images: { min: 1, max: 3, field: "image_urls" },
  size: { kind: "dims", modes: ["auto", "preset", "custom"], minArea: 1.0e6 },
  params: ["steps", "num_images", "output_format", "thinking"],
  defaults: { steps: 30, thinking: true },
  pricing: { mp: 0.10, mpThinking: 0.15 },
});
