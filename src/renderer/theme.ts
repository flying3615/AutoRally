// ── Taste-aligned Design Tokens ──
// Single accent: Refined Emerald — energetic, sporty, under 80% saturation
// Neutrals: Zinc absolute scale (no warm/cool fluctuation)
// Gender colors: functional data-viz, not decorative accents

// Single accent color — used for CTAs, active states, focus rings
export const accentColor = '#059669'; // Emerald-600

// Level colors — distinct per tier so each level is immediately recognisable
export const levelColors: Record<number, string> = {
  1: '#d1fae5', // Emerald-100 — beginner (light mint)
  2: '#34d399', // Emerald-400 — novice  (bright green)
  3: '#047857', // Emerald-700 — intermediate (forest green)
  4: '#1d4ed8', // Blue-700    — advanced (clear hue break)
  5: '#d97706', // Amber-600   — elite (gold / prestige)
};

// Level text colors — for use as foreground/text color on light backgrounds
export const levelTextColors: Record<number, string> = {
  1: '#10b981', // Emerald-500 — lightest readable green
  2: '#047857', // Emerald-700
  3: '#065f46', // Emerald-800
  4: '#1e40af', // Blue-800
  5: '#b45309', // Amber-700
};

// Level badge Tailwind classes (for AG Grid cells)
export const levelBadgeClasses: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-800',
  2: 'bg-emerald-400 text-white',
  3: 'bg-emerald-700 text-white',
  4: 'bg-blue-700 text-white',
  5: 'bg-amber-600 text-white',
};

// Gender colors — soft pastels for visual distinction, not loud
export const genderColors = {
  male: {
    bg: '#eff6ff',   // Blue-50  — whisper blue
    border: '#bfdbfe', // Blue-200 — soft definition
    accent: '#2563eb', // Blue-600 — for icons/badges
  },
  female: {
    bg: '#fff1f2',   // Rose-50  — whisper rose
    border: '#fecdd3', // Rose-200 — soft definition
    accent: '#e11d48', // Rose-600 — for icons/badges
  },
} as const;
