import { defineModel } from "./_schema.js";

export default defineModel({
  key: "nano-banana-2",
  id: "fal-ai/nano-banana-2/edit",
  label: "Nano Banana 2 (Gemini 3 Pro)",
  order: 60,
  blurb: "Google's current editor. Native 1K/2K/4K output and up to 14 references.",
  docs: "https://fal.ai/models/fal-ai/nano-banana-2/edit",
  hosting: "partner",

  // Enum of strings here, not the integer the v1 endpoint takes. "6" is the loosest value.
  safety: { param: "safety_tolerance", value: "6", kind: "dial" },
  gated: true,
  note: "Gated at source, same as Nano Banana 1: Google's policy enforcement sits above fal's dial and refuses even at safety_tolerance 6. Output geometry is aspect_ratio × resolution — there are no exact width/height fields, so set the ratio from the input image rather than leaving it on auto.",

  // the endpoint accepts 14; the UI caps the grid at 6
  images: { min: 1, max: 6, field: "image_urls" },
  size: {
    kind: "aspect",
    // full supported set, widest first — the ratio matcher needs the panoramic ones
    // to have something sane to snap a banner-shaped input to
    options: [
      "auto", "8:1", "4:1", "21:9", "16:9", "3:2", "4:3", "5:4",
      "1:1", "4:5", "3:4", "2:3", "9:16", "1:4", "1:8",
    ],
    default: "auto",
  },
  params: ["resolution", "num_images", "output_format"],
  defaults: { resolution: "1K" },
  // $0.08 at 1K; fal bills 2K at 1.5x and 4K at 2x that rate
  pricing: { perImage: 0.08, resolutionMult: { "1K": 1, "2K": 1.5, "4K": 2 } },
});
