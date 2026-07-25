import { useEffect, useMemo, useState } from 'react';
import { projectsApi } from '../../../services/api';
import type { Cable } from '../../../types';
import {
  deriveExcelHeaders,
  ensureCableList,
  getCellValue,
} from '../../technician/wiring/wiring-utils';

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
 * Read-only Digital Wiring View for Production Supervisors.
 *
 * Shows the complete converted schedule as one full-width table so the whole
 * uploaded plan can be reviewed at a glance. Deliberately has no search, filters,
 * sorting, row selection, per-wire inspector, export, or print — it is a plain
 * review surface and never mutates the schedule.
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

  const mapping = verify?.mapping ?? {};
  const excelHeaders = useMemo(
    () => deriveExcelHeaders(mapping, verify?.excel_headers, verify?.cables?.[0]?._raw),
    [mapping, verify?.excel_headers, verify?.cables],
  );
  const cables = useMemo(
    () => ensureCableList(verify?.cables, verify?.cable_count ?? 0, mapping),
    [verify?.cables, verify?.cable_count, mapping],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    setError('');
    projectsApi.verifyData(projectCode, frameId)
      .then((d: VerifyPayload) => {
        if (signal.cancelled) return;
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
        if (signal.cancelled) return;
        const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        const httpStatus = (err as { response?: { status?: number } })?.response?.status;
        setError(apiMsg || (httpStatus === 404
          ? 'Wiring schedule not found for this panel.'
          : 'Failed to load wiring schedule.'));
      })
      .finally(() => {
        if (!signal.cancelled) setLoading(false);
      });
    return () => { signal.cancelled = true; };
  }, [projectCode, frameId]);

  if (loading) {
    return (
      <div className="dwv-shell">
        <div className="dwv-message">Loading wiring schedule…</div>
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
    <div className="dwv-shell" aria-label="Digital Wiring View">
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
        // Single scroll container: vertical + horizontal, with the header row pinned.
        <div className="dwv-table-scroll" tabIndex={0} role="region" aria-label="Wiring schedule table">
          <table className="dwv-table">
            <thead>
              <tr>
                <th scope="col" className="dwv-col-index">#</th>
                {excelHeaders.map(header => (
                  <th key={header} scope="col" title={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cables.map((cable, index) => (
                <tr key={index}>
                  <td className="dwv-col-index">{index + 1}</td>
                  {excelHeaders.map(header => {
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
