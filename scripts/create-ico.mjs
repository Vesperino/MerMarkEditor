import sharp from 'sharp';
import icoEndec from 'ico-endec';
const { encode: encodeIco } = icoEndec;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputSvg = 'C:\\Users\\Arek\\Downloads\\logo_square.svg';
const outputDir = path.join(__dirname, '..', 'src-tauri', 'icons');

async function createIcons() {
  const svgBuffer = fs.readFileSync(inputSvg);

  // Render master at very high resolution
  const masterImage = await sharp(svgBuffer, { density: 1200 })
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .png()
    .toBuffer();

  console.log('Created master 1024x1024');

  // Windows taskbar uses these sizes: 16, 20, 24, 32, 40, 48, 64, 256
  // Include 24 which is common for taskbar
  const sizes = [16, 20, 24, 32, 40, 48, 64, 256];
  const icoImages = [];

  for (const size of sizes) {
    const png = await sharp(masterImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: 'lanczos3'
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    // Convert to ArrayBuffer for ico-endec
    const arrayBuffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
    icoImages.push(arrayBuffer);

    fs.writeFileSync(path.join(outputDir, `icon_${size}x${size}.png`), png);
    console.log(`Created ${size}x${size}`);
  }

  // Create ICO using ico-endec (keeps PNG format)
  const icoBuffer = encodeIco(icoImages);
  fs.writeFileSync(path.join(outputDir, 'icon.ico'), Buffer.from(icoBuffer));
  console.log('Created icon.ico with PNG format');

  // Standard files - read from saved files
  const png32 = fs.readFileSync(path.join(outputDir, 'icon_32x32.png'));
  const png256 = fs.readFileSync(path.join(outputDir, 'icon_256x256.png'));

  fs.writeFileSync(path.join(outputDir, '32x32.png'), png32);
  fs.writeFileSync(path.join(outputDir, 'icon.png'), png256);
  fs.writeFileSync(path.join(outputDir, '128x128@2x.png'), png256);

  // 128x128
  const png128 = await sharp(masterImage)
    .resize(128, 128, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(outputDir, '128x128.png'), png128);

  // 512x512
  const png512 = await sharp(masterImage)
    .resize(512, 512, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(outputDir, '512x512.png'), png512);

  console.log('\nDone! ICO now contains: 16, 20, 24, 32, 40, 48, 64, 256 px');
}

createIcons().catch(console.error);
