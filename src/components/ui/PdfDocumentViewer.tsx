import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Search,
  ZoomIn,
  ZoomOut,
} from './icons';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type PdfFitMode = 'width' | 'page' | 'custom';

export interface PdfDocumentViewerProps {
  /** PDF bytes — primary render source (no blob: iframe). */
  blob: Blob | null;
  title: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  downloadFilename?: string;
  className?: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.15;
const PAGE_GAP = 12;

interface RenderedPage {
  pageNum: number;
  width: number;
  height: number;
}

/** Normalize axios/fetch blobs so download uses the correct MIME type. */
export function asPdfBlob(blob: Blob): Blob {
  if (blob.type === 'application/pdf') return blob;
  return new Blob([blob], { type: 'application/pdf' });
}

export default function PdfDocumentViewer({
  blob,
  title,
  loading = false,
  error = '',
  onRetry,
  downloadFilename,
  className = '',
}: PdfDocumentViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesHostRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);

  const [fitMode, setFitMode] = useState<PdfFitMode>('width');
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [pages, setPages] = useState<RenderedPage[]>([]);
  // True once the first page canvas has painted — clears the loading overlay so
  // multi-page docs are readable immediately while the rest render in.
  const [firstPagePainted, setFirstPagePainted] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState('');

  const ready = Boolean(blob) && !loading && !error && numPages > 0 && !rendering;

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    // Seed the size synchronously so the first page render doesn't have to wait
    // for the async ResizeObserver callback (avoids a blank first paint).
    const rect0 = el.getBoundingClientRect();
    if (rect0.width > 0) setContainerWidth(rect0.width);
    if (rect0.height > 0) setContainerHeight(rect0.height);
    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0) return;
      setContainerWidth(rect.width);
      setContainerHeight(rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!blob || loading || error) {
      setNumPages(0);
      setPages([]);
      setRenderError('');
      setFirstPagePainted(false);
      // Host stays mounted now, so clear any previously rendered canvases.
      pagesHostRef.current?.replaceChildren();
      pageRefs.current.clear();
      if (docRef.current) {
        void docRef.current.destroy();
        docRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const gen = ++renderGenRef.current;

    (async () => {
      try {
        setRendering(true);
        setRenderError('');
        setFirstPagePainted(false);
        if (docRef.current) {
          await docRef.current.destroy();
          docRef.current = null;
        }
        const data = await blob.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled || gen !== renderGenRef.current) {
          await doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfDocumentViewer] load failed', err);
          setRenderError('Could not load PDF document');
          setNumPages(0);
          setPages([]);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob, loading, error]);

  const computeScale = useCallback(
    async (doc: PDFDocumentProxy, pageNum: number): Promise<number> => {
      const pg = await doc.getPage(pageNum);
      const base = pg.getViewport({ scale: 1 });
      const pad = 24;
      const availW = Math.max(containerWidth - pad, 320);
      const availH = Math.max(containerHeight - pad, 400);

      if (fitMode === 'width') return availW / base.width;
      if (fitMode === 'page') return Math.min(availW / base.width, availH / base.height);
      return (availW / base.width) * zoom;
    },
    [containerWidth, containerHeight, fitMode, zoom],
  );

  useEffect(() => {
    const doc = docRef.current;
    const host = pagesHostRef.current;
    if (!doc || !host || numPages === 0 || containerWidth <= 0) return;

    let cancelled = false;
    const gen = ++renderGenRef.current;

    (async () => {
      setRendering(true);
      setRenderError('');
      host.replaceChildren();

      try {
        const rendered: RenderedPage[] = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum += 1) {
          if (cancelled || gen !== renderGenRef.current) return;

          const scale = await computeScale(doc, pageNum);
          const pg = await doc.getPage(pageNum);
          const viewport = pg.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'pdf-viewer-canvas';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${title} — page ${pageNum}`);

          const wrapper = document.createElement('div');
          wrapper.className = 'pdf-viewer-page';
          wrapper.dataset.page = String(pageNum);
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.height = `${viewport.height}px`;
          wrapper.appendChild(canvas);
          host.appendChild(wrapper);
          pageRefs.current.set(pageNum, wrapper);

          await pg.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;

          // Reveal the document as soon as the first page paints — remaining
          // pages of a multi-page drawing keep rendering behind the scenes.
          if (pageNum === 1) setFirstPagePainted(true);

          rendered.push({ pageNum, width: viewport.width, height: viewport.height });
        }

        if (!cancelled && gen === renderGenRef.current) {
          setPages(rendered);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfDocumentViewer] render failed', err);
          setRenderError('Could not render PDF pages');
          setPages([]);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numPages, containerWidth, containerHeight, fitMode, zoom, computeScale, title]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || pages.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target as HTMLElement | undefined;
        if (top?.dataset.page) {
          const n = Number.parseInt(top.dataset.page, 10);
          if (Number.isFinite(n)) setPage(n);
        }
      },
      { root: viewport, threshold: [0.25, 0.5, 0.75] },
    );

    pageRefs.current.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);

  const scrollToPage = useCallback((target: number) => {
    const clamped = Math.max(1, Math.min(target, numPages || 1));
    setPage(clamped);
    const el = pageRefs.current.get(clamped);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [numPages]);

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    try {
      await el.requestFullscreen();
    } catch {
      /* fullscreen may be blocked */
    }
  }, []);

  const zoomIn = () => {
    setFitMode('custom');
    setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  };

  const zoomOut = () => {
    setFitMode('custom');
    setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  };

  const applyWheelZoom = useCallback((deltaY: number) => {
    setFitMode('custom');
    setZoom(z => {
      const next = deltaY < 0 ? z + ZOOM_STEP : z - ZOOM_STEP;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +next.toFixed(2)));
    });
  }, []);

  const onViewportWheel = useCallback((e: ReactWheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      applyWheelZoom(e.deltaY);
    }
  }, [applyWheelZoom]);

  const fitWidth = () => {
    setFitMode('width');
    setZoom(1);
  };

  const fitPage = () => {
    setFitMode('page');
    setZoom(1);
  };

  const download = () => {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = downloadFilename ?? 'report.pdf';
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const runSearch = useCallback(async () => {
    const doc = docRef.current;
    const q = searchQuery.trim().toLowerCase();
    if (!doc || !q) return;

    setSearchStatus('Searching…');
    try {
      for (let i = 1; i <= doc.numPages; i += 1) {
        const pg = await doc.getPage(i);
        const content = await pg.getTextContent();
        const text = content.items
          .map(item => ('str' in item ? item.str : ''))
          .join(' ')
          .toLowerCase();
        if (text.includes(q)) {
          scrollToPage(i);
          setSearchStatus(`Found on page ${i}`);
          return;
        }
      }
      setSearchStatus('No matches');
    } catch {
      setSearchStatus('Search unavailable for this document');
    }
  }, [searchQuery, scrollToPage]);

  const displayError = error || renderError;
  const busy = loading || rendering;

  const pagesStyle: CSSProperties = {
    gap: PAGE_GAP,
  };

  return (
    <div
      ref={shellRef}
      className={`pdf-viewer ${isFullscreen ? 'pdf-viewer--fullscreen' : ''} ${className}`.trim()}
    >
      <div className="pdf-viewer-toolbar" role="toolbar" aria-label="Document viewer controls">
        <div className="pdf-viewer-toolbar-group">
          <button type="button" className="pdf-viewer-btn" onClick={zoomOut} disabled={!ready} aria-label="Zoom out" title="Zoom out">
            <ZoomOut size={18} strokeWidth={1.75} />
          </button>
          <span className="pdf-viewer-zoom-label" aria-live="polite">
            {fitMode === 'custom' ? `${Math.round(zoom * 100)}%` : fitMode === 'width' ? 'Fit width' : 'Fit page'}
          </span>
          <button type="button" className="pdf-viewer-btn" onClick={zoomIn} disabled={!ready} aria-label="Zoom in" title="Zoom in">
            <ZoomIn size={18} strokeWidth={1.75} />
          </button>
          <span className="pdf-viewer-divider" aria-hidden />
          <button
            type="button"
            className={`pdf-viewer-btn pdf-viewer-btn--text${fitMode === 'width' ? ' is-active' : ''}`}
            onClick={fitWidth}
            disabled={!ready}
          >
            Fit width
          </button>
          <button
            type="button"
            className={`pdf-viewer-btn pdf-viewer-btn--text${fitMode === 'page' ? ' is-active' : ''}`}
            onClick={fitPage}
            disabled={!ready}
          >
            Fit page
          </button>
        </div>

        <div className="pdf-viewer-toolbar-group">
          <button type="button" className="pdf-viewer-btn" onClick={() => scrollToPage(page - 1)} disabled={!ready || page <= 1} aria-label="Previous page">
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <span className="pdf-viewer-page-label">
            <span className="pdf-viewer-page-prefix">Page</span>
            <input
              type="number"
              className="pdf-viewer-page-input"
              min={1}
              max={numPages || undefined}
              value={page}
              onChange={e => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 1) scrollToPage(n);
              }}
              disabled={!ready}
              aria-label="Current page"
            />
            {numPages > 0 && <span className="pdf-viewer-page-total">/ {numPages}</span>}
          </span>
          <button
            type="button"
            className="pdf-viewer-btn"
            onClick={() => scrollToPage(page + 1)}
            disabled={!ready || page >= numPages}
            aria-label="Next page"
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="pdf-viewer-toolbar-group pdf-viewer-toolbar-group--end">
          <button
            type="button"
            className={`pdf-viewer-btn${searchOpen ? ' is-active' : ''}`}
            onClick={() => setSearchOpen(v => !v)}
            disabled={!ready}
            aria-label="Search in document"
            title="Search text"
          >
            <Search size={18} strokeWidth={1.75} />
          </button>
          <button type="button" className="pdf-viewer-btn" onClick={() => void toggleFullscreen()} disabled={!ready} aria-label="Toggle fullscreen">
            <Maximize size={18} strokeWidth={1.75} />
          </button>
          {blob && downloadFilename && (
            <button type="button" className="pdf-viewer-btn pdf-viewer-btn--text" onClick={download}>
              <Download size={16} strokeWidth={1.75} />
              <span>Download</span>
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="pdf-viewer-search-bar" role="search">
          <input
            type="search"
            className="pdf-viewer-search-input"
            placeholder="Search in document…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void runSearch(); }}
            aria-label="Search query"
          />
          <button type="button" className="pdf-viewer-btn pdf-viewer-btn--text" onClick={() => void runSearch()} disabled={!searchQuery.trim()}>
            Find
          </button>
          {searchStatus && <span className="pdf-viewer-search-status" role="status">{searchStatus}</span>}
        </div>
      )}

      <div className="pdf-viewer-body">
        {/*
          The viewport stays mounted for the component's whole lifetime so the
          ResizeObserver stays bound to the live node and the canvas mount point
          (pagesHostRef) is always available. Loading/error render as overlays on
          top — never as a replacement — otherwise unmounting the viewport during
          load detaches the observer, leaves containerWidth at 0, and the page
          render bails (blank viewer).
        */}
        <div ref={viewportRef} className="pdf-viewer-viewport" onWheel={onViewportWheel}>
          <div ref={pagesHostRef} className="pdf-viewer-pages" style={pagesStyle} />
        </div>
        {displayError && (
          <div className="pdf-viewer-overlay">
            <p className="form-error m-0">{displayError}</p>
            {onRetry && (
              <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}
        {busy && !displayError && !firstPagePainted && (
          <div className="pdf-viewer-overlay">Loading document…</div>
        )}
      </div>
    </div>
  );
}
