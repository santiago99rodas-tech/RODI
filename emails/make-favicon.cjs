// Builds the favicon from the RODI "R" isotype: the black letter on an ivory (#F5F1EA) square.
//   node make-favicon.cjs  ->  ../../shopify-theme/assets/rodi-favicon.png (512x512) and rodi-apple-touch-icon.png (180x180)
const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "islogo negro.png");
const OUT = path.join(__dirname, "..", "..", "shopify-theme", "assets");
const IVORY = { r: 245, g: 241, b: 234 };
const INK = { r: 28, g: 27, b: 26 };

(async () => {
  // 1) the letter only: crop to its bounding box and turn the white paper into transparency (alpha = darkness)
  const trimmed = await sharp(SRC).trim({ background: "#ffffff", threshold: 40 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = trimmed;
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    rgba[i * 4] = INK.r;
    rgba[i * 4 + 1] = INK.g;
    rgba[i * 4 + 2] = INK.b;
    // darkness -> alpha, with the near-white noise floor of the source file cut off so no faint box remains
    const dark = 255 - data[i];
    rgba[i * 4 + 3] = dark < 30 ? 0 : Math.min(255, Math.round(((dark - 30) * 255) / 190));
  }
  const letter = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });

  // 2) centered on an ivory square, with the letter taking about 58% of the canvas
  const make = async (size, file) => {
    const box = Math.round(size * 0.58);
    const resized = await letter.clone().resize({ width: box, height: box, fit: "inside" }).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: { ...IVORY, alpha: 1 } } })
      .composite([{ input: resized, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, file));
    console.log(file, size + "x" + size);
  };
  await make(512, "rodi-favicon.png");
  await make(180, "rodi-apple-touch-icon.png");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
