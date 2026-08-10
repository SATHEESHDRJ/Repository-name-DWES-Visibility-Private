/** Lazy-load jsQR from CDN (matches legacy wiring-app approach). */
export type JsQRResult = {
  data: string;
  location: {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
  };
};

export type JsQRFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' },
) => JsQRResult | null;

declare global {
  interface Window {
    jsQR?: JsQRFn;
  }
}

let loadPromise: Promise<JsQRFn> | null = null;

export function loadJsQR(): Promise<JsQRFn> {
  if (typeof window !== 'undefined' && window.jsQR) {
    return Promise.resolve(window.jsQR);
  }
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-jsqr]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.jsQR!));
        existing.addEventListener('error', () => reject(new Error('jsQR failed to load')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.async = true;
      script.dataset.jsqr = '1';
      script.onload = () => {
        if (window.jsQR) resolve(window.jsQR);
        else reject(new Error('jsQR not available after load'));
      };
      script.onerror = () => reject(new Error('jsQR script failed'));
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

export async function decodeQrFromImage(file: File): Promise<string | null> {
  const jsQR = await loadJsQR();
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? null;
}
