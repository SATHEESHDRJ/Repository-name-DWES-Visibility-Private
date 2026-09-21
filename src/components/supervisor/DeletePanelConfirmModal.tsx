import { useEffect, useMemo, useState } from 'react';
import type { FramePanel } from '../assignment/ProjectPanelSelect';
import type { Project } from '../../types';
import { projectsApi } from '../../services/api';
import { useAppDialog } from '../AppDialogProvider';
import { compactPanelDisplayName, resolveProjectCardDetails } from '../../utils/projectDisplay';
import DeleteConfirmModal, {
  type DeleteGuardedPrecheck,
  type DeleteResultSummary,
  type DeleteScopeId,
} from '../ui/DeleteConfirmModal';

export type DeletePanelPrecheck = DeleteGuardedPrecheck & {
  panel_name: string;
  cable_count: number;
  assignment_count: number;
  confirm_phrase: string;
  backup_note: string;
  original_filename?: string;
};

interface DeletePanelConfirmModalProps {
  panel: FramePanel;
  project: Project;
  onClose: () => void;
  onDeleted: (panelId: string) => void;
}

function panelMeta(value: string | null | undefined, fallback?: string): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v) return v;
  const fb = fallback?.trim();
  if (fb) return fb;
  return 'Not set';
}

function panelVoltage(panel: FramePanel, projectCode: string): string {
  return panelMeta(
    panel.voltage_level as string | null | undefined,
    projectCode.match(/^([0-9.]+KV)(?:_|$)/i)?.[1],
  );
}

function panelTypeLabel(panel: FramePanel): string {
  const type = panelMeta(panel.panel_type as string | null | undefined);
  if (type !== 'Not set') return type;
  return panelMeta(panel.system_type as string | null | undefined);
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(raw)) return raw.map(String).join('. ');
  if (typeof raw === 'string' && raw.trim()) return raw;
  return fallback;
}

export default function DeletePanelConfirmModal({
  panel,
  project,
  onClose,
  onDeleted,
}: DeletePanelConfirmModalProps) {
  const dialog = useAppDialog();
  const [precheck, setPrecheck] = useState<DeletePanelPrecheck | null>(null);
  const [loadingPrecheck, setLoadingPrecheck] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DeleteResultSummary | null>(null);

  const projectDetails = useMemo(() => resolveProjectCardDetails(project), [project]);
  const panelLabel = compactPanelDisplayName(panel.panel_name) || panel.panel_name;

  useEffect(() => {
    let cancelled = false;
    setLoadingPrecheck(true);
    setError('');
    setResult(null);
    projectsApi.deleteFramePrecheck(project.code, panel.id)
      .then(data => {
        if (!cancelled) setPrecheck(data as DeletePanelPrecheck);
      })
      .catch(async (e: unknown) => {
        if (cancelled) return;
        await dialog.alert({
          title: 'Delete Unavailable',
          message: apiErrorMessage(e, 'Could not prepare panel deletion.'),
          tone: 'error',
        });
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoadingPrecheck(false);
      });
    return () => { cancelled = true; };
  }, [project.code, panel.id, dialog, onClose]);

  const handleConfirm = async (_scope: DeleteScopeId) => {
    if (!precheck?.confirm_phrase) return;
    setDeleting(true);
    setError('');
    try {
      // API still requires confirm_phrase — send precheck phrase after checkbox ack (hidden from UI).
      const apiResult = await projectsApi.deleteFrameGuarded(
        project.code,
        panel.id,
        precheck.confirm_phrase,
      );
      if (apiResult?.error) {
        setError(String(apiResult.error));
        return;
      }
      const backupPath =
        typeof apiResult?.backup?.dump === 'string'
          ? apiResult.backup.dump
          : typeof apiResult?.backup_path === 'string'
            ? apiResult.backup_path
            : undefined;
      setResult({
        title: 'Panel deleted',
        message: apiResult?.message || `${panelLabel} was permanently removed.`,
        removed: [
          `Panel ${panelLabel}`,
          `${precheck.cable_count} cable record${precheck.cable_count === 1 ? '' : 's'}`,
          `${precheck.assignment_count} assignment${precheck.assignment_count === 1 ? '' : 's'}`,
          ...(precheck.original_filename
            ? [`Wiring schedule file: ${precheck.original_filename}`]
            : ['Related frame / schedule files for this panel']),
        ],
        retained: [
          `Project ${projectDetails.substationName} (${project.code})`,
          'Other panels in this project',
        ],
        backupPath,
      });
      onDeleted(panel.id);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Could not delete panel.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DeleteConfirmModal
      title="Delete Panel"
      subtitle="Permanent removal — project and other panels are kept."
      resourceKind="panel"
      itemLabel={panelLabel}
      parentProject={{ code: project.code, name: projectDetails.substationName }}
      fields={[
        { label: 'Voltage level', value: panelVoltage(panel, project.code) },
        { label: 'Panel type', value: panelTypeLabel(panel) },
      ]}
      stats={precheck ? [
        { label: 'cables', count: precheck.cable_count, tone: precheck.cable_count > 0 ? 'danger' : 'neutral' },
        { label: 'assignments', count: precheck.assignment_count, tone: precheck.assignment_count > 0 ? 'warning' : 'neutral' },
      ] : []}
      sections={precheck ? [
        {
          id: 'db',
          title: 'Database records',
          icon: 'database',
          badge: 'removed',
          items: [
            'Panel / frame row for this panel',
            `Cable progress (${precheck.cable_count})`,
            `Technician assignments (${precheck.assignment_count})`,
            'QA/QC inspections, Mid Change / pause / S/D audit history for this panel',
            'Digital Twin / GA mappings, route mappings, and background jobs for this panel',
          ],
        },
        {
          id: 'files',
          title: 'Related files',
          icon: 'file',
          badge: 'removed',
          items: [
            precheck.original_filename
              ? `Wiring schedule: ${precheck.original_filename}`
              : 'Digital wiring frame / schedule files for this panel',
            'Approved drawings, 3D models, GA face images, and CAD derivatives for this panel',
          ],
        },
        {
          id: 'retained',
          title: 'Not affected',
          icon: 'shield',
          defaultExpanded: false,
          badge: 'kept',
          items: [
            `Parent project ${project.code}`,
            'Other panels, drawings, and assignments in the project',
            'Users, roles, authentication, and system settings',
          ],
        },
      ] : []}
      scopes={[
        {
          id: 'everything_related',
          label: 'Delete panel + related data',
          description: 'Removes this panel, its wiring/twin files, cables, QA records, and assignments. Sibling panels and the parent project stay.',
        },
      ]}
      defaultScope="everything_related"
      backup={precheck ? {
        status: 'ready',
        note: precheck.backup_note || 'A database backup is created before permanent deletion.',
      } : null}
      warningText="The panel wiring schedule, frame files, and related assignments for this panel will be removed. This cannot be undone within DWES except via backup restore."
      confirmCheckboxLabel={`I understand that panel “${panelLabel}” and its related wiring data will be permanently deleted.`}
      confirmButtonLabel="Delete Permanently"
      loading={loadingPrecheck || !precheck}
      deleting={deleting}
      error={error}
      result={result}
      onClose={onClose}
      onConfirm={handleConfirm}
      onDone={onClose}
    />
  );
}
