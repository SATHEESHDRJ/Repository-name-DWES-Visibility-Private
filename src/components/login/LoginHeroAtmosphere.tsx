/**
 * Abstract technical atmosphere for the login hero.
 * No wiring diagrams, labels, wire IDs, or fake production data.
 */
export default function LoginHeroAtmosphere() {
  return (
    <div className="login-hero-atmosphere" aria-hidden="true">
      <div className="login-hero-atmosphere-grid" />
      <div className="login-hero-atmosphere-glow login-hero-atmosphere-glow--a" />
      <div className="login-hero-atmosphere-glow login-hero-atmosphere-glow--b" />
      <div className="login-hero-atmosphere-edge" />
      <svg className="login-hero-atmosphere-geo" viewBox="0 0 640 420" focusable="false">
        <defs>
          <linearGradient id="loginAtmStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(125, 211, 252, 0.08)" />
            <stop offset="50%" stopColor="rgba(96, 165, 250, 0.35)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.12)" />
          </linearGradient>
        </defs>
        {/* Translucent planes */}
        <rect x="72" y="48" width="220" height="140" rx="14" className="login-hero-atm-plane" />
        <rect x="340" y="120" width="210" height="160" rx="14" className="login-hero-atm-plane login-hero-atm-plane--soft" />
        {/* Precision contours */}
        <path
          d="M48 300 H180 L220 260 H360 L410 300 H580"
          className="login-hero-atm-line"
        />
        <path
          d="M90 80 V200 M520 90 V250"
          className="login-hero-atm-line login-hero-atm-line--faint"
        />
        <circle cx="180" cy="300" r="3.5" className="login-hero-atm-marker" />
        <circle cx="360" cy="260" r="3.5" className="login-hero-atm-marker" />
        <circle cx="520" cy="170" r="4" className="login-hero-atm-marker login-hero-atm-marker--accent" />
        <circle cx="120" cy="120" r="18" className="login-hero-atm-ring" />
        <circle cx="470" cy="200" r="28" className="login-hero-atm-ring login-hero-atm-ring--soft" />
        {/* Coordinate ticks — unlabeled */}
        <g className="login-hero-atm-ticks">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1={60 + i * 90} y1="360" x2={60 + i * 90} y2="368" />
          ))}
        </g>
      </svg>
    </div>
  );
}
