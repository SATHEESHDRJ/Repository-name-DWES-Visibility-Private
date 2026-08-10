import * as zlib from 'zlib';

/**
 * Conservative, dependency-free PDF text extraction.
 *
 * Purpose: harvest whatever text a CAD-exported PDF exposes (dimension strings,
 * apparatus lists, view titles) so the conversion service can work from REAL
 * drawing content only. This is intentionally best-effort: PDFs whose fonts use
 * subset encodings without a recoverable mapping yield little or no text, which
 * lowers the reported quality and pushes the panel toward the explicit
 * "insufficient information" outcome instead of an invented model.
 */

export interface PdfTextResult {
  text: string;
  /** 0..1 — how trustworthy/complete the harvested text is likely to be. */
  quality: number;
  notes: string[];
}

const PRINTABLE = /[\x20-\x7e -ɏ]/;

function printableRatio(s: string): number {
  if (!s.length) return 0;
  let printable = 0;
  for (const ch of s) if (PRINTABLE.test(ch)) printable++;
  return printable / s.length;
}

/**
 * PDF subset-font glyph codes can look superficially "printable" when decoded
 * as Latin-1 while still containing a large C0/C1 control-byte population. Such
 * bytes are not a usable text layer and must not influence dimensions or
 * component extraction.
 */
function controlRatio(s: string): number {
  if (!s.length) return 0;
  let controls = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t') || (code >= 0x7f && code <= 0x9f)) {
      controls++;
    }
  }
  return controls / s.length;
}

/** Unescape a PDF literal string body: \\ \( \) \n \r \t and \ddd octal. */
function unescapeLiteral(body: string): string {
  return body.replace(/\\(\d{1,3}|.)/g, (_m, esc: string) => {
    if (/^\d{1,3}$/.test(esc)) {
      const code = parseInt(esc, 8);
      return code >= 0 && code <= 0x10ffff ? String.fromCharCode(code) : '';
    }
    switch (esc) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case '(': return '(';
      case ')': return ')';
      case '\\': return '\\';
      case '\n': return '';
      default: return esc;
    }
  });
}

/** Decode a hex string body, preferring UTF-16BE when it looks like one. */
function decodeHex(body: string): string {
  const clean = body.replace(/[^0-9a-fA-F]/g, '');
  const padded = clean.length % 2 ? `${clean}0` : clean;
  const bytes = Buffer.from(padded, 'hex');
  if (bytes.length >= 2 && bytes.length % 2 === 0) {
    let zeroHigh = 0;
    for (let i = 0; i < bytes.length; i += 2) if (bytes[i] === 0) zeroHigh++;
    if (zeroHigh / (bytes.length / 2) > 0.7) {
      const utf16 = bytes.swap16().toString('utf16le');
      if (printableRatio(utf16) > 0.7) return utf16;
      bytes.swap16(); // restore for the latin1 fallback below
    }
  }
  const latin = bytes.toString('latin1');
  return printableRatio(latin) > 0.7 ? latin : '';
}

/** Pull text-showing operator arguments (Tj, ', ", TJ arrays) out of one content stream. */
function textFromContentStream(content: string): string[] {
  const out: string[] = [];
  // Literal strings followed by a show operator.
  const litRe = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g;
  let m: RegExpExecArray | null;
  while ((m = litRe.exec(content))) {
    const s = unescapeLiteral(m[1]);
    if (printableRatio(s) > 0.6) out.push(s);
  }
  // Hex strings followed by a show operator.
  const hexRe = /<([0-9a-fA-F\s]+)>\s*(?:Tj|'|")/g;
  while ((m = hexRe.exec(content))) {
    const s = decodeHex(m[1]);
    if (s) out.push(s);
  }
  // TJ arrays: mixed literal/hex fragments with kerning numbers.
  const tjRe = /\[((?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>|[-\d.\s])*)\]\s*TJ/g;
  while ((m = tjRe.exec(content))) {
    const arr = m[1];
    let fragment = '';
    const partRe = /\(((?:\\.|[^\\()])*)\)|<([0-9a-fA-F\s]+)>/g;
    let p: RegExpExecArray | null;
    while ((p = partRe.exec(arr))) {
      fragment += p[1] !== undefined ? unescapeLiteral(p[1]) : decodeHex(p[2]);
    }
    if (fragment && printableRatio(fragment) > 0.6) out.push(fragment);
  }
  return out;
}

/** Extract every decodable stream body from the raw PDF bytes. */
function decodedStreams(buffer: Buffer): { streams: string[]; total: number; decoded: number } {
  const raw = buffer.toString('latin1');
  const streams: string[] = [];
  let total = 0;
  let decoded = 0;
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    total++;
    // The ~200 bytes before `stream` hold the stream dictionary (filters).
    const dict = raw.slice(Math.max(0, m.index - 400), m.index);
    const body = Buffer.from(raw.slice(start, end), 'latin1');
    // Skip obvious image payloads — no text inside, and inflate is wasted work.
    if (/\/Subtype\s*\/Image/.test(dict) || /\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(dict)) {
      streamRe.lastIndex = end;
      continue;
    }
    if (/\/FlateDecode/.test(dict)) {
      try {
        streams.push(zlib.inflateSync(body).toString('latin1'));
        decoded++;
      } catch {
        try {
          streams.push(zlib.inflateRawSync(body).toString('latin1'));
          decoded++;
        } catch { /* undecodable stream — counted in quality */ }
      }
    } else if (!/\/Filter/.test(dict)) {
      streams.push(body.toString('latin1'));
      decoded++;
    }
    streamRe.lastIndex = end;
  }
  return { streams, total, decoded };
}

export function extractPdfText(buffer: Buffer): PdfTextResult {
  const notes: string[] = [];
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return { text: '', quality: 0, notes: ['Not a PDF file — no text layer to analyse.'] };
  }
  const { streams, total, decoded } = decodedStreams(buffer);
  const fragments: string[] = [];
  for (const stream of streams) {
    if (!/\b(?:Tj|TJ|'|")\b|\bBT\b/.test(stream)) continue;
    fragments.push(...textFromContentStream(stream));
  }
  const text = fragments.join('\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (text && controlRatio(text) > 0.02) {
    notes.push('Candidate PDF text used an undecodable subset-font/glyph encoding; treated as having no usable text layer.');
    return { text: '', quality: 0, notes };
  }
  const ratio = printableRatio(text);
  const coverage = total === 0 ? 0 : decoded / total;
  // Quality blends: how much text surfaced, how printable it is, how many streams decoded.
  const volume = Math.min(1, text.length / 400);
  const quality = Math.round(volume * ratio * (0.5 + 0.5 * coverage) * 100) / 100;
  if (total === 0) notes.push('PDF contains no content streams.');
  if (total > 0 && decoded < total) notes.push(`${total - decoded} of ${total} PDF streams could not be decoded (unsupported filter).`);
  if (text.length === 0) notes.push('No extractable text layer found — the drawing may be a scanned/rasterized PDF.');
  return { text, quality, notes };
}
