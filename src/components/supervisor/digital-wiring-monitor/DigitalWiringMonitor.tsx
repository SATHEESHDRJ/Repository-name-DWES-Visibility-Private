import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectsApi } from '../../../services/api';
import type { Cable } from '../../../types';
import { onFramesChanged } from '../../../utils/projectFramesEvents';
import {
  CABLE_VISUAL_HEADER,
  deriveExcelHeaders,
  ensureCableList,
  getCellValue,
  isCableVisualHeader,
  parseLengthMeters,
  resolveCableVisualData,
  splitHeadersAroundCableVisual,
} from '../../technician/wiring/wiring-utils';
import { CableVisualMiniCell } from '../../technician/wiring/CableVisualPath';
import { DwesLoadingCenter } from '../../ui/DwesLoadingIndicator';

interface Props {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelLabel: string;
  panelType?: string;
  voltageLevel?: string;
}

interface VerifyPayload {
  cables: Cable[];
  mapping: Record<string, string>;
  excel_headers: string[];
  cable_count: number;
  original_filename?: string;
  panel_name?: string;
}

const NOT_SET = '—';

function metaValue(value?: string | null): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || NOT_SET;
}

/**
 * Read-only Digital Wiring Schedule for Production Supervisors.
 *
 * Shows the complete converted schedule as one full-width table so the whole
 * uploaded plan can be reviewed at a glance. Cable Visual sits between
 * IEC_FERR_A and IEC_FERR_B when present (ENOWA Excel order).
 */
export default function DigitalWiringMonitor({
  projectCode,
  projectName,
  frameId,
  panelLabel,
  panelType,
  voltageLevel,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verify, setVerify] = useState<VerifyPayload | null>(null);

  const mapping = useMemo(() => verify?.mapping ?? {}, [verify?.mapping]);
  const excelHeadersRaw = useMemo(
    () => deriveExcelHeaders(mapping, verify?.excel_headers, verify?.cables?.[0]?._raw),
    [mapping, verify?.excel_headers, verify?.cables],
  );
  const headerSplit = useMemo(
    () => splitHeadersAroundCableVisual(excelHeadersRaw, mapping),
    [excelHeadersRaw, mapping],
  );
  const excelHeaders = headerSplit.headers;
  const cables = useMemo(
    () => ensureCableList(verify?.cables, verify?.cable_count ?? 0, mapping),
    [verify?.cables, verify?.cable_count, mapping],
  );
  const maxLen = useMemo(() => {
    const lens = cables
      .map(c => parseLengthMeters(resolveCableVisualData(c, mapping).length))
      .filter((v): v is number => v != null && v > 0);
    return lens.length ? Math.max(...lens) : 0;
  }, [cables, mapping]);

  const loadSchedule = useCallback((showLoading: boolean, isCancelled: () => boolean = () => false) => {
    if (showLoading) setLoading(true);
    setError('');
    return projectsApi.verifyData(projectCode, frameId)
      .then((d: VerifyPayload) => {
        if (isCancelled()) return;
        setVerify({
          cables: Array.isArray(d?.cables) ? d.cables : [],
          mapping: d?.mapping || {},
          excel_headers: Array.isArray(d?.excel_headers) ? d.excel_headers : [],
          cable_count: d?.cable_count ?? (d?.cables?.length ?? 0),
          original_filename: d?.original_filename,
          panel_name: d?.panel_name,
        });
      })
      .catch((err: unknown) => {
        if (isCancelled()) return;
        const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        const httpStatus = (err as { response?: { status?: number } })?.response?.status;
        setError(apiMsg || (httpStatus === 404
          ? 'Wiring schedule not found for this panel.'
          : 'Failed to load wiring schedule.'));
      })
      .finally(() => {
        if (showLoading && !isCancelled()) setLoading(false);
      });
  }, [frameId, projectCode]);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    void loadSchedule(true, isCancelled).catch(() => undefined);
    const off = onFramesChanged(detail => {
      if (cancelled || detail.action === 'deleted' || detail.projectCode !== projectCode) return;
      if (detail.frameId && detail.frameId !== frameId) return;
      void loadSchedule(false, isCancelled).catch(() => undefined);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [frameId, loadSchedule, projectCode]);

  if (loading) {
    return (
      <div className="dwv-shell">
        <DwesLoadingCenter label="Loading wiring schedule…" className="dwv-message" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dwv-shell">
        <div className="dwv-message dwv-message--error" role="alert">{error}</div>
      </div>
    );
  }

  const meta: Array<{ label: string; value: string; wide?: boolean }> = [
    { label: 'Project name', value: metaValue(projectName), wide: true },
    { label: 'Project number', value: metaValue(projectCode) },
    { label: 'Panel name', value: metaValue(verify?.panel_name || panelLabel) },
    { label: 'Panel type', value: metaValue(panelType) },
    { label: 'Voltage level', value: metaValue(voltageLevel) },
    { label: 'Source file', value: metaValue(verify?.original_filename), wide: true },
    { label: 'Total wires', value: String(cables.length) },
  ];

  return (
    <div className="dwv-shell" aria-label="Digital Wiring Schedule">
      <header className="dwv-meta">
        {meta.map(item => (
          <div key={item.label} className={`dwv-meta-item${item.wide ? ' dwv-meta-item--wide' : ''}`}>
            <span className="dwv-meta-label">{item.label}</span>
            <span className="dwv-meta-value" title={item.value}>{item.value}</span>
          </div>
        ))}
      </header>

      {cables.length === 0 ? (
        <div className="dwv-message">This panel has no wires in its converted schedule.</div>
      ) : (
        <div className="dwv-table-scroll" tabIndex={0} role="region" aria-label="Wiring schedule table">
          <table className="dwv-table">
            <thead>
              <tr>
                <th scope="col" className="dwv-col-index">#</th>
                {excelHeaders.map(header => (
                  <th
                    key={header}
                    scope="col"
                    title={header}
                    className={isCableVisualHeader(header) ? 'dwv-col-visual' : undefined}
                  >
                    {isCableVisualHeader(header) ? CABLE_VISUAL_HEADER : header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cables.map((cable, index) => (
                <tr key={index}>
                  <td className="dwv-col-index">{index + 1}</td>
                  {excelHeaders.map(header => {
                    if (isCableVisualHeader(header)) {
                      return (
                        <td key={header} className="dwv-col-visual" data-label={CABLE_VISUAL_HEADER}>
                          <CableVisualMiniCell cable={cable} mapping={mapping} maxLen={maxLen} />
                        </td>
                      );
                    }
                    const value = getCellValue(cable, header, mapping);
                    return (
                      <td key={header} title={value || undefined}>
                        {value || NOT_SET}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
