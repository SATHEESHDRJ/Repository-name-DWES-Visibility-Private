import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Modal from '../Modal';
import FileViewer, { type FileViewerType } from './FileViewer';
import PanelDrawingUploadModal from '../supervisor/PanelDrawingUploadModal';
import { Download, FileText, PenTool, RefreshCw, Upload } from './icons';
import { projectsApi } from '../../services/api';
import {
  canDownloadPanelDrawingSlot,
  canUploadPanelDrawingSlot,
  panelDrawingAssetForSlot,
  type PanelDrawingAsset,
  type PanelDrawingPackage,
} from '../../types/panelDrawing';
import { useLatestRequest } from '../../hooks/useLatestRequest';

interface SlotFileState {
  blob: Blob | null;
  loading: boolean;
  error: string;
}

type GaTab = '2d' | 'revisions';

const EMPTY_FILE: SlotFileState = { blob: null, loading: false, error: '' };
const NATIVE_IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function normalizedFormat(value?: string) {
  return (value || '').toLowerCase().replace(/^\./, '');
}

function effectiveFormat(asset: PanelDrawingAsset) {
  if (asset.preview?.status === 'ready' || asset.preview?.status === 'source') {
    return normalizedFormat(asset.preview.format || asset.preview.filename.split('.').pop());
  }
  return normalizedFormat(asset.source_format || asset.original_name.split('.').pop());
}

function fileViewerType(asset: PanelDrawingAsset): FileViewerType {
  const format = effectiveFormat(asset);
  if (format === 'pdf') return 'pdf';
  if (NATIVE_IMAGE_FORMATS.has(format)) return 'image';
  return 'download-only';
}

function isDirectlyViewable(asset: PanelDrawingAsset) {
  const format = effectiveFormat(asset);
  if (asset.preview?.status === 'pending' || asset.preview?.status === 'failed') return false;
  return format === 'pdf' || NATIVE_IMAGE_FORMATS.has(format);
}

function conversionMessage(asset: PanelDrawingAsset) {
  if (asset.preview?.status === 'pending') {
    return 'A secure browser preview is still being prepared for this GA drawing.';
  }
  if (asset.preview?.status === 'failed') {
    return asset.preview.error
      || 'A secure browser preview is not available. Download the original GA drawing to open it in a desktop viewer.';
  }
  return 'This GA drawing format cannot be previewed in the browser. Download the original file to open it.';
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function PanelGaDrawingModal({
  projectCode,
  projectName,
  frameId,
  panelName,
  onClose,
  initialTab = '2d',
}: {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelName: string;
  onClose: () => void;
  initialTab?: GaTab;
}) {
  const tabRefs = useRef<Partial<Record<GaTab, HTMLButtonElement | null>>>({});
  const {
    begin: beginPackageRequest,
    isLatest: isLatestPackageRequest,
    cancel: cancelPackageRequest,
  } = useLatestRequest();
  const {
    begin: beginSlotFileRequest,
    isLatest: isLatestSlotFileRequest,
    cancel: cancelSlotFileRequest,
  } = useLatestRequest();

  const [drawingPackage, setDrawingPackage] = useState<PanelDrawingPackage | null>(null);
  const [packageLoading, setPackageLoading] = useState(true);
  const [packageError, setPackageError] = useState('');
  const [activeTab, setActiveTab] = useState<GaTab>(initialTab);
  const [visited, setVisited] = useState<Set<GaTab>>(() => new Set([initialTab]));
  const [file2d, setFile2d] = useState<SlotFileState>(EMPTY_FILE);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionNotice, setActionNotice] = useState('');

  useEffect(() => {
    cancelPackageRequest();
    cancelSlotFileRequest();
    setDrawingPackage(null);
    setPackageLoading(true);
    setPackageError('');
    setFile2d(EMPTY_FILE);
    setDownloadBusy(false);
    setActionNotice('');
    setActiveTab(initialTab);
    setVisited(new Set([initialTab]));
  }, [cancelPackageRequest, cancelSlotFileRequest, projectCode, frameId, initialTab]);

  useEffect(() => {
    setVisited(current => (current.has(activeTab) ? current : new Set(current).add(activeTab)));
  }, [activeTab]);

  const loadPackage = useCallback(async () => {
    const request = beginPackageRequest();
    setPackageLoading(true);
    setPackageError('');
    try {
      const data = await projectsApi.panelDrawing(projectCode, frameId, request.signal) as PanelDrawingPackage;
      if (!isLatestPackageRequest(request.id)) return;
      if (data.project_code !== projectCode || data.frame_id !== frameId) {
        throw new Error('The drawing response did not match the selected project and panel.');
      }
      setDrawingPackage(data);
    } catch (err: any) {
      if (!isLatestPackageRequest(request.id) || request.signal.aborted) return;
      setDrawingPackage(null);
      setPackageError(err?.response?.data?.message || err?.message || 'Unable to load the GA drawing record for this panel.');
    } finally {
      if (isLatestPackageRequest(request.id)) setPackageLoading(false);
    }
  }, [beginPackageRequest, frameId, isLatestPackageRequest, projectCode]);

  useEffect(() => { void loadPackage(); }, [loadPackage, refreshKey]);

  useEffect(() => {
    if (!drawingPackage) {
      cancelSlotFileRequest();
      return;
    }
    setFile2d(EMPTY_FILE);
    const asset = panelDrawingAssetForSlot(drawingPackage, '2d');
    if (!asset || !isDirectlyViewable(asset)) {
      cancelSlotFileRequest();
      return;
    }
    const request = beginSlotFileRequest();
    setFile2d({ blob: null, loading: true, error: '' });
    projectsApi.panelDrawingSlotFile(projectCode, frameId, '2d', request.signal)
      .then(blob => {
        if (isLatestSlotFileRequest(request.id)) {
          setFile2d({ blob, loading: false, error: '' });
        }
      })
      .catch((err: any) => {
        if (isLatestSlotFileRequest(request.id) && !request.signal.aborted) {
          setFile2d({
            blob: null,
            loading: false,
            error: err?.response?.data?.message || 'Unable to load the GA drawing.',
          });
        }
      });

    return () => {
      if (isLatestSlotFileRequest(request.id)) cancelSlotFileRequest();
    };
  }, [
    beginSlotFileRequest,
    cancelSlotFileRequest,
    drawingPackage,
    frameId,
    isLatestSlotFileRequest,
    projectCode,
  ]);

  const drawing2d = drawingPackage?.drawing_2d ?? null;
  const canUpload = drawingPackage ? canUploadPanelDrawingSlot(drawingPackage, '2d') : false;
  const canDownload = drawingPackage ? canDownloadPanelDrawingSlot(drawingPackage, '2d') : false;

  const availableTabs: GaTab[] = useMemo(() => {
    const tabs: GaTab[] = [];
    if (drawing2d) tabs.push('2d');
    tabs.push('revisions');
    return tabs;
  }, [drawing2d]);

  useEffect(() => {
    if (!packageLoading && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? 'revisions');
    }
  }, [availableTabs, activeTab, packageLoading]);

  const download = async () => {
    if (!canDownload || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const blob = await projectsApi.panelDrawingSlotDownload(projectCode, frameId, '2d');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = drawing2d?.original_name || 'ga-drawing';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setPackageError(err?.response?.data?.message || 'Unable to download the GA drawing.');
    } finally {
      setDownloadBusy(false);
    }
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: GaTab) => {
    const order = availableTabs;
    const index = order.indexOf(tab);
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % order.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(order[next]);
    tabRefs.current[order[next]]?.focus();
  };

  const tabLabel: Record<GaTab, string> = {
    '2d': 'GA Drawing',
    revisions: 'Revisions',
  };

  return (
    <>
      <Modal
        title="GA View"
        subtitle={`${projectName || projectCode} · ${panelName} · Panel-specific`}
        icon={<PenTool />}
        onClose={onClose}
        size="fullscreen"
        bodyClassName="modal-body-flush"
      >
        <div className="ga-drawing-shell">
          <div className="ga-drawing-tabs" role="tablist" aria-label="GA drawing views">
            {availableTabs.map(tab => (
              <button
                key={tab}
                ref={element => { tabRefs.current[tab] = element; }}
                id={`ga-tab-${tab}`}
                type="button"
                role="tab"
                aria-controls={`ga-panel-${tab}`}
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                className={activeTab === tab ? 'is-active' : ''}
                onClick={() => setActiveTab(tab)}
                onKeyDown={event => onTabKeyDown(event, tab)}
              >
                {tabLabel[tab]}
              </button>
            ))}

            <div className="ga-drawing-tab-actions">
              {canUpload && (
                <button type="button" className="ga-drawing-upload-action" onClick={() => setUploadOpen(true)}>
                  <Upload size={15} />
                  <span>{drawing2d ? 'Replace GA Drawing' : 'Upload GA Drawing'}</span>
                </button>
              )}
            </div>
          </div>

          {actionNotice && (
            <div className="pm-action-note is-ok" role="status">{actionNotice}</div>
          )}

          {packageLoading ? (
            <div className="ga-viewer-message">Loading this panel’s GA drawing record…</div>
          ) : packageError ? (
            <div className="ga-viewer-message" role="alert">
              <p>{packageError}</p>
              <button type="button" className="btn-secondary" onClick={() => setRefreshKey(key => key + 1)}>
                <RefreshCw size={16} />Retry
              </button>
            </div>
          ) : (
            <div className="ga-drawing-panes">
              {drawing2d && visited.has('2d') && (
                <section
                  id="ga-panel-2d"
                  role="tabpanel"
                  aria-labelledby="ga-tab-2d"
                  aria-hidden={activeTab !== '2d'}
                  className={`ga-drawing-pane${activeTab === '2d' ? ' is-active' : ''}`}
                >
                  <div className="ga-drawing-filebar">
                    <span>GA Drawing</span>
                    <strong title={drawing2d.original_name}>{drawing2d.original_name}</strong>
                    {drawing2d.preview?.status === 'ready' && (
                      <small>Secure {drawing2d.preview.format.toUpperCase()} preview</small>
                    )}
                    {canDownload && (
                      <button
                        type="button"
                        className="ga-filebar-action"
                        onClick={() => void download()}
                        disabled={downloadBusy}
                      >
                        <Download size={15} />{downloadBusy ? 'Preparing…' : 'Download original'}
                      </button>
                    )}
                  </div>

                  {!isDirectlyViewable(drawing2d) ? (
                    <div
                      className="ga-viewer-message ga-viewer-message--conversion"
                      role={drawing2d.preview?.status === 'failed' ? 'alert' : 'status'}
                    >
                      <FileText size={28} />
                      <strong>{conversionMessage(drawing2d)}</strong>
                      {drawing2d.preview?.status === 'pending' && (
                        <span className="ga-conversion-pulse">Conversion pending</span>
                      )}
                      {canDownload && (
                        <button type="button" className="btn-secondary" onClick={() => void download()}>
                          <Download size={16} />Download original
                        </button>
                      )}
                    </div>
                  ) : (
                    <FileViewer
                      blob={file2d.blob}
                      fileType={fileViewerType(drawing2d)}
                      panelLabel={panelName}
                      fileName={drawing2d.original_name}
                      loading={file2d.loading}
                      error={file2d.error}
                      onRetry={() => setRefreshKey(key => key + 1)}
                      onDownload={canDownload ? () => void download() : undefined}
                      className="ga-file-viewer"
                    />
                  )}
                </section>
              )}

              <section
                id="ga-panel-revisions"
                role="tabpanel"
                aria-labelledby="ga-tab-revisions"
                aria-hidden={activeTab !== 'revisions'}
                className={`ga-drawing-pane ga-drawing-pane--scroll${activeTab === 'revisions' ? ' is-active' : ''}`}
              >
                {visited.has('revisions') && (
                  !drawingPackage ? (
                    <div className="ga-viewer-message" role="alert">
                      No GA drawing is available for this panel
                    </div>
                  ) : (
                    <div className="pm-revisions">
                      <section>
                        <h4>GA drawing package · revision {drawingPackage.revision}</h4>
                        <table className="pm-table">
                          <thead>
                            <tr><th>Slot</th><th>File</th><th>Uploaded</th></tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>GA drawing</td>
                              <td>{drawing2d ? drawing2d.original_name : '—'}</td>
                              <td>{formatDateTime(drawing2d?.uploaded_at)}</td>
                            </tr>
                          </tbody>
                        </table>
                        {!drawing2d && (
                          <p className="pm-empty">No GA drawing is available for this panel</p>
                        )}
                      </section>
                    </div>
                  )
                )}
              </section>
            </div>
          )}
        </div>
      </Modal>

      {uploadOpen && drawingPackage && (
        <PanelDrawingUploadModal
          projectCode={projectCode}
          projectName={projectName}
          frameId={frameId}
          panelName={panelName}
          slot="2d"
          existingAsset={panelDrawingAssetForSlot(drawingPackage, '2d')}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            cancelPackageRequest();
            cancelSlotFileRequest();
            setDrawingPackage(null);
            setPackageLoading(true);
            setFile2d(EMPTY_FILE);
            setActionNotice('GA Drawing uploaded successfully');
            setRefreshKey(key => key + 1);
          }}
        />
      )}
    </>
  );
}
