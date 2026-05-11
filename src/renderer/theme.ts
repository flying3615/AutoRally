// Level colors — emerald scale, darker = higher level
export const levelColors: Record<number, string> = {
  5: '#022c22',
  4: '#064e3b',
  3: '#047857',
  2: '#059669',
  1: '#34d399',
};

// Level badge Tailwind classes (for AG Grid cells where inline styles don't apply)
export const levelBadgeClasses: Record<number, string> = {
  5: 'bg-emerald-900 text-emerald-100',
  4: 'bg-emerald-700 text-emerald-100',
  3: 'bg-emerald-500 text-white',
  2: 'bg-emerald-300 text-emerald-900',
  1: 'bg-emerald-100 text-emerald-800',
};

// Gender colors
export const genderColors = {
  male: { bg: '#dbeafe', border: '#93c5fd', accent: '#3b82f6' },
  female: { bg: '#fce7f3', border: '#f9a8d4', accent: '#ec4899' },
} as const;
