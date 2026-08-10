const fs = require('fs');
const path = require('path');

const REPLACEMENTS = {
  'text-slate-900': 'text-primary',
  'text-gray-900': 'text-primary',
  'text-slate-800': 'text-primary',
  'text-gray-800': 'text-primary',
  'text-slate-700': 'text-secondary',
  'text-gray-700': 'text-secondary',
  'text-slate-600': 'text-muted',
  'text-gray-600': 'text-muted',
  'text-slate-500': 'text-muted',
  'text-gray-500': 'text-muted'
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  for (const [oldClass, newClass] of Object.entries(REPLACEMENTS)) {
    const regex = new RegExp('\\b' + oldClass + '\\b', 'g');
    if (regex.test(content)) {
      content = content.replace(regex, newClass);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', filePath);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));
