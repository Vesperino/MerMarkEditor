import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputSvg = 'C:\\Users\\Arek\\Downloads\\MerMark_trimmed.svg';
const outputDir = path.join(__dirname, '..', 'src-tauri', 'icons');

async function generateIcons() {
  // Read the SVG
  const svgBuffer = fs.readFileSync(inputSvg);

  // Original SVG is 558x378 - we need to make it square
  // Use a large base size (1024) for best quality, then scale down
  const baseSize = 1024;

  // Calculate dimensions to fit SVG in square with padding
  // SVG aspect ratio: 558/378 = 1.476
  const svgWidth = 558;
  const svgHeight = 378;
  const aspectRatio = svgWidth / svgHeight;

  // Fit in 80% of the square to leave padding
  const targetWidth = Math.round(baseSize * 0.85);
  const targetHeight = Math.round(targetWidth / aspectRatio);

  // First render SVG at high resolution
  const highResSvg = await sharp(svgBuffer, { density: 300 })
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .png()
    .toBuffer();

  // Create square canvas with centered logo
  const paddingTop = Math.floor((baseSize - targetHeight) / 2);
  const paddingBottom = baseSize - targetHeight - paddingTop;
  const paddingLeft = Math.floor((baseSize - targetWidth) / 2);
  const paddingRight = baseSize - targetWidth - paddingLeft;

  const squareImage = await sharp(highResSvg)
    .extend({
      top: paddingTop,
      bottom: paddingBottom,
      left: paddingLeft,
      right: paddingRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // Generate different sizes for the ICO
  const sizes = [16, 32, 48, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const resized = await sharp(squareImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: 'lanczos3'
      })
      .sharpen({ sigma: size < 64 ? 0.5 : 0.3 })
      .png()
      .toBuffer();
    pngBuffers.push(resized);
  }

  // Generate 256x256 PNG for icon.png
  const png256 = await sharp(squareImage)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .sharpen({ sigma: 0.3 })
    .png()
    .toBuffer();

  // Save icon.png
  fs.writeFileSync(path.join(outputDir, 'icon.png'), png256);
  console.log('Created icon.png (256x256)');

  // Generate ICO from the PNGs
  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(outputDir, 'icon.ico'), icoBuffer);
  console.log('Created icon.ico (16, 32, 48, 256)');

  // Also generate 32x32 version
  const png32 = await sharp(squareImage)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .sharpen({ sigma: 0.5 })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(outputDir, '32x32.png'), png32);
  console.log('Created 32x32.png');

  // Generate 128x128 version
  const png128 = await sharp(squareImage)
    .resize(128, 128, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .sharpen({ sigma: 0.3 })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(outputDir, '128x128.png'), png128);
  console.log('Created 128x128.png');

  // Generate 128x128@2x (256x256)
  fs.writeFileSync(path.join(outputDir, '128x128@2x.png'), png256);
  console.log('Created 128x128@2x.png');

  // Also save 512x512 for high-DPI displays
  const png512 = await sharp(squareImage)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(outputDir, '512x512.png'), png512);
  console.log('Created 512x512.png');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
