// Camera check-in capture (Sprint 42). Grabs ~1s of webcam frames via the
// webview's getUserMedia, encodes them into a small GIF with gifenc (bundled,
// dependency-free, offline/CSP-safe), and returns the raw bytes. All of this
// runs in the webview; the caller persists the bytes via save_image.

import { GIFEncoder, quantize, applyPalette } from "gifenc";

const WIDTH = 240; // downscaled — keeps the GIF small
const HEIGHT = 180;
const FRAMES = 10;
const FRAME_MS = 100; // ~1s total, 10fps

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Returns GIF bytes, or throws if the camera is unavailable / denied.
export async function captureCheckinGif(): Promise<Uint8Array> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not available in this environment");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");

  try {
    await video.play();
    // Give the sensor a beat to expose/focus before the first frame.
    await wait(350);

    const gif = GIFEncoder();
    for (let i = 0; i < FRAMES; i++) {
      // Cover-fit the (usually 4:3) video into our frame, mirrored like a selfie.
      ctx.save();
      ctx.translate(WIDTH, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);
      ctx.restore();

      const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, WIDTH, HEIGHT, { palette, delay: FRAME_MS });
      if (i < FRAMES - 1) await wait(FRAME_MS);
    }
    gif.finish();
    return gif.bytes();
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
