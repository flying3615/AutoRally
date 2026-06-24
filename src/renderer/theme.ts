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

// Translucent accent wash — drag-over highlights and subtle active surfaces.
// Tinted with the single accent (Emerald-600) so interaction cues stay on-brand.
export const accentWash = 'rgba(5, 150, 105, 0.08)';

// ── Court / timer phase palette ──
// Single source of truth for match-panel status colors. Both the court cards
// and the floating master timer derive their surface/border/text/shadow from
// here, so a phase always reads as the same hue across the screen.
export type CourtPhase = 'running' | 'warning' | 'ended' | 'paused';

export const courtPhase: Record<CourtPhase, {
  surface: string;        // solid court-card background
  surfaceGlass: string;   // translucent background for the blurred floating timer
  border: string;
  text: string;           // strong foreground: timer digits + status label
  cardShadow: string;     // elevation for court cards
  overlayShadow: string;  // stronger elevation for the floating timer
}> = {
  running: {
    surface: '#f0fdf4',
    surfaceGlass: 'rgba(240, 253, 244, 0.95)',
    border: '#bbf7d0',
    text: '#16a34a',
    cardShadow: '0 4px 20px -8px rgba(34, 197, 94, 0.12)',
    overlayShadow: '0 8px 30px -8px rgba(34, 197, 94, 0.25)',
  },
  warning: {
    surface: '#fffbeb',
    surfaceGlass: 'rgba(255, 251, 235, 0.95)',
    border: '#fde68a',
    text: '#d97706',
    cardShadow: '0 4px 20px -8px rgba(234, 179, 8, 0.2)',
    overlayShadow: '0 8px 30px -8px rgba(234, 179, 8, 0.35)',
  },
  ended: {
    surface: '#fef2f2',
    surfaceGlass: 'rgba(254, 242, 242, 0.95)',
    border: '#fecaca',
    text: '#ef4444',
    cardShadow: '0 4px 20px -8px rgba(239, 68, 68, 0.15)',
    overlayShadow: '0 8px 30px -8px rgba(239, 68, 68, 0.25)',
  },
  paused: {
    surface: '#f5f5f4',
    surfaceGlass: 'rgba(245, 244, 241, 0.95)',
    border: '#d6d3d1',
    text: '#a16207',
    cardShadow: '0 4px 20px -8px rgba(120, 113, 108, 0.1)',
    overlayShadow: '0 8px 30px -8px rgba(120, 113, 108, 0.2)',
  },
};
