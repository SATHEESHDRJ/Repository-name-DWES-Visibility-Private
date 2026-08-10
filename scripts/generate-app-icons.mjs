/**
 * Generates PWA PNG icons, favicon.ico, and the Windows .ico from public/app-icon.svg.
 *
 * Outputs (all under public/):
 *   icons/icon-192.png            — PWA manifest icon
 *   icons/icon-512.png            — PWA manifest icon
 *   icons/icon-maskable-512.png   — maskable icon (extra safe-zone padding)
 *   icons/apple-touch-icon.png    — Apple touch icon (180×180)
 *   favicon.ico                   — browser fallback (16/32/48)
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

// White tile background — matches logo.svg / CompanyLogo topbar pill
const TILE_BG = { r: 255, g: 255, b: 255, alpha: 1 };

await fs.mkdir(iconsDir, { recursive: true });
const svg = await fs.readFile(svgPath);

async function renderPng(size, outFile, { pad = 0 } = {}) {
  const inner = size - pad * 2;
  let img = sharp(svg, { density: 300 }).resize(inner, inner);
  if (pad > 0) {
    img = sharp(await img.png().toBuffer()).extend({
      top: pad, bottom: pad, left: pad, right: pad,
      background: TILE_BG,
    });
  }
  await img.png().toFile(outFile);
  console.log(`  ✓ ${path.relative(root, outFile)} (${size}x${size})`);
}

console.log('[DWES] Generating app icons from public/app-icon.svg\n');

await renderPng(192, path.join(iconsDir, 'icon-192.png'));
await renderPng(512, path.join(iconsDir, 'icon-512.png'));
await renderPng(180, path.join(iconsDir, 'apple-touch-icon.png'));
// Maskable: brand mark inside the ~80% safe zone
await renderPng(512, path.join(iconsDir, 'icon-maskable-512.png'), { pad: 51 });

// favicon.ico — standard browser fallback sizes
const faviconSizes = [16, 32, 48];
const faviconPngs = await Promise.all(
  faviconSizes.map(s => sharp(svg, { density: 300 }).resize(s, s).png().toBuffer()),
);
await fs.writeFile(path.join(publicDir, 'favicon.ico'), await pngToIco(faviconPngs));
console.log(`  ✓ public/favicon.ico (${faviconSizes.join(', ')} px)`);

// Windows .ico with the standard shortcut sizes
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = await Promise.all(
  icoSizes.map(s => sharp(svg, { density: 300 }).resize(s, s).png().toBuffer()),
);
await fs.writeFile(path.join(publicDir, 'app-icon.ico'), await pngToIco(icoPngs));
console.log(`  ✓ public/app-icon.ico (${icoSizes.join(', ')} px)`);

console.log('\nDone.');
