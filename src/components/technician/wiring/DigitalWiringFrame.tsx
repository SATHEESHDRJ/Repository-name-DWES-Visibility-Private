import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ZoomIn, ZoomOut } from '../../ui/icons';
import type { Cable } from '../../../types';
import {
  CABLE_VISUAL_HEADER,
  DEFAULT_CABLE_STATUS,
  cableMissingFields,
  cableStatusChip,
  deriveTechnicianExcelHeaders,
  displayValue,
  filterCableIndexes,
  getExactExcelCellValue,
  isCableVisualHeader,
  parseLengthMeters,
  resolveCableVisualData,
  summarizeCableStatus,
  summarizeCrimpingStatus,
  splitHeadersAroundCableVisual,
  wireColorHex,
  type ExtendedCableStatus,
  type ScheduleFilterMode,
  type TechnicianExecutionMode,
} from './wiring-utils';
import EquipmentWiringStatusHeader from './EquipmentWiringStatusHeader';
import { CableVisualMiniCell } from './CableVisualPath';
import SingleWireMatrixCard, { type WireCorrectionView } from './SingleWireMatrixCard';

interface RowProps {
  cable: Cable;
  index: number;
  st: ExtendedCableStatus;
  maxLen: number;
  blinkAlert: boolean;
  isActive?: boolean;
  onSelectRow?: (idx: number) => void;
  headers: string[];
  mapping: Record<string, string>;
}

const ExcelScheduleRow = memo(function ExcelScheduleRow({
  cable, index, st, maxLen, blinkAlert, isActive, onSelectRow, headers, mapping,
}: RowProps) {
  const chip = cableStatusChip(st);
  const skipped = /\[SKIPPED /.test(st.note || '') && !(st.src && st.dst);

  return (
    <tr
      className={`dwf-row${st.src && st.dst ? ' done' : ''}${st.issue ? ' issue' : ''}${isActive ? ' dwf-row--active' : ''}`}
      data-dwf-row={index}
      data-wiring-record-id={cable.record_id || undefined}
      data-excel-row={cable.excel_row || undefined}
      onClick={onSelectRow ? () => onSelectRow(index) : undefined}
      style={onSelectRow ? { cursor: 'pointer' } : undefined}
    >
      <td className="dwf-td-no" data-label="No.">
        <button
          type="button"
          className="dwf-no-btn"
          onClick={e => { e.stopPropagation(); onSelectRow?.(index); }}
          title={`Go to serial ${cable.sno ?? index + 1}`}
        >
          {cable.sno ?? index + 1}
        </button>
      </td>
      {headers.map(header => {
        if (isCableVisualHeader(header)) {
          return (
            <td key={header} className="dwf-td-path" data-label={CABLE_VISUAL_HEADER}>
              <CableVisualMiniCell cable={cable} mapping={mapping} maxLen={maxLen} openEnd={st.openEnd ?? null} statusNote={st.note || ''} />
            </td>
          );
        }
        const value = getExactExcelCellValue(cable, header, mapping);
        return (
          <td key={header} data-label={header} title={value || undefined}>
            {value}
          </td>
        );
      })}
      <td className="dwf-td-status" data-label="Status">
        <span className={`dwf-status-chip ${chip.tone}${blinkAlert ? ' blink' : ''}`}>
          {skipped ? 'Skipped — Pending' : chip.label}
        </span>
      </td>
    </tr>
  );
});

/** Legacy fixed-column row when Excel headers cannot place a Cable Visual slot. */
const DwRow = memo(function DwRow({
  cable, index, st, maxLen, blinkAlert, isActive, onSelectRow, mapping,
}: Omit<RowProps, 'headers'>) {
  const missing = cableMissingFields(cable);
  const chip = cableStatusChip(st);
  const visualData = resolveCableVisualData(cable, mapping);
  const { hex } = wireColorHex(visualData.color);
  const skipped = /\[SKIPPED /.test(st.note || '') && !(st.src && st.dst);

  return (
    <tr
      className={`dwf-row${st.src && st.dst ? ' done' : ''}${st.issue ? ' issue' : ''}${isActive ? ' dwf-row--active' : ''}`}
      data-dwf-row={index}
      onClick={onSelectRow ? () => onSelectRow(index) : undefined}
      style={onSelectRow ? { cursor: 'pointer' } : undefined}
    >
      <td className="dwf-td-no" data-label="No.">
        <button
          type="button"
          className="dwf-no-btn"
          onClick={e => { e.stopPropagation(); onSelectRow?.(index); }}
          title={`Go to serial ${cable.sno ?? index + 1}`}
        >
          {cable.sno ?? index + 1}
        </button>
      </td>
      <td className="dwf-td-ferrule" data-label="Ferrule">
        {missing.includes('ferrule')
          ? <span className="dwf-missing">missing</span>
          : cable.ferrule}
      </td>
      <td className="dwf-td-mono" data-label="Source">
        {missing.includes('source')
          ? <span className="dwf-missing">missing</span>
          : displayValue(cable.source)}
      </td>
      <td className="dwf-td-path" data-label={CABLE_VISUAL_HEADER}>
        <CableVisualMiniCell cable={cable} mapping={mapping} maxLen={maxLen} openEnd={st.openEnd ?? null} statusNote={st.note || ''} />
      </td>
      <td className="dwf-td-mono" data-label="Destination">
        {missing.includes('destination')
          ? <span className="dwf-missing">missing</span>
          : displayValue(cable.destination)}
      </td>
      <td className="dwf-td-color" data-label="Color">
        <span className="dwf-swatch" style={{ background: hex }} />
        {displayValue(visualData.color)}
      </td>
      <td className="dwf-td-mono" data-label="Size">{displayValue(visualData.size)}</td>
      <td className="dwf-td-mono" data-label="Length">{displayValue(visualData.length)}</td>
      <td className="dwf-td-status" data-label="Status">
        <span className={`dwf-status-chip ${chip.tone}${blinkAlert ? ' blink' : ''}`}>
          {skipped ? 'Skipped — Pending' : chip.label}
        </span>
      </td>
    </tr>
  );
});

/* Cable-illustration zoom (single-wire view only) — clamped so the cell can
   never collapse below legibility or outgrow the scrollable table wrap. */
const CV_ZOOM_MIN = 0.7;
const CV_ZOOM_MAX = 1.6;
const CV_ZOOM_STEP = 0.15;

interface Props {
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  alertRows?: Set<string>;
  activeIndex?: number;
  onActiveIndexChange?: (idx: number) => void;
  mapping?: Record<string, string>;
  excelHeaders?: string[];
  fullViewOpen: boolean;
  setFullViewOpen: (open: boolean) => void;
  scheduleFilter?: ScheduleFilterMode;
  tagQuery?: string;
  equipmentQuery?: string;
  onEquipmentQueryChange?: (equipment: string) => void;
  /** Corrections for the active wire (technician overlay). */
  activeCorrections?: WireCorrectionView[];
  onShowCorrectionHistory?: () => void;
  canEditCorrections?: boolean;
  correctableFields?: Array<{ field: string; label: string }>;
  correctionBusy?: boolean;
  onSaveCorrection?: (payload: {
    field: string;
    corrected_value: string;
    reason: string;
  }) => Promise<void> | void;
  /** Technician execution mode — drives KPI row labels and wire-card readiness. */
  executionMode?: TechnicianExecutionMode;
}

/** Live status line for Tag / Skipped filters above the schedule column header. */
function scheduleFilterStatusText(
  scheduleFilter: ScheduleFilterMode,
  tagQuery: string,
  filteredIndexes: number[],
  activeIndex: number,
): string | null {
  if (scheduleFilter === 'none') return null;
  const matchPos = filteredIndexes.indexOf(activeIndex);
  const pos = matchPos >= 0 ? matchPos + 1 : 0;
  const total = filteredIndexes.length;
  if (scheduleFilter === 'tag') {
    return `Tag Cable-Wise Filter active — Tag: ${tagQuery.trim()} — Matching cable ${pos} of ${total}`;
  }
  return `Skipped Wire Filter active — Showing skipped wires only — Skipped wire ${pos} of ${total}`;
}

/**
 * Digital Wiring Schedule — single-wire execution view (no Operational Twin).
 * Cable Visual sits between source ferrule (IEC_FERR_A) and destination ferrule (IEC_FERR_B)
 * per ENOWA Excel column order.
 */
export default function DigitalWiringFrame({
  cables, status, alertRows, activeIndex = 0, onActiveIndexChange,
  mapping = {}, excelHeaders: excelHeadersProp,
  fullViewOpen, setFullViewOpen,
  scheduleFilter = 'none',
  tagQuery = '',
  equipmentQuery = '',
  onEquipmentQueryChange,
  activeCorrections = [],
  onShowCorrectionHistory,
  canEditCorrections = false,
  correctableFields = [],
  correctionBusy = false,
  onSaveCorrection,
  executionMode = 'wiring',
}: Props) {
  const [visualZoom, setVisualZoom] = useState(1);

  const getStatus = useCallback(
    (idx: number) => status[String(idx)] || DEFAULT_CABLE_STATUS,
    [status],
  );

  const maxLen = useMemo(() => {
    const lens = cables
      .map(c => parseLengthMeters(resolveCableVisualData(c, mapping).length))
      .filter((v): v is number => v != null && v > 0);
    return lens.length ? Math.max(...lens) : 0;
  }, [cables, mapping]);

  const filteredIndexes = useMemo(
    () => filterCableIndexes(cables, status, scheduleFilter, tagQuery, equipmentQuery),
    [cables, status, scheduleFilter, tagQuery, equipmentQuery],
  );

  const statusSummary = useMemo(() => summarizeCableStatus(cables, status), [cables, status]);
  const crimpingSummary = useMemo(() => summarizeCrimpingStatus(cables, status), [cables, status]);
  const wireNumber = cables.length > 0 ? activeIndex + 1 : 0;
  const crimpingMode = executionMode === 'crimping';

  const activeCable = cables[activeIndex];
  const activeSt = getStatus(activeIndex);

  const excelHeaders = useMemo(
    () => deriveTechnicianExcelHeaders(mapping, excelHeadersProp, activeCable?._raw),
    [mapping, excelHeadersProp, activeCable?._raw],
  );

  const headerSplit = useMemo(
    () => splitHeadersAroundCableVisual(excelHeaders, mapping),
    [excelHeaders, mapping],
  );

  const jumpToCable = (idx: number) => {
    onActiveIndexChange?.(idx);
  };

  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(filteredIndexes.length / PAGE_SIZE) || 1;
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!fullViewOpen) return;
    const pos = filteredIndexes.indexOf(activeIndex);
    setPage(pos >= 0 ? Math.floor(pos / PAGE_SIZE) : 0);
  }, [fullViewOpen, activeIndex, filteredIndexes]);

  if (fullViewOpen) {
    const useExcelCols = headerSplit.hasSlot && headerSplit.headers.length > 0;
    const startIndex = page * PAGE_SIZE;
    const pagedIndexes = filteredIndexes.slice(startIndex, startIndex + PAGE_SIZE);
    const filterLabel = scheduleFilter === 'tag'
      ? `Tag filter: “${tagQuery.trim()}” — ${filteredIndexes.length} of ${cables.length} cables`
      : scheduleFilter === 'skipped'
        ? `Skipped filter — ${filteredIndexes.length} of ${cables.length} cables`
        : null;

    const fullSchedule = (
      <div className="dwf-shell dwf-shell--full-schedule dwf-shell--full-viewport">
        <div className="dwf-full-header flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="dwf-workspace-back dwf-full-exit"
              onClick={() => setFullViewOpen(false)}
              aria-label="Return to Web View"
              title="Return to Web View"
            >
              <ArrowLeft size={18} />
              <span>Return to Web View</span>
            </button>
            <div className="dwf-full-header-text">
              <h3 className="dwf-full-title">Full Wiring Schedule</h3>
              <p className="dwf-full-sub">
                {filterLabel
                  ?? `Reference view — showing ${filteredIndexes.length === 0 ? 0 : startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, filteredIndexes.length)} of ${filteredIndexes.length} cables.`}
              </p>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-xs">
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-700 font-medium disabled:opacity-40"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </button>
              <span className="px-2 font-semibold text-slate-700 dark:slate-300">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-700 font-medium disabled:opacity-40"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </button>
              <button
                type="button"
                className="ml-2 px-2 py-1 text-accent font-semibold hover:underline"
                onClick={() => {
                  const pos = filteredIndexes.indexOf(activeIndex);
                  if (pos >= 0) setPage(Math.floor(pos / PAGE_SIZE));
                }}
                title="Jump to active cable page"
              >
                Active Cable (#{activeIndex + 1})
              </button>
            </div>
          )}
        </div>

        <div className="dwf-table-wrap dwf-table-wrap--full">
          <table className="dwf-table dwf-table--schedule">
            <thead>
              <tr>
                <th className="dwf-th-no">No.</th>
                {useExcelCols ? (
                  <>
                    {headerSplit.headers.map(header => (
                      <th
                        key={header}
                        className={isCableVisualHeader(header) ? 'dwf-th-path' : undefined}
                        title={header}
                      >
                        {header}
                      </th>
                    ))}
                    <th>Status</th>
                  </>
                ) : (
                  <>
                    <th>Ferrule</th>
                    <th>Source</th>
                    <th className="dwf-th-path">{CABLE_VISUAL_HEADER}</th>
                    <th>Destination</th>
                    <th>Color</th>
                    <th>Size</th>
                    <th>Length</th>
                    <th>Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pagedIndexes.map(index => {
                const cable = cables[index];
                return useExcelCols ? (
                  <ExcelScheduleRow
                    key={cable.record_id || cable.excel_row || index}
                    cable={cable}
                    index={index}
                    st={getStatus(index)}
                    maxLen={maxLen}
                    blinkAlert={alertRows?.has(String(index)) ?? false}
                    isActive={index === activeIndex}
                    onSelectRow={jumpToCable}
                    headers={headerSplit.headers}
                    mapping={mapping}
                  />
                ) : (
                  <DwRow
                    key={cable.record_id || cable.excel_row || index}
                    cable={cable}
                    index={index}
                    st={getStatus(index)}
                    maxLen={maxLen}
                    blinkAlert={alertRows?.has(String(index)) ?? false}
                    isActive={index === activeIndex}
                    onSelectRow={jumpToCable}
                    mapping={mapping}
                  />
                );
              })}
              {pagedIndexes.length === 0 && (
                <tr>
                  <td colSpan={useExcelCols ? headerSplit.headers.length + 2 : 9} className="text-center py-8 text-slate-500">
                    No cables match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    return createPortal(
      <div
        className="dwf-full-view-root"
        role="dialog"
        aria-modal="true"
        aria-label="Full wiring schedule reference view"
      >
        {fullSchedule}
      </div>,
      document.body,
    );
  }

  if (!activeCable) {
    return (
      <div className="dwf-shell dwf-shell--tablet-opt dwf-shell--single-exec">
        <p className="empty-text p-6 text-center">No cables in this wiring schedule.</p>
      </div>
    );
  }

  if (scheduleFilter !== 'none' && filteredIndexes.length === 0) {
    const emptyFilterStatus = scheduleFilterStatusText(
      scheduleFilter, tagQuery, filteredIndexes, activeIndex,
    );
    return (
      <div className="dwf-shell dwf-shell--tablet-opt dwf-shell--single-exec">
        {emptyFilterStatus && (
          <div className="dwf-filter-status-bar" role="status" aria-live="polite">
            {emptyFilterStatus}
          </div>
        )}
        <p className="empty-text p-6 text-center">No cables match this filter.</p>
      </div>
    );
  }

  if (equipmentQuery.trim() && filteredIndexes.length === 0) {
    return (
      <div className="dwf-shell dwf-shell--tablet-opt dwf-shell--single-exec">
        <div className="dwf-equip-empty" role="status">
          <p className="dwf-equip-empty__title">No pending wires found for this equipment.</p>
          <p className="dwf-equip-empty__sub">Equipment: {equipmentQuery.trim()}</p>
          {onEquipmentQueryChange ? (
            <button
              type="button"
              className="btn-secondary btn-sm mt-3"
              onClick={() => onEquipmentQueryChange('')}
            >
              Clear Filter
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const adjustVisualZoom = (dir: 1 | -1) => setVisualZoom(z =>
    Math.min(CV_ZOOM_MAX, Math.max(CV_ZOOM_MIN, Math.round((z + dir * CV_ZOOM_STEP) * 100) / 100)));

  const filterStatusText = scheduleFilterStatusText(
    scheduleFilter, tagQuery, filteredIndexes, activeIndex,
  );

  return (
    <div className="dwf-shell dwf-shell--tablet-opt dwf-shell--single-exec">
      <div className="dwf-exec-toolbar" style={{ position: 'relative' }}>
        <div className="flex items-center gap-2">
          <div className="dwf-cv-zoom-bar" role="group" aria-label="Active cable row zoom">
            <button
              type="button"
              className="dwf-cv-zoom-btn"
              onClick={() => adjustVisualZoom(1)}
              disabled={visualZoom >= CV_ZOOM_MAX - 0.001}
              title="Zoom in active cable visual"
              aria-label="Zoom in active cable visual"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              className="dwf-cv-zoom-btn"
              onClick={() => adjustVisualZoom(-1)}
              disabled={visualZoom <= CV_ZOOM_MIN + 0.001}
              title="Zoom out active cable visual"
              aria-label="Zoom out active cable visual"
            >
              <ZoomOut size={14} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="dwf-progress-matrix dwf-progress-matrix--compact"
        role="region"
        aria-label={crimpingMode ? 'Crimping progress matrix' : 'Wiring progress matrix'}
      >
        <div className="dwf-progress-card dwf-progress-card--wire" title="Current wire number in the Digital Wiring Schedule">
          <span className="dwf-progress-card__label">Wire Number</span>
          <span className="dwf-progress-card__value" aria-live="polite">
            <span className="dwf-progress-card__count dwf-progress-card__count--wire">
              <span className="dwf-progress-matrix__wire-current">{wireNumber}</span>
              <span className="dwf-progress-matrix__wire-sep">/</span>
              <span className="dwf-progress-matrix__wire-total">{statusSummary.total}</span>
            </span>
          </span>
        </div>

        <EquipmentWiringStatusHeader
          cables={cables}
          status={status}
          equipmentQuery={equipmentQuery}
          onEquipmentQueryChange={onEquipmentQueryChange}
        />

        {crimpingMode ? (
          <>
            <div className="dwf-progress-card dwf-progress-card--total">
              <span className="dwf-progress-card__label" title="Required wires still to prepare">To Prepare</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">
                  {Math.max(0, (crimpingSummary.required || 0) - (crimpingSummary.completed || 0) - (crimpingSummary.rework || 0))}
                </span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--finished">
              <span className="dwf-progress-card__label" title="Prepared wires">Prepared</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{crimpingSummary.completed}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--skipped">
              <span className="dwf-progress-card__label" title="Rework required wires">Rework</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{crimpingSummary.rework}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--corrected">
              <span className="dwf-progress-card__label" title="Ready for wiring">Ready for Wiring</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{crimpingSummary.readyForWiring}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--open-src">
              <span className="dwf-progress-card__label" title="Preparation progress among wires that require strip/crimp">Prep %</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{crimpingSummary.progressPct ?? 0}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="dwf-progress-card dwf-progress-card--total">
              <span className="dwf-progress-card__label" title="Total Wires">Total Wires</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{statusSummary.total}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--finished">
              <span className="dwf-progress-card__label" title="Finished Wires">Finished Wires</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{statusSummary.finished}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--skipped">
              <span className="dwf-progress-card__label" title="Skipped Wires">Skipped Wires</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{statusSummary.skipped}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--open-src">
              <span className="dwf-progress-card__label" title="Open Source">Open Src</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{statusSummary.openSource}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--open-dst">
              <span className="dwf-progress-card__label" title="Open Destination">Open Dst</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{statusSummary.openDestination}</span>
              </span>
            </div>
            <div className="dwf-progress-card dwf-progress-card--corrected">
              <span className="dwf-progress-card__label" title="Corrected">Corrected</span>
              <span className="dwf-progress-card__value">
                <span className="dwf-progress-card__count">{statusSummary.corrected}</span>
              </span>
            </div>
          </>
        )}
      </div>

      {filterStatusText && (
        <div className="dwf-filter-status-bar" role="status" aria-live="polite">
          {filterStatusText}
        </div>
      )}

      {activeCable ? (
        <div className="swm-card-wrap">
          <SingleWireMatrixCard
            cable={activeCable as Cable & { dest_ferrule?: string; _corrected_fields?: string[] }}
            status={activeSt}
            mapping={mapping}
            maxLen={maxLen}
            visualZoom={visualZoom}
            wireNumber={activeCable.sno ?? activeIndex + 1}
            corrections={activeCorrections}
            onShowHistory={onShowCorrectionHistory}
            canEdit={canEditCorrections}
            correctableFields={correctableFields}
            correctionBusy={correctionBusy}
            onSaveCorrection={onSaveCorrection}
            executionMode={executionMode}
          />
        </div>
      ) : (
        <div className="dwf-table-wrap dwf-table-wrap--primary dwf-table-wrap--single">
          <p className="text-[13px] text-muted p-4">No wire selected.</p>
        </div>
      )}
    </div>
  );
}
