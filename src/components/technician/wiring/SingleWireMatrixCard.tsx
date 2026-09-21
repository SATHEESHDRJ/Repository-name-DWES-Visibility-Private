import { useMemo, useState, type CSSProperties } from 'react';
import {
  displayValue,
  getExactExcelCellValue,
  resolveCableVisualData,
  cableVisualLabel,
  wireColorHex,
  isCableSpecColumnHeader,
  resolveOpenEnds,
  type ExtendedCableStatus,
  type TechnicianExecutionMode,
  isWiringLockedByCrimping,
  crimpingEndDone,
  strippingEndDone,
  stripLabel,
  crimpLabel,
} from './wiring-utils';
import { CableVisualMiniCell } from './CableVisualPath';
import type { Cable } from '../../../types';

export interface WireCorrectionView {
  cable_index?: number;
  field: string;
  field_label: string;
  original_value: string;
  corrected_value: string;
  reason: string;
  technician_name: string;
  technician_username?: string;
  corrected_at: string;
  status?: string;
  project_name?: string;
  project_code?: string;
  panel_name?: string;
  wire_number?: string | number;
  corrected_excel_display_path?: string;
  corrected_excel_relative_path?: string;
  corrected_excel_filename?: string;
}

export interface CorrectableFieldOption {
  field: string;
  label: string;
}

interface Props {
  cable: Cable & { dest_ferrule?: string; _corrected_fields?: string[] };
  status: ExtendedCableStatus;
  mapping: Record<string, string>;
  maxLen: number;
  visualZoom: number;
  wireNumber: number | string;
  corrections?: WireCorrectionView[];
  onShowHistory?: () => void;
  /** Assigned technician may edit permitted fields when true. */
  canEdit?: boolean;
  correctableFields?: CorrectableFieldOption[];
  correctionBusy?: boolean;
  onSaveCorrection?: (payload: {
    field: string;
    corrected_value: string;
    reason: string;
  }) => Promise<void> | void;
  executionMode?: TechnicianExecutionMode;
}

type ActiveCable = Cable & { dest_ferrule?: string; _corrected_fields?: string[]; _raw?: Record<string, string> };

function normalizeHeaderKey(header: string): string {
  return String(header ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function rawByAliases(cable: ActiveCable, mapping: Record<string, string>, aliases: string[]): string {
  const raw = cable._raw || {};
  const aliasKeys = aliases.map(normalizeHeaderKey);
  for (const header of Object.keys(raw)) {
    if (aliasKeys.includes(normalizeHeaderKey(header))) {
      const exact = getExactExcelCellValue(cable, header, mapping);
      if (exact.trim()) return exact.trim();
    }
  }
  for (const alias of aliases) {
    const mapped = mapping[alias];
    if (mapped) {
      const exact = getExactExcelCellValue(cable, mapped, mapping);
      if (exact.trim()) return exact.trim();
    }
  }
  return '';
}

function firstNonEmpty(...values: Array<string | number | null | undefined>): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function destFerruleValue(cable: ActiveCable, mapping: Record<string, string>): string {
  return firstNonEmpty(
    cable.dest_ferrule,
    rawByAliases(cable, mapping, ['IEC_FERR_B', 'FERR_B', 'DEST_FERRULE', 'FERRULE_B']),
  );
}

function isFieldCorrected(cable: ActiveCable, fields: string[]): boolean {
  const set = new Set((cable._corrected_fields || []).map(f => f.toLowerCase()));
  return fields.some(f => set.has(f.toLowerCase()));
}

/** Current overlay value for a correctable system field. */
export function readCorrectableFieldValue(
  cable: ActiveCable,
  field: string,
  mapping: Record<string, string>,
): string {
  if (field === 'dest_ferrule') return destFerruleValue(cable, mapping);
  if (field === 'ferrule') {
    return firstNonEmpty(
      cable.ferrule,
      rawByAliases(cable, mapping, ['IEC_FERR_A', 'FERR_A', 'FERRULE']),
    );
  }
  const direct = (cable as unknown as Record<string, unknown>)[field];
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const mapped = mapping[field];
  if (mapped && cable._raw?.[mapped] != null) return String(cable._raw[mapped]).trim();
  return '';
}

/** Raw Excel headers already rendered in Source / Cable / Destination — omit from Additional. */
const CONSUMED_RAW_KEYS = new Set([
  'SNO', 'SLNO', 'SERIALNUMBER', 'SERIALNO',
  'PNLNOA', 'PNLNO', 'PANEL', 'PANELNAME', 'PANELNO', 'PANELNUMBER',
  'DEVTBLKA', 'DEVA', 'SRCDEV', 'SOURCEDEVICE', 'SOURCE', 'EQUIPMENT', 'DEVICE',
  'TERMA', 'SRCTERM', 'TERMINALA', 'SOURCETERMINAL', 'TERMINAL',
  'TERMSIDEA', 'TERMSIDEB', 'TERMSIDE', 'SIDEA', 'SIDEB',
  'IECFERRA', 'FERRA', 'FERRULE', 'WIRENO', 'CABLENO',
  'IECFERRB', 'FERRB', 'DESTFERRULE', 'FERRULEB',
  'DEVTBLKB', 'DEVB', 'DSTDEV', 'DESTDEVICE', 'DESTINATION', 'DEST',
  'TERMB', 'DSTTERM', 'TERMINALB', 'DESTTERMINAL',
  'REFRNCEA', 'REFRNCEB', 'REF', 'REFERENCE', 'REFRNCE', 'REFB', 'DESTREF',
  'SIGNMARK', 'SIGN', 'SIGNPOLARITY',
  'REMARKS', 'REMARK',
  'WIRECOLOR', 'WIRECOLOUR', 'CABLECOLOR', 'CABLECOLOUR', 'COLOR', 'COLOUR',
  'WIRESIZE', 'SIZE', 'CABLESIZE', 'CONDUCTORSIZE',
  // LENGTH(m) / LENGTH (m) → LENGTHM after normalizeHeaderKey
  'LENGTH', 'LENGTHM', 'LEN', 'CABLELENGTH', 'WIRELENGTH', 'CABLELENGTHM', 'WIRELENGTHM',
  'CABLEVISUAL', 'PATH', 'RACK',
  'PNLNOB', 'DESTPANEL', 'PANELB',
]);

/** System mapping keys whose Excel headers are already shown on the matrix card. */
const DISPLAYED_MAPPING_KEYS = [
  'sno', 'panel', 'source_device', 'source', 'source_terminal', 'ferrule', 'ref',
  'dest_device', 'destination', 'dest_terminal', 'dest_ferrule',
  'color', 'size', 'length', 'sign', 'remarks', 'rack',
  'PNLNO_A', 'PNLNO_B', 'DEV_TBLK_A', 'DEV_TBLK_B', 'TERM_A', 'TERM_B',
  'TERMSIDE_A', 'TERMSIDE_B', 'IEC_FERR_A', 'IEC_FERR_B', 'REFRNCE_A', 'REFRNCE_B',
] as const;

function isRedundantAdditionalHeader(header: string, mapping: Record<string, string>): boolean {
  const key = normalizeHeaderKey(header);
  if (!key) return true;
  if (CONSUMED_RAW_KEYS.has(key)) return true;
  if (isCableSpecColumnHeader(header)) return true;
  // Any length / colour / size / ferrule / sign / remarks variant already on the matrix
  if (key.includes('LENGTH') || key === 'LEN') return true;
  if (key.includes('COLOUR') || key.includes('COLOR')) return true;
  if (key.includes('WIRESIZE') || key === 'CABLESIZE' || key === 'CONDUCTORSIZE') return true;
  if (key.includes('FERR') || key.includes('FERRULE') || key.includes('WIRENO') || key.includes('CABLENO')) return true;
  if (key.includes('SIGN') || key.includes('REMARK')) return true;
  for (const sys of DISPLAYED_MAPPING_KEYS) {
    const mapped = mapping[sys];
    if (mapped && normalizeHeaderKey(mapped) === key) return true;
  }
  return false;
}

function normalizeDisplayValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
}

/** Normalize length-like values so "4.75m" and "4.75 m" match. */
function formatOptionalMeters(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const match = text.replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*m$/i)
    ?? text.replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)$/);
  return match ? `${match[1]}m` : text;
}
function EditableField({
  label,
  value,
  fieldKey,
  corrected,
  canEdit,
  fieldLabel,
  editingField,
  setEditingField,
  busy,
  onSave,
}: {
  label: string;
  value: string;
  fieldKey?: string;
  corrected?: boolean;
  canEdit?: boolean;
  fieldLabel?: string;
  editingField: string | null;
  setEditingField: (field: string | null) => void;
  busy?: boolean;
  onSave?: (payload: { field: string; corrected_value: string; reason: string }) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(value);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(fieldKey && editingField === fieldKey);
  const showEdit = Boolean(canEdit && fieldKey && onSave);

  const startEdit = () => {
    if (!fieldKey || busy) return;
    setDraft(value);
    setReason('');
    setError(null);
    setEditingField(fieldKey);
  };

  const cancel = () => {
    setEditingField(null);
    setError(null);
    setReason('');
    setDraft(value);
  };

  const submit = async () => {
    if (!fieldKey || !onSave) return;
    const next = draft.trim();
    const why = reason.trim();
    if (next === value.trim()) {
      setError('Corrected value must differ from the existing value.');
      return;
    }
    setError(null);
    await onSave({ field: fieldKey, corrected_value: next, reason: why });
    setEditingField(null);
  };

  return (
    <div className={`swm-field${corrected ? ' swm-field--corrected' : ''}${isEditing ? ' swm-field--editing' : ''}`}>
      <div className="swm-field__head">
        <span className="swm-field__label">{label}</span>
        {showEdit && !isEditing && (
          <button
            type="button"
            className="swm-field__edit"
            onClick={startEdit}
            disabled={busy || (editingField != null && editingField !== fieldKey)}
            aria-label={`Edit ${label}`}
          >
            Edit
          </button>
        )}
      </div>
      {!isEditing ? (
        <span className="swm-field__value">{displayValue(value)}</span>
      ) : (
        <div className="swm-inline-edit" role="group" aria-label={`Correct ${fieldLabel || label}`}>
          <label className="swm-inline-edit__row">
            <span>Original</span>
            <input className="form-input" value={value} readOnly />
          </label>
          <label className="swm-inline-edit__row">
            <span>New value</span>
            <input
              className="form-input"
              value={draft}
              disabled={busy}
              onChange={e => setDraft(e.target.value)}
              autoFocus
            />
          </label>
          <label className="swm-inline-edit__row">
            <span>Reason / comment</span>
            <textarea
              className="form-input"
              rows={2}
              value={reason}
              disabled={busy}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional"
            />
          </label>
          {error && <p className="swm-inline-edit__error" role="alert">{error}</p>}
          <div className="swm-inline-edit__actions">
            <button type="button" className="btn-secondary btn-sm" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => { void submit(); }}
              disabled={busy}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full-page Single Wire Digital Wiring Matrix with optional inline corrections.
 */
export default function SingleWireMatrixCard({
  cable,
  status,
  mapping,
  maxLen,
  visualZoom,
  wireNumber,
  corrections = [],
  onShowHistory,
  canEdit = false,
  correctableFields = [],
  correctionBusy = false,
  onSaveCorrection,
  executionMode = 'wiring',
}: Props) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [specsEditOpen, setSpecsEditOpen] = useState(false);
  const active = cable as ActiveCable;
  const visual = resolveCableVisualData(active, mapping);
  const { hex } = wireColorHex(visual.color);
  const skipped = /\[SKIPPED /.test(status.note || '') && !(status.src && status.dst);
  const open = resolveOpenEnds(status);
  const srcOpenVisual = open.source;
  const dstOpenVisual = open.destination;
  const openEnd = status.openEnd ?? (srcOpenVisual && dstOpenVisual ? 'both' : srcOpenVisual ? 'source' : dstOpenVisual ? 'destination' : null);
  const corrected = Boolean(status.corrected) || corrections.length > 0;
  const latest = corrections.length ? corrections[corrections.length - 1] : null;
  const crimp = status.crimping;
  const crimpRequired = Boolean(crimp?.required);
  const srcCrimped = crimpingEndDone(status, 'source');
  const dstCrimped = crimpingEndDone(status, 'destination');
  const srcStripped = strippingEndDone(status, 'source');
  const dstStripped = strippingEndDone(status, 'destination');
  const wiringLocked = isWiringLockedByCrimping(status);

  const editable = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of correctableFields) map.set(opt.field, opt.label);
    return map;
  }, [correctableFields]);

  const canEditField = (key: string) => canEdit && editable.has(key) && Boolean(onSaveCorrection);

  let statusLabel = 'Pending';
  let statusTone = 'pending';
  if (executionMode === 'crimping' && crimpRequired) {
    if (crimp?.overall === 'COMPLETED') {
      statusLabel = 'PREPARATION COMPLETE';
      statusTone = 'finished';
    } else if (crimp?.overall === 'PARTIAL') {
      statusLabel = 'PREPARATION PARTIAL';
      statusTone = 'in-progress';
    } else if (crimp?.overall === 'REWORK_REQUIRED') {
      statusLabel = 'PREPARATION REWORK';
      statusTone = 'skipped';
    } else {
      statusLabel = 'PREPARATION PENDING';
      statusTone = 'pending';
    }
  } else if (skipped) {
    statusLabel = 'Skipped';
    statusTone = 'skipped';
  } else if (status.src && status.dst) {
    if (srcOpenVisual && dstOpenVisual) {
      statusLabel = 'FINISHED — BOTH ENDS OPEN';
      statusTone = 'finished-both-ends-open';
    } else if (srcOpenVisual) {
      statusLabel = 'FINISHED — SOURCE END OPEN';
      statusTone = 'finished-source-end-open';
    } else if (dstOpenVisual) {
      statusLabel = 'FINISHED — DESTINATION END OPEN';
      statusTone = 'finished-destination-end-open';
    } else {
      statusLabel = 'Finished';
      statusTone = 'finished';
    }
  } else if (srcOpenVisual && dstOpenVisual) {
    statusLabel = 'BOTH ENDS OPEN';
    statusTone = 'open-both-ends';
  } else if (srcOpenVisual) {
    statusLabel = 'SOURCE END OPEN';
    statusTone = 'open-source';
  } else if (dstOpenVisual) {
    statusLabel = 'DESTINATION END OPEN';
    statusTone = 'open-destination';
  } else if (status.src || status.dst) {
    statusLabel = 'In Progress';
    statusTone = 'in-progress';
  }

  const sno = firstNonEmpty(String(active.sno ?? ''), String(wireNumber));
  const panelA = firstNonEmpty(
    active.panel,
    rawByAliases(active, mapping, ['PNLNO_A', 'PNLNO', 'PANEL', 'PANEL_NAME', 'PANEL NO']),
  );
  const panelB = firstNonEmpty(
    rawByAliases(active, mapping, ['PNLNO_B', 'DEST_PANEL', 'PANEL_B']),
  );
  const sourceDevice = firstNonEmpty(
    active.source_device,
    active.source,
    rawByAliases(active, mapping, ['DEV_TBLK_A', 'DEV_A', 'SRC_DEV', 'SOURCE_DEVICE']),
  );
  const sourceTerminal = firstNonEmpty(
    active.source_terminal,
    rawByAliases(active, mapping, ['TERM_A', 'SRC_TERM', 'TERMINAL_A', 'SOURCE_TERMINAL']),
  );
  const sourceSide = rawByAliases(active, mapping, ['TERMSIDE_A', 'TERM_SIDE_A', 'SIDE_A']);
  const sourceFerrule = firstNonEmpty(
    active.ferrule,
    rawByAliases(active, mapping, ['IEC_FERR_A', 'FERR_A', 'FERRULE', 'WIRE NO', 'CABLE NO']),
  );
  const sourceRef = firstNonEmpty(
    active.ref,
    rawByAliases(active, mapping, ['REFRNCE_A', 'REF', 'REFERENCE', 'REFRNCE']),
  );

  const destDevice = firstNonEmpty(
    active.dest_device,
    active.destination,
    rawByAliases(active, mapping, ['DEV_TBLK_B', 'DEV_B', 'DST_DEV', 'DEST_DEVICE']),
  );
  const destTerminal = firstNonEmpty(
    active.dest_terminal,
    rawByAliases(active, mapping, ['TERM_B', 'DST_TERM', 'TERMINAL_B', 'DEST_TERMINAL']),
  );
  const destSide = rawByAliases(active, mapping, ['TERMSIDE_B', 'TERM_SIDE_B', 'SIDE_B']);
  const destFerrule = destFerruleValue(active, mapping);
  const destRef = rawByAliases(active, mapping, ['REFRNCE_B', 'REF_B', 'DEST_REF']);

  const signMark = firstNonEmpty(
    active.sign,
    rawByAliases(active, mapping, ['SIGN MARK', 'SIGN', 'SIGN/POLARITY']),
  );
  const remarks = firstNonEmpty(
    active.remarks,
    rawByAliases(active, mapping, ['REMARKS', 'REMARK']),
  );

  const displayedValues = new Set(
    [
      sno, panelA, panelB, sourceDevice, sourceTerminal, sourceSide, sourceFerrule, sourceRef,
      destDevice, destTerminal, destSide, destFerrule, destRef,
      signMark, remarks, visual.color, visual.size, visual.length,
      formatOptionalMeters(visual.length),
    ]
      .map(v => normalizeDisplayValue(String(v ?? '')))
      .filter(Boolean),
  );

  const additionalEntries: Array<{ label: string; value: string }> = [];
  const raw = active._raw || {};
  for (const [header, value] of Object.entries(raw)) {
    if (isRedundantAdditionalHeader(header, mapping)) continue;
    const text = String(value ?? '').trim();
    if (!text) continue;
    const key = normalizeHeaderKey(header);
    if (additionalEntries.some(e => normalizeHeaderKey(e.label) === key)) continue;
    // Skip value already shown on Source / Cable / Destination / visual path
    if (displayedValues.has(normalizeDisplayValue(text))) continue;
    if (displayedValues.has(normalizeDisplayValue(formatOptionalMeters(text)))) continue;
    additionalEntries.push({ label: header, value: text });
  }
  if (
    active.rack?.trim()
    && !additionalEntries.some(e => /rack/i.test(e.label))
    && !displayedValues.has(normalizeDisplayValue(active.rack))
  ) {
    additionalEntries.push({ label: 'Rack', value: active.rack.trim() });
  }

  const fieldProps = {
    editingField,
    setEditingField,
    busy: correctionBusy,
    onSave: onSaveCorrection,
  };

  const canEditSpecs =
    canEditField('color') || canEditField('size') || canEditField('length');
  const specsCorrected =
    isFieldCorrected(active, ['color'])
    || isFieldCorrected(active, ['size'])
    || isFieldCorrected(active, ['length']);
  const summaryLabel = cableVisualLabel(visual);
  const visualZoomFloor = Math.max(visualZoom, 1.1);

  return (
    <section
      className={`swm-card swm-card--fullscreen${corrected ? ' swm-card--corrected' : ''}${srcOpenVisual ? ' swm-card--open-source' : ''}${dstOpenVisual ? ' swm-card--open-destination' : ''}`}
      aria-label={`Wire ${sno} digital wiring matrix`}
      data-cable-index={sno}
    >
      <header className="swm-card__header">
        <div className="swm-card__wire">
          <span className="swm-card__wire-label">S.NO</span>
          <span className="swm-card__wire-no">{sno}</span>
          {panelA && (
            <span className="swm-card__panel" title="Panel">
              {panelA.startsWith('=') ? panelA.slice(1) : panelA}
            </span>
          )}
        </div>
        <div className="swm-card__badges">
          {corrected && (
            <button
              type="button"
              className="swm-corrected-badge"
              onClick={onShowHistory}
              title="View correction history"
            >
              Corrected
            </button>
          )}
        </div>
      </header>

      <div className="swm-card__matrix" role="group" aria-label="Source, cable, and destination">
        <div
          className={`swm-side swm-side--source${srcOpenVisual ? ' swm-side--open swm-side--open-src' : ''}`}
          aria-label="Source details"
        >
          <div className="swm-side__title">Source Details</div>
          {srcOpenVisual && <div className="swm-side__open-tag swm-side__open-tag--src">OPEN SOURCE</div>}
          <EditableField
            label="Panel"
            value={panelA}
            fieldKey={canEditField('panel') ? 'panel' : undefined}
            fieldLabel={editable.get('panel')}
            corrected={isFieldCorrected(active, ['panel'])}
            canEdit={canEditField('panel')}
            {...fieldProps}
          />
          <EditableField
            label="Equipment / Device"
            value={sourceDevice}
            fieldKey={canEditField('source_device') ? 'source_device' : (canEditField('source') ? 'source' : undefined)}
            fieldLabel={editable.get('source_device') || editable.get('source')}
            corrected={isFieldCorrected(active, ['source_device', 'source'])}
            canEdit={canEditField('source_device') || canEditField('source')}
            {...fieldProps}
          />
          <EditableField
            label="Terminal"
            value={sourceTerminal}
            fieldKey={canEditField('source_terminal') ? 'source_terminal' : undefined}
            fieldLabel={editable.get('source_terminal')}
            corrected={isFieldCorrected(active, ['source_terminal', 'source'])}
            canEdit={canEditField('source_terminal')}
            {...fieldProps}
          />
          <EditableField label="Terminal Side" value={sourceSide} {...fieldProps} />
          <EditableField
            label="Ferrule"
            value={sourceFerrule}
            fieldKey={canEditField('ferrule') ? 'ferrule' : undefined}
            fieldLabel={editable.get('ferrule')}
            corrected={isFieldCorrected(active, ['ferrule'])}
            canEdit={canEditField('ferrule')}
            {...fieldProps}
          />
          <EditableField
            label="Reference"
            value={sourceRef}
            fieldKey={canEditField('ref') ? 'ref' : undefined}
            fieldLabel={editable.get('ref')}
            corrected={isFieldCorrected(active, ['ref'])}
            canEdit={canEditField('ref')}
            {...fieldProps}
          />
          {executionMode === 'crimping' && crimpRequired ? (
            <div className="swm-prep-block" aria-label="Source preparation">
              <div className="swm-prep-block__row">
                <span>STRIPPING</span>
                <strong className={srcStripped ? 'is-done' : ''}>{stripLabel(status, 'source')}</strong>
              </div>
              <div className="swm-prep-block__row">
                <span>CRIMPING</span>
                <strong className={srcCrimped ? 'is-done' : ''}>{crimpLabel(status, 'source')}</strong>
              </div>
            </div>
          ) : null}
        </div>

        <div className="swm-path" aria-label="Cable and wire details">
          <div className="swm-path__title">Cable / Wire Details</div>
          <div className="swm-path__wire-meta">
            <span className="swm-path__wire-label">Wire</span>
            <span className="swm-path__wire-no">{sno}</span>
          </div>
          <div className="swm-path__visual" style={{ '--dwf-cv-zoom': visualZoomFloor } as CSSProperties}>
            <CableVisualMiniCell
              cable={active}
              mapping={mapping}
              maxLen={maxLen}
              emphasis
              zoom={visualZoomFloor}
              openEnd={openEnd}
              statusNote={status.note || ''}
              hideLabel
            />
          </div>
          <div className={`swm-path__summary-row${specsCorrected ? ' swm-path__summary-row--corrected' : ''}`}>
            <span className="swm-path__summary" title={summaryLabel}>
              <span className="swm-swatch" style={{ background: hex }} aria-hidden />
              <span className="swm-path__summary-text">{summaryLabel}</span>
            </span>
            {canEditSpecs && (
              <button
                type="button"
                className="swm-field__edit swm-path__summary-edit"
                onClick={() => {
                  setSpecsEditOpen(open => {
                    if (open) setEditingField(null);
                    return !open;
                  });
                }}
                disabled={correctionBusy}
                aria-expanded={specsEditOpen}
                aria-controls="swm-wire-specs-panel"
              >
                {specsEditOpen ? 'Close' : 'Edit'}
              </button>
            )}
          </div>
          {specsEditOpen && canEditSpecs && (
            <div
              id="swm-wire-specs-panel"
              className="swm-path__specs-panel"
              role="group"
              aria-label="Correct wire colour, size, or length"
            >
              {canEditField('color') && (
                <EditableField
                  label="Wire colour"
                  value={visual.color}
                  fieldKey="color"
                  fieldLabel={editable.get('color')}
                  corrected={isFieldCorrected(active, ['color'])}
                  canEdit
                  {...fieldProps}
                />
              )}
              {canEditField('size') && (
                <EditableField
                  label="Wire size"
                  value={visual.size}
                  fieldKey="size"
                  fieldLabel={editable.get('size')}
                  corrected={isFieldCorrected(active, ['size'])}
                  canEdit
                  {...fieldProps}
                />
              )}
              {canEditField('length') && (
                <EditableField
                  label="Length"
                  value={visual.length}
                  fieldKey="length"
                  fieldLabel={editable.get('length')}
                  corrected={isFieldCorrected(active, ['length'])}
                  canEdit
                  {...fieldProps}
                />
              )}
            </div>
          )}
          <EditableField
            label="Sign Mark"
            value={signMark}
            fieldKey={canEditField('sign') ? 'sign' : undefined}
            fieldLabel={editable.get('sign')}
            corrected={isFieldCorrected(active, ['sign'])}
            canEdit={canEditField('sign')}
            {...fieldProps}
          />
          <EditableField
            label="Remarks"
            value={remarks}
            fieldKey={canEditField('remarks') ? 'remarks' : undefined}
            fieldLabel={editable.get('remarks')}
            corrected={isFieldCorrected(active, ['remarks'])}
            canEdit={canEditField('remarks')}
            {...fieldProps}
          />
          <div className="swm-path__live-status" role="status" aria-live="polite" aria-label="Live wire status">
            <span className="swm-path__live-status-label">Live Status</span>
            <span
              className={`swm-path__live-status-value swm-status--${statusTone}`}
            >
              {statusLabel}
            </span>
          </div>
          {executionMode === 'wiring' && crimpRequired ? (
            <div
              className={`swm-crimp-ready ${wiringLocked ? 'swm-crimp-ready--pending' : 'swm-crimp-ready--ok'}`}
              role="status"
            >
              {String(crimp?.overall || '') === 'REWORK_REQUIRED'
                ? 'REWORK REQUIRED'
                : wiringLocked
                  ? 'PENDING PREPARATION'
                  : 'READY FOR WIRING'}
            </div>
          ) : null}
          {executionMode === 'crimping' && crimpRequired ? (
            <div className="swm-crimp-ends" aria-label="Preparation status">
              <div className="swm-crimp-ends__col">
                <span>SRC</span>
                <span className={srcStripped ? 'is-done' : ''}>STRIP {srcStripped ? '✓' : '○'}</span>
                <span className={srcCrimped ? 'is-done' : ''}>CRIMP {srcCrimped ? '✓' : '○'}</span>
              </div>
              <div className="swm-crimp-ends__col">
                <span>DST</span>
                <span className={dstStripped ? 'is-done' : ''}>STRIP {dstStripped ? '✓' : '○'}</span>
                <span className={dstCrimped ? 'is-done' : ''}>CRIMP {dstCrimped ? '✓' : '○'}</span>
              </div>
              <div className="swm-crimp-ends__overall">
                OVERALL {String(crimp?.overall || 'NOT_STARTED')}
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={`swm-side swm-side--dest${dstOpenVisual ? ' swm-side--open swm-side--open-dst' : ''}`}
          aria-label="Destination details"
        >
          <div className="swm-side__title">Destination Details</div>
          {dstOpenVisual && <div className="swm-side__open-tag swm-side__open-tag--dst">OPEN DESTINATION</div>}
          <EditableField label="Panel" value={panelB} {...fieldProps} />
          <EditableField
            label="Equipment / Device"
            value={destDevice}
            fieldKey={canEditField('dest_device') ? 'dest_device' : (canEditField('destination') ? 'destination' : undefined)}
            fieldLabel={editable.get('dest_device') || editable.get('destination')}
            corrected={isFieldCorrected(active, ['dest_device', 'destination'])}
            canEdit={canEditField('dest_device') || canEditField('destination')}
            {...fieldProps}
          />
          <EditableField
            label="Terminal"
            value={destTerminal}
            fieldKey={canEditField('dest_terminal') ? 'dest_terminal' : undefined}
            fieldLabel={editable.get('dest_terminal')}
            corrected={isFieldCorrected(active, ['dest_terminal', 'destination'])}
            canEdit={canEditField('dest_terminal')}
            {...fieldProps}
          />
          <EditableField label="Terminal Side" value={destSide} {...fieldProps} />
          <EditableField
            label="Ferrule"
            value={destFerrule}
            fieldKey={canEditField('dest_ferrule') ? 'dest_ferrule' : undefined}
            fieldLabel={editable.get('dest_ferrule')}
            corrected={isFieldCorrected(active, ['dest_ferrule'])}
            canEdit={canEditField('dest_ferrule')}
            {...fieldProps}
          />
          <EditableField label="Reference" value={destRef} {...fieldProps} />
          {executionMode === 'crimping' && crimpRequired ? (
            <div className="swm-prep-block" aria-label="Destination preparation">
              <div className="swm-prep-block__row">
                <span>STRIPPING</span>
                <strong className={dstStripped ? 'is-done' : ''}>{stripLabel(status, 'destination')}</strong>
              </div>
              <div className="swm-prep-block__row">
                <span>CRIMPING</span>
                <strong className={dstCrimped ? 'is-done' : ''}>{crimpLabel(status, 'destination')}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {additionalEntries.length > 0 && (
        <div className="swm-additional" aria-label="Additional wire details">
          <div className="swm-additional__title">Additional Wire Details</div>
          <div className="swm-additional__grid">
            {additionalEntries.map(entry => (
              <EditableField key={entry.label} label={entry.label} value={entry.value} {...fieldProps} />
            ))}
          </div>
        </div>
      )}

      {latest && (
        <footer className="swm-card__footer">
          <div className="swm-correction-note">
            <span className="swm-field__label">Last correction</span>
            <span>
              {latest.field_label}: {displayValue(latest.original_value)} → {displayValue(latest.corrected_value)}
              {latest.reason ? ` — ${latest.reason}` : ''}
              {latest.technician_name ? ` · ${latest.technician_name}` : ''}
              {latest.corrected_at ? ` · ${latest.corrected_at}` : ''}
            </span>
          </div>
        </footer>
      )}
    </section>
  );
}
