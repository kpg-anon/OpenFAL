import { defineModel } from "./_schema.js";

export default defineModel({
  key: "wan3-r2v",
  id: "alibaba/wan-3.0/reference-to-video",
  label: "Wan 3.0 Reference-to-Video",
  order: 70,
  blurb: "Alibaba video model. Up to 10 reference images, 5 videos and 5 audio clips; 2–30 s output with generated audio.",
  docs: "https://fal.ai/models/alibaba/wan-3.0/reference-to-video",
  hosting: "partner",

  // fal: "Disabling requires account authorization; unauthorized requests are always checked."
  safety: { param: "enable_safety_checker", value: false, kind: "off" },
  gated: true,
  note: "Video output. Refer to references by position in the prompt — \"the woman in Image 1 walks past Video 1\" — numbered per type in slot order. enable_safety_checker: false is only honoured on accounts fal has authorised; on any other account the request is checked anyway. Reference videos: 15 s total, at least 16 fps each, and their duration is billed on top of the output.",

  // the endpoint takes 10 images, 5 videos and 5 audio clips; the UI grid holds 9 of any mix
  images: { min: 0, max: 10, field: "reference_image_urls" },
  videos: { max: 5, field: "reference_video_urls" },
  audios: { max: 5, field: "reference_audio_urls" },
  slots: 9,
  output: "video",

  size: { kind: "aspect", options: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], default: "adaptive" },
  params: ["video_resolution", "duration", "audio", "prompt_expansion", "thinking"],
  defaults: { thinking: false },
  // per second of output; reference video seconds are billed on top at a rate fal does not publish
  pricing: { perSecond: { "480p": 0.05, "720p": 0.10, "1080p": 0.20 } },
});
