// Run from any directory with: node scripts/generate-icons.cjs
// Only generated branding assets are overwritten; tamil-logo.png is preserved.
const path = require("node:path");
const sharp = require("sharp");

const assets = path.resolve(__dirname, "../assets/images");
const source = path.join(assets, "tamil-logo.png");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function squareArtwork(size, artworkSize) {
  const artwork = await sharp(source)
    .resize(artworkSize, artworkSize, {
      fit: "contain",
      background: transparent,
    })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: transparent },
  })
    .composite([{ input: artwork, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function main() {
  // Opaque full-square icon for iOS and legacy Android. OS applies corner masks.
  const icon = await squareArtwork(1024, 900);
  await sharp(icon)
    .flatten({ background: "#000000" })
    .png()
    .toFile(path.join(assets, "icon.png"));

  // Keep the entire square artwork within Android's central circular safe zone.
  const foreground = await squareArtwork(1024, 640);
  await sharp(foreground).toFile(
    path.join(assets, "android-icon-foreground.png"),
  );
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#000000" },
  })
    .png()
    .toFile(path.join(assets, "android-icon-background.png"));

  // Android themed icons use an alpha mask, not a grayscale RGB image.
  // Brightness becomes opacity so the dark temple and details remain cutouts.
  const { data, info } = await sharp(foreground)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
    mask[i] = mask[i + 1] = mask[i + 2] = 255;
    mask[i + 3] = Math.round(
      data[i + 3] * Math.max(0, Math.min(1, (brightness - 32) / 160)),
    );
  }
  await sharp(mask, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(path.join(assets, "android-icon-monochrome.png"));

  const splash = await squareArtwork(1024, 960);
  await sharp(splash).toFile(path.join(assets, "splash-icon.png"));
  await sharp(icon)
    .resize(64, 64)
    .png()
    .toFile(path.join(assets, "favicon.png"));
  console.log(
    "Generated icon, adaptive foreground/background/monochrome, splash, and favicon.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
