'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Mirror of DrawingIntelligenceClient.extractJsonPayload for regression without Jest ESM.
 * Keep in sync with drawing-intelligence.client.ts.
 */
function extractJsonPayload(stdout) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error('empty python CLI stdout');
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`python CLI stdout is not JSON: ${text.slice(0, 120)}`);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`python CLI stdout JSON is truncated: ${text.slice(0, 120)}`);
}

describe('extractJsonPayload', () => {
  it('passes through clean JSON', () => {
    const raw = '{"candidates":[],"engine":"python-cli-ocr"}';
    assert.equal(extractJsonPayload(raw), raw);
  });

  it('strips Tesseract/pymupdf warning prefixes', () => {
    const json = '{"candidates":[{"tb_number":"X1"}],"engine":"python-cli-ocr"}';
    const polluted = `warning: The \`fitz\` API is deprecated\n${json}`;
    assert.equal(extractJsonPayload(polluted), json);
  });

  it('takes only the first JSON object when stdout is concatenated', () => {
    const first = '{"a":1}';
    const second = '{"b":2}';
    assert.equal(extractJsonPayload(first + second), first);
  });

  it('rejects empty or non-JSON stdout', () => {
    assert.throws(() => extractJsonPayload(''), /empty/i);
    assert.throws(() => extractJsonPayload('warning: only'), /not JSON/i);
  });
});
