const CANONICAL_LOGO_SRC = '/logo-full.png';

type Variant = 'full' | 'icon' | 'white';
type Size    = 'sm'   | 'md'  | 'lg';

// Fixed height per size; width is always auto so the image never distorts or clips
const HEIGHT_CLS: Record<Size, string> = { sm: 'h-8', md: 'h-10', lg: 'h-12' };

// Horizontal / vertical padding split — keeps the white pill snug around the logo
const PAD_CLS: Record<Size, string> = {
  sm: 'px-2 py-1.5',
  md: 'px-3 py-2',
  lg: 'px-4 py-3',
};

const RADIUS_CLS: Record<Size, string> = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
};

interface Props {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export default function CompanyLogo({ variant = 'full', size = 'md', className = '' }: Props) {
  const hCls  = HEIGHT_CLS[size];
  const pad   = PAD_CLS[size];
  const rad   = RADIUS_CLS[size];

  // object-contain + w-auto: never crops, never distorts, never clips
  // block: removes the inline-baseline gap that can add phantom space below the image
  const img = (
    <img
      src={CANONICAL_LOGO_SRC}
      alt="Ingenious Network FZC"
      className={`${hCls} w-auto object-contain block`}
    />
  );

  // 'white' variant — dark panel: logo inside a white shrink-wrap pill
  if (variant === 'white') {
    return (
      <div className={`inline-flex w-fit items-center ${pad} bg-white ${rad} overflow-visible shadow-md ${className}`}>
        {img}
      </div>
    );
  }

  // 'icon' variant — topbar: same white pill, no drop shadow
  if (variant === 'icon') {
    return (
      <div className={`inline-flex w-fit items-center ${pad} bg-white ${rad} overflow-visible ${className}`}>
        {img}
      </div>
    );
  }

  // 'full' variant — light background: bare image
  return (
    <div className={`inline-flex w-fit items-center overflow-visible ${className}`}>
      {img}
    </div>
  );
}
