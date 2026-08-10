/**
 * Validates dashboard 3D icon pack: CC0 license, unique sources, raster-only WebP files.
 * Usage: node scripts/validate-dashboard-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packDir = path.join(root, 'src', 'assets', 'dashboard-icons');
const manifestPath = path.join(packDir, 'manifest.json');
const licensePath = path.join(packDir, 'LICENSE-CC0.txt');
const errors = [];

if (!fs.existsSync(manifestPath)) errors.push('Missing manifest.json');
if (!fs.existsSync(licensePath)) errors.push('Missing LICENSE-CC0.txt');
else {
  const license = fs.readFileSync(licensePath, 'utf8');
  if (!/CC0 1\.0 Universal/i.test(license)) errors.push('LICENSE-CC0.txt does not look like CC0-1.0');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.style !== 'color') errors.push(`Expected style=color, got ${manifest.style}`);
if (manifest.angle !== 'dynamic') errors.push(`Expected angle=dynamic, got ${manifest.angle}`);
if (manifest.license !== 'CC0-1.0') errors.push(`Expected license CC0-1.0, got ${manifest.license}`);
if (manifest.format !== 'webp') errors.push(`Expected format=webp, got ${manifest.format}`);

const functions = manifest.functions || {};
const sourceToFn = new Map();
for (const [fn, meta] of Object.entries(functions)) {
  if (!meta.source) errors.push(`${fn}: missing source`);
  if (!meta.sourceUrl) errors.push(`${fn}: missing sourceUrl`);
  if (!meta.file) errors.push(`${fn}: missing file`);
  if (meta.file && !meta.file.endsWith('.webp')) errors.push(`${fn}: non-webp file ${meta.file}`);
  if (meta.file && /\.svg$/i.test(meta.file)) errors.push(`${fn}: SVG not allowed`);
  const abs = path.join(packDir, meta.file || '');
  if (meta.file && !fs.existsSync(abs)) errors.push(`${fn}: missing asset ${meta.file}`);
  if (meta.file && fs.existsSync(abs)) {
    const buf = fs.readFileSync(abs);
    // RIFF....WEBP
    if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
      errors.push(`${fn}: not a valid WebP file`);
    }
  }
  if (meta.source) {
    if (sourceToFn.has(meta.source)) {
      errors.push(`Duplicate source "${meta.source}" used by ${sourceToFn.get(meta.source)} and ${fn}`);
    } else {
      sourceToFn.set(meta.source, fn);
    }
  }
}

if (Object.keys(functions).length < 10) {
  errors.push(`Too few mapped functions: ${Object.keys(functions).length}`);
}

if (errors.length) {
  console.error('Dashboard icon validation FAILED:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  functions: Object.keys(functions).length,
  uniqueSources: sourceToFn.size,
  style: manifest.style,
  angle: manifest.angle,
  license: manifest.license,
}, null, 2));