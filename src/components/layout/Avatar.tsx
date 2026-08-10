interface AvatarProps {
  name: string;
  role?: string;
  size?: number;
}

const ROLE_BG: Record<string, string> = {
  system_admin:      'bg-red-600 text-white',
  ops_director:      'bg-purple-600 text-white',
  prod_supervisor:   'bg-blue-600 text-white',
  qaqc_engineer:     'bg-amber-500 text-white',
  wiring_technician: 'bg-green-600 text-white',
};

export default function Avatar({ name, role, size = 36 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const colorClass = role ? (ROLE_BG[role] ?? 'bg-slate-500 text-white') : 'bg-slate-500 text-white';
  const fontSize = size <= 28 ? 'text-[10px]' : size <= 36 ? 'text-xs' : 'text-sm';

  return (
    <div
      className={`avatar ${colorClass} ${fontSize}`}
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}
