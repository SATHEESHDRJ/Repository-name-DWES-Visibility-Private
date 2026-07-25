import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LogOut, Save, Trash2, TriangleAlert, Pencil } from './ui/icons';
import Modal from './Modal';

type DialogTone = 'info' | 'success' | 'warning' | 'error' | 'delete' | 'logout' | 'save' | 'unsaved';
type DialogKind = 'alert' | 'confirm' | 'prompt';

interface BaseDialogOptions {
  title?: string;
  message: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
}

interface PromptDialogOptions extends BaseDialogOptions {
  placeholder?: string;
  defaultValue?: string;
}

interface DialogRequest {
  kind: DialogKind;
  title: string;
  message: string;
  tone: DialogTone;
  confirmText: string;
  cancelText: string;
  placeholder?: string;
  defaultValue?: string;
}

interface AppDialogContextValue {
  alert: (options: BaseDialogOptions) => Promise<void>;
  confirm: (options: BaseDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function toneTitle(tone: DialogTone) {
  if (tone === 'delete') return 'Delete Item';
  if (tone === 'logout') return 'Confirm Logout';
  if (tone === 'save') return 'Save Changes';
  if (tone === 'unsaved') return 'Unsaved Changes';
  if (tone === 'success') return 'Success';
  if (tone === 'warning') return 'Warning';
  if (tone === 'error') return 'Action Failed';
  return 'Information';
}

function toneConfirm(tone: DialogTone) {
  if (tone === 'delete') return 'Delete';
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

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [resolver, setResolver] = useState<((value: boolean | string | null) => void) | null>(null);

  const closeDialog = useCallback((value: boolean | string | null) => {
    if (resolver) resolver(value);
    setResolver(null);
    setActive(null);
    setPromptValue('');
  }, [resolver]);

  const openDialog = useCallback((kind: DialogKind, options: BaseDialogOptions | PromptDialogOptions) => {
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
      };
      setPromptValue(request.defaultValue || '');
      setResolver(() => resolve);
      setActive(request);
    });
  }, []);

  const contextValue = useMemo<AppDialogContextValue>(() => ({
    alert: async options => {
      await openDialog('alert', options);
    },
    confirm: async options => {
      const value = await openDialog('confirm', options);
      return value === true;
    },
    prompt: async options => {
      const value = await openDialog('prompt', options);
      return typeof value === 'string' ? value : null;
    },
  }), [openDialog]);

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {active && (
        <Modal
          title={active.title}
          icon={<ToneIcon tone={active.tone} />}
          iconTone={toneChip(active.tone)}
          size="sm"
          onClose={() => closeDialog(active.kind === 'prompt' ? null : false)}
          footer={(
            <>
              {active.kind !== 'alert' && (
                <button
                  className="btn-secondary"
                  onClick={() => closeDialog(active.kind === 'prompt' ? null : false)}
                  type="button"
                >
                  {active.cancelText}
                </button>
              )}
              <button
                className={
                  active.tone === 'delete' || active.tone === 'error' || active.tone === 'logout'
                    ? 'btn-danger'
                    : active.tone === 'warning' || active.tone === 'unsaved'
                    ? 'btn-warning'
                    : 'btn-primary'
                }
                onClick={() => closeDialog(active.kind === 'prompt' ? promptValue : true)}
                type="button"
              >
                {active.confirmText}
              </button>
            </>
          )}
        >
          <div className="flex flex-col gap-4">
            <p className="dlg-message">{active.message}</p>
            {active.kind === 'prompt' && (
              <div className="field-with-icon">
                <span className="field-lead-icon"><Pencil size={18} /></span>
                <input
                  value={promptValue}
                  onChange={event => setPromptValue(event.target.value)}
                  className="form-input"
                  placeholder={active.placeholder || 'Enter value'}
                  autoFocus
                />
              </div>
            )}
          </div>
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
