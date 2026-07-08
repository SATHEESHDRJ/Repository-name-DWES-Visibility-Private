/**
 * Generates PWA PNG icons and the Windows .ico from public/app-icon.svg.
 *
 * Outputs (all under public/):
 *   icons/icon-192.png            — PWA manifest icon
 *   icons/icon-512.png            — PWA manifest icon
 *   icons/icon-maskable-512.png   — maskable icon (extra safe-zone padding)
 *   app-icon.ico                  — Windows desktop-shortcut icon (16–256 px)
 *
 * Usage: node scripts/generate-app-icons.mjs   (or `npm run icons:generate`)
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const iconsDir = path.join(publicDir, 'icons');
const svgPath = path.join(publicDir, 'app-icon.svg');

await fs.mkdir(iconsDir, { recursive: true });
const svg = await fs.readFile(svgPath);

async function renderPng(size, outFile, { pad = 0 } = {}) {
  const inner = size - pad * 2;
  let img = sharp(svg, { density: 300 }).resize(inner, inner);
  if (pad > 0) {
    img = sharp(await img.png().toBuffer()).extend({
      top: pad, bottom: pad, left: pad, right: pad,
      background: { r: 15, g: 36, b: 54, alpha: 1 }, // matches tile top color
    });
  }
  await img.png().toFile(outFile);
  console.log(`  ✓ ${path.relative(root, outFile)} (${size}x${size})`);
}

console.log('[DWES] Generating app icons from public/app-icon.svg\n');

await renderPng(192, path.join(iconsDir, 'icon-192.png'));
await renderPng(512, path.join(iconsDir, 'icon-512.png'));
// Maskable: brand mark inside the ~80% safe zone
await renderPng(512, path.join(iconsDir, 'icon-maskable-512.png'), { pad: 51 });

// Windows .ico with the standard shortcut sizes
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = await Promise.all(
  icoSizes.map(s => sharp(svg, { density: 300 }).resize(s, s).png().toBuffer()),
);
await fs.writeFile(path.join(publicDir, 'app-icon.ico'), await pngToIco(icoPngs));
console.log(`  ✓ public/app-icon.ico (${icoSizes.join(', ')} px)`);

console.log('\nDone.');
