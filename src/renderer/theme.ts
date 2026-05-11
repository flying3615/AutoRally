// ── Taste-aligned Design Tokens ──
// Single accent: Refined Emerald — energetic, sporty, under 80% saturation
// Neutrals: Zinc absolute scale (no warm/cool fluctuation)
// Gender colors: functional data-viz, not decorative accents

// Single accent color — used for CTAs, active states, focus rings
export const accentColor = '#059669'; // Emerald-600

// Level colors — emerald scale, darker = higher skill
export const levelColors: Record<number, string> = {
  5: '#022c22', // Emerald-950 — elite
  4: '#064e3b', // Emerald-900 — advanced
  3: '#047857', // Emerald-700 — intermediate
  2: '#059669', // Emerald-600 — novice (same as accent)
  1: '#34d399', // Emerald-400 — beginner
};

// Level badge Tailwind classes (for AG Grid cells)
export const levelBadgeClasses: Record<number, string> = {
  5: 'bg-emerald-950 text-emerald-200',
  4: 'bg-emerald-900 text-emerald-200',
  3: 'bg-emerald-700 text-emerald-100',
  2: 'bg-emerald-600 text-white',
  1: 'bg-emerald-200 text-emerald-900',
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
