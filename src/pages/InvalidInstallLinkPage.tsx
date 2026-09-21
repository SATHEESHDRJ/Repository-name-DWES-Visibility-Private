import { ShieldAlert } from '../components/ui/icons';

export default function InvalidInstallLinkPage() {
  return (
    <div className="login-page-root font-sans flex items-center justify-center min-h-[100svh] bg-[#EEF2F6] px-4">
      <div className="login-card-wrap max-w-md">
        <article className="login-card-surface login-card-surface--modern p-6 text-center">
          <div className="flex justify-center mb-3 text-slate-500" aria-hidden="true">
            <ShieldAlert size={32} strokeWidth={1.5} />
          </div>
          <h1 className="text-lg font-bold text-slate-900 m-0 mb-2">Installation link not valid</h1>
          <p className="text-sm text-slate-600 m-0 leading-relaxed">
            This DWES installation link is no longer valid. Contact your System Administrator.
          </p>
        </article>
      </div>
    </div>
  );
}
