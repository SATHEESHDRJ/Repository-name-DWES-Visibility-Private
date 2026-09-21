import { ClipboardList, ShieldCheck, Zap } from '../ui/icons';
import { LOGIN_SHOWCASE_FEATURES, type LoginShowcaseFeature } from './loginShowcaseContent';

const ICONS = {
  zap: Zap,
  clipboard: ClipboardList,
  shield: ShieldCheck,
} as const;

function FeatureIcon({ icon }: { icon: LoginShowcaseFeature['icon'] }) {
  const Icon = ICONS[icon];
  return <Icon size={15} strokeWidth={1.75} aria-hidden="true" />;
}

export default function LoginShowcaseFeatures() {
  return (
    <>
      <div className="login-features-mobile" aria-label="Key capabilities">
        {LOGIN_SHOWCASE_FEATURES.map((f) => (
          <span key={f.id} className="login-feature-chip">
            <FeatureIcon icon={f.icon} />
            {f.title.split(' ').slice(0, 2).join(' ')}
          </span>
        ))}
      </div>

      <div className="login-features-list login-features-list--master" aria-label="Key capabilities">
        {LOGIN_SHOWCASE_FEATURES.map((f) => (
          <div key={f.id} className="login-feature-card login-feature-card--master">
            <div className="login-feature-icon">
              <FeatureIcon icon={f.icon} />
            </div>
            <div className="login-feature-copy">
              <span className="login-feature-title">{f.title}</span>
              <span className="login-feature-body">{f.body}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
