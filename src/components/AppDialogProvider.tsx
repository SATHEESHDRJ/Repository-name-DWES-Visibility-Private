/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LogOut, Save, Trash2, TriangleAlert, Pencil } from './ui/icons';
import Modal from './Modal';
import ActionStatusPanel, {
  type ActionEntityRef,
  type ActionStatus,
} from './ui/ActionStatusPanel';

type DialogTone = 'info' | 'success' | 'warning' | 'error' | 'delete' | 'logout' | 'save' | 'unsaved';
type DialogKind = 'alert' | 'confirm' | 'prompt';

export type DialogComparisonRow = { label: string; value: string };

export type DialogFormField =
  | {
      name: string;
      type: 'select';
      label: string;
      required?: boolean;
      placeholder?: string;
      options: Array<{ value: string; label: string }>;
    }
  | {
      name: string;
      type: 'textarea';
      label: string;
      required?: boolean;
      placeholder?: string;
      rows?: number;
    };

export interface BaseDialogOptions {
  title?: string;
  message: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
  /** Affected project / panel / file / user shown in a compact card. */
  entity?: ActionEntityRef | ActionEntityRef[];
  /** One-line description of what the action will do. */
  actionSummary?: string;
  /** Clear consequence of confirming. */
  consequence?: string;
  /** Current vs proposed values (assignment, reassignment, admin changes). */
  comparison?: {
    current: DialogComparisonRow[];
    proposed: DialogComparisonRow[];
  };
  /** Explicit list of what will be permanently removed (destructive confirms). */
  removalItems?: string[];
  /** Optional status badge override (default derived from tone/kind). */
  status?: ActionStatus;
  statusDetail?: string;
  progress?: number | null;
  counts?: Array<{ label: string; value: string | number }>;
  /**
   * Optional form fields rendered inside the shared confirm shell
   * (reassign / mid-change / admin changes that need extra input).
   */
  formFields?: DialogFormField[];
}

interface PromptDialogOptions extends BaseDialogOptions {
  placeholder?: string;
  defaultValue?: string;
}

export type ConfirmAsyncAction = (formValues?: Record<string, string>) => Promise<void>;

interface DialogRequest {
  kind: DialogKind;
  title: string;
  message: string;
  tone: DialogTone;
  confirmText: string;
  cancelText: string;
  placeholder?: string;
  defaultValue?: string;
  entity?: ActionEntityRef | ActionEntityRef[];
  actionSummary?: string;
  consequence?: string;
  comparison?: BaseDialogOptions['comparison'];
  removalItems?: string[];
  status: ActionStatus;
  statusDetail?: string;
  progress?: number | null;
  counts?: Array<{ label: string; value: string | number }>;
  formFields?: DialogFormField[];
  /** When set, Confirm runs this and only resolves true after success. */
  asyncAction?: ConfirmAsyncAction;
}

interface AppDialogContextValue {
  alert: (options: BaseDialogOptions) => Promise<void>;
  confirm: (options: BaseDialogOptions) => Promise<boolean>;
  /**
   * Shared confirmation for assignment / admin / destructive flows that must
   * succeed on the backend before the dialog closes. Shows loading on Confirm,
   * blocks double-submit, and surfaces the exact backend error on failure.
   */
  confirmAsync: (options: BaseDialogOptions, action: ConfirmAsyncAction) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function toneTitle(tone: DialogTone) {
  if (tone === 'delete') return 'Delete Permanently';
  if (tone === 'logout') return 'Confirm Logout';
  if (tone === 'save') return 'Save Changes';
  if (tone === 'unsaved') return 'Unsaved Changes';
  if (tone === 'success') return 'Completed';
  if (tone === 'warning') return 'Confirm Action';
  if (tone === 'error') return 'Action Failed';
  return 'Information';
}

function toneConfirm(tone: DialogTone) {
  if (tone === 'delete') return 'Delete Permanently';
  if (tone === 'logout') return 'Logout';
  if (tone === 'save') return 'Save';
  if (tone === 'unsaved') return 'Discard';
  if (tone === 'success') return 'Continue';
  return 'Confirm';
}

function toneChip(tone: DialogTone): 'primary' | 'danger' | 'warning' | 'success' {
  if (tone === 'delete' || tone === 'error' || tone === 'logout') return 'danger';
  if (tone === 'warning' || tone === 'unsaved') return 'warning';
  if (tone === 'success') return 'success';
  return 'primary';
}

function toneStatus(tone: DialogTone, kind: DialogKind): ActionStatus {
  if (tone === 'delete') return 'confirm';
  if (tone === 'error') return 'failed';
  if (tone === 'success') return 'completed';
  if (kind === 'confirm') return 'confirm';
  return 'idle';
}

function ToneIcon({ tone }: { tone: DialogTone }) {
  if (tone === 'delete') return <Trash2 size={20} />;
  if (tone === 'logout') return <LogOut size={20} />;
  if (tone === 'save') return <Save size={20} />;
  if (tone === 'unsaved') return <TriangleAlert size={20} />;
  if (tone === 'success') return <CheckCircle2 size={20} />;
  if (tone === 'warning') return <AlertTriangle size={20} />;
  if (tone === 'error') return <AlertCircle size={20} />;
  return <Info size={20} />;
}

/** Extract exact backend message when available. */
export function dialogErrorMessage(error: unknown, fallback = 'The action failed. Please try again.'): string {
  const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function formFieldsReady(fields: DialogFormField[] | undefined, values: Record<string, string>): boolean {
  if (!fields?.length) return true;
  return fields.every(field => {
    if (!field.required) return true;
    return Boolean((values[field.name] || '').trim());
  });
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolver, setResolver] = useState<((value: boolean | string | null) => void) | null>(null);
  const submittingRef = useRef(false);

  const closeDialog = useCallback((value: boolean | string | null) => {
    if (submittingRef.current) return;
    if (resolver) resolver(value);
    setResolver(null);
    setActive(null);
    setPromptValue('');
    setFormValues({});
    setActionError(null);
    setSubmitting(false);
  }, [resolver]);

  const openDialog = useCallback((
    kind: DialogKind,
    options: BaseDialogOptions | PromptDialogOptions,
    asyncAction?: ConfirmAsyncAction,
  ) => {
    return new Promise<boolean | string | null>(resolve => {
      const tone = options.tone || 'info';
      const request: DialogRequest = {
        kind,
        title: options.title || toneTitle(tone),
        message: options.message,
        tone,
        confirmText: options.confirmText || (kind === 'alert' ? 'OK' : toneConfirm(tone)),
        cancelText: options.cancelText || 'Cancel',
        placeholder: kind === 'prompt' ? (options as PromptDialogOptions).placeholder : undefined,
        defaultValue: kind === 'prompt' ? (options as PromptDialogOptions).defaultValue : undefined,
        entity: options.entity,
        actionSummary: options.actionSummary,
        consequence: options.consequence,
        comparison: options.comparison,
        removalItems: options.removalItems,
        status: options.status || toneStatus(tone, kind),
        statusDetail: options.statusDetail,
        progress: options.progress ?? null,
        counts: options.counts,
        formFields: options.formFields,
        asyncAction,
      };
      const initialForm: Record<string, string> = {};
      for (const field of options.formFields || []) {
        initialForm[field.name] = '';
      }
      setPromptValue(request.defaultValue || '');
      setFormValues(initialForm);
      setActionError(null);
      setSubmitting(false);
      submittingRef.current = false;
      setResolver(() => resolve);
      setActive(request);
    });
  }, []);

  const handleConfirmClick = useCallback(async () => {
    if (!active) return;
    if (active.kind === 'prompt') {
      closeDialog(promptValue);
      return;
    }
    if (!active.asyncAction) {
      closeDialog(true);
      return;
    }
    if (!formFieldsReady(active.formFields, formValues)) {
      setActionError('Complete the required fields before confirming.');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      await active.asyncAction(formValues);
      submittingRef.current = false;
      setSubmitting(false);
      if (resolver) resolver(true);
      setResolver(null);
      setActive(null);
      setPromptValue('');
      setFormValues({});
      setActionError(null);
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      setActionError(dialogErrorMessage(error));
    }
  }, [active, closeDialog, formValues, promptValue, resolver]);

  const confirmEnabled = formFieldsReady(active?.formFields, formValues);

  const contextValue = useMemo<AppDialogContextValue>(() => ({
    alert: async options => {
      await openDialog('alert', options);
    },
    confirm: async options => {
      const value = await openDialog('confirm', options);
      return value === true;
    },
    confirmAsync: async (options, action) => {
      const value = await openDialog('confirm', options, action);
      return value === true;
    },
    prompt: async options => {
      const value = await openDialog('prompt', options);
      return typeof value === 'string' ? value : null;
    },
  }), [openDialog]);

  const isDestructive = active?.tone === 'delete' || active?.tone === 'error' || active?.tone === 'logout';

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {active && (
        <Modal
          title={active.title}
          icon={<ToneIcon tone={active.tone} />}
          iconTone={toneChip(active.tone)}
          size="form"
          onClose={() => closeDialog(active.kind === 'prompt' ? null : false)}
          closeOnBackdrop={!submitting}
          closeOnEscape={!submitting}
          footer={(
            <div className="action-status-footer">
              {active.kind !== 'alert' && (
                <button
                  className="btn-secondary"
                  onClick={() => closeDialog(active.kind === 'prompt' ? null : false)}
                  type="button"
                  disabled={submitting}
                >
                  {active.cancelText}
                </button>
              )}
              <button
                className={
                  isDestructive
                    ? 'btn-danger'
                    : active.tone === 'warning' || active.tone === 'unsaved'
                    ? 'btn-warning'
                    : 'btn-primary'
                }
                onClick={() => { void handleConfirmClick(); }}
                type="button"
                autoFocus={active.kind !== 'prompt' && !(active.formFields?.length)}
                disabled={submitting || (Boolean(active.formFields?.length) && !confirmEnabled)}
                aria-busy={submitting}
              >
                {submitting ? 'Working…' : active.confirmText}
              </button>
            </div>
          )}
        >
          <ActionStatusPanel
            message={active.message}
            entity={active.entity}
            actionSummary={active.actionSummary}
            consequence={active.consequence}
            comparison={active.comparison}
            removalItems={active.removalItems}
            status={actionError ? 'failed' : submitting ? 'processing' : active.status}
            statusDetail={actionError ? 'Backend rejected the action' : active.statusDetail}
            progress={active.progress}
            counts={active.counts}
            error={actionError}
          >
            {active.kind === 'prompt' && (
              <div className="field-with-icon mt-1">
                <span className="field-lead-icon"><Pencil size={18} /></span>
                <input
                  value={promptValue}
                  onChange={event => setPromptValue(event.target.value)}
                  className="form-input"
                  placeholder={active.placeholder || 'Enter value'}
                  autoFocus
                  disabled={submitting}
                />
              </div>
            )}
            {Boolean(active.formFields?.length) && (
              <div className="assign-confirm-shell mt-2">
                {active.formFields!.map(field => (
                  <label key={field.name} className="assign-confirm-field">
                    <span>
                      {field.label}
                      {field.required ? <em> (required)</em> : null}
                    </span>
                    {field.type === 'select' ? (
                      <select
                        value={formValues[field.name] || ''}
                        onChange={event => {
                          setFormValues(prev => ({ ...prev, [field.name]: event.target.value }));
                          setActionError(null);
                        }}
                        disabled={submitting}
                        autoFocus={field === active.formFields![0]}
                      >
                        <option value="">{field.placeholder || 'Select…'}</option>
                        {field.options.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        rows={field.rows ?? 3}
                        value={formValues[field.name] || ''}
                        onChange={event => {
                          setFormValues(prev => ({ ...prev, [field.name]: event.target.value }));
                          setActionError(null);
                        }}
                        disabled={submitting}
                        placeholder={field.placeholder}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}
          </ActionStatusPanel>
        </Modal>
      )}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error('useAppDialog must be used inside AppDialogProvider');
  }
  return context;
}
