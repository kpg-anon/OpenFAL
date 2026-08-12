import { defineModel } from "./_schema.js";

export default defineModel({
  key: "kontext-max",
  id: "fal-ai/flux-pro/kontext/max",
  label: "FLUX.1 Kontext [max]",
  order: 40,
  blurb: "Black Forest Labs editor. Single reference image, aspect-ratio output control.",
  docs: "https://fal.ai/models/fal-ai/flux-pro/kontext/max",
  hosting: "partner",

  // Partner-served: no output-checker parameter exists, only a tolerance dial on fal's side.
  safety: { param: "safety_tolerance", value: 6, kind: "dial" },
  note: "Partner-served (BFL). No enable_safety_checker exists here; safety_tolerance is set to its loosest value, which relaxes fal's side only. Kontext edit endpoints may cap it lower and reject the request outright.",

  images: { min: 1, max: 1, field: "image_url" },
  size: {
    kind: "aspect",
    // "" omits the field entirely, which keeps the input image's ratio
    options: ["", "21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"],
    default: "",
  },
  params: ["guidance", "num_images", "output_format"],
  defaults: { guidance: 3.5, output_format: "jpeg" },
  pricing: { perImage: 0.08 },
});
