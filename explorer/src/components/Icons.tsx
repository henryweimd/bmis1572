interface IconProps {
  className?: string;
  filled?: boolean;
}

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

export function BrandMark({ className = 'icon' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="1.5" y="7.5" width="3.2" height="7" rx="0.8" fill="currentColor" opacity="0.55" />
      <rect x="6.4" y="4.5" width="3.2" height="10" rx="0.8" fill="currentColor" opacity="0.8" />
      <rect x="11.3" y="1.5" width="3.2" height="13" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function IconSearch({ className = 'icon' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function IconBookmark({ className = 'icon', filled = false }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5L8 10.8l-4.5 2.7V3a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}

export function IconLink({ className = 'icon' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.8 9.2a3 3 0 0 0 4.2 0l1.8-1.8a3 3 0 0 0-4.2-4.2L7.5 4.3" />
      <path d="M9.2 6.8a3 3 0 0 0-4.2 0L3.2 8.6a3 3 0 1 0 4.2 4.2l1.1-1.1" />
    </svg>
  );
}

export function IconExternal({ className = 'icon' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 3.5H3.5v9h9v-3" />
      <path d="M9 2.5h4.5V7" />
      <path d="M7.5 8.5l6-6" />
    </svg>
  );
}

export function IconClose({ className = 'icon' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconArrowRight({ className = 'icon' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8h9M9 4.5L12.5 8 9 11.5" />
    </svg>
  );
}

export function IconInfo({ className = 'icon' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v3.6M8 5h.01" />
    </svg>
  );
}
