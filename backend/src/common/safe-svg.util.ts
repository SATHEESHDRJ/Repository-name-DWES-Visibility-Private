/**
 * Shared safety gate for SVG content that DWES serves inline (drawing uploads
 * and CAD preview output). Rejects executable or externally-loading constructs.
 */
export function isSafeInlineSvg(buffer: Buffer): boolean {
  const text = buffer.toString('utf8');
  const head = text.slice(0, 4096);
  return /<svg(?:\s|>)/i.test(head)
    && !/<(?:script|foreignObject)(?:\s|>)/i.test(text)
    && !/<!DOCTYPE/i.test(text)
    && !/\son[a-z]+\s*=/i.test(text)
    && !/javascript\s*:/i.test(text)
    && !/(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:text\/html)/i.test(text);
}
