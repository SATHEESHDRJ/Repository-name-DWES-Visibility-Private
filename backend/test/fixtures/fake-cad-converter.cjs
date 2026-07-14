const fs = require('node:fs');

const [, , input, output] = process.argv;
if (!input || !output || !fs.existsSync(input)) process.exit(2);

// Minimal signature-valid PDF output used only to verify safe argv conversion plumbing.
fs.writeFileSync(output, Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'));
