const PDF_MAGIC = '%PDF-';

export async function readBlobPrefix(blob: Blob, length: number): Promise<Uint8Array> {
  const slice = blob.slice(0, Math.max(0, length));
  return new Uint8Array(await slice.arrayBuffer());
}

export function looksLikePdfBytes(prefix: Uint8Array): boolean {
  if (prefix.length < 5) return false;
  return String.fromCharCode(...prefix.subarray(0, 5)) === PDF_MAGIC;
}

/** Normalize axios/fetch blobs so download uses the correct MIME type (does not validate bytes). */
export function asPdfBlob(blob: Blob): Blob {
  if (blob.type === 'application/pdf') return blob;
  return new Blob([blob], { type: 'application/pdf' });
}

/**
 * Ensure blob bytes are a real PDF before pdf.js load.
 * Detects JSON/HTML API error bodies returned with responseType: 'blob'.
 */
export async function assertPdfBlob(blob: Blob): Promise<Blob> {
  const prefix = await readBlobPrefix(blob, 8);
  if (looksLikePdfBytes(prefix)) return asPdfBlob(blob);

  const snippet = await blob.slice(0, 512).text();
  const jsonMessage = tryParseJsonMessage(snippet);
  if (jsonMessage) throw new Error(jsonMessage);

  const trimmed = snippet.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    throw new Error('Server returned an HTML error page instead of a PDF file.');
  }

  throw new Error('Server did not return a valid PDF file.');
}

function tryParseJsonMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* not JSON */
  }
  return null;
}

/** Parse Nest/Fastify JSON errors when axios used responseType: 'blob'. */
export async function parseBlobApiError(data: unknown, fallback: string): Promise<string> {
  if (data instanceof Blob) {
    const text = await data.slice(0, 4096).text();
    const jsonMessage = tryParseJsonMessage(text);
    if (jsonMessage) return jsonMessage;
    const trimmed = text.trimStart();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return 'Server returned an HTML error page instead of the requested file.';
    }
    return fallback;
  }
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}

export async function normalizeDrawingFileBlob(blob: Blob): Promise<Blob> {
  if (blob.type.includes('json') || blob.size === 0) {
    const message = await parseBlobApiError(blob, 'Drawing file is not available.');
    throw new Error(message);
  }
  return assertPdfBlob(blob);
}
