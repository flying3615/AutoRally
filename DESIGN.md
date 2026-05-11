# Design System: AutoRally

## 1. Visual Theme & Atmosphere

A purposeful, mid-density management interface for badminton club organizers. The atmosphere is clean and focused — like a well-organized coach's clipboard upgraded to digital. Symmetric structure for data tables, deliberate asymmetry for hero cards and active session banners. Motion is functional and restrained — spring-physics transitions on interactive elements, cascading reveals for lists, gentle pulse for live indicators.

**Density:** 6 (Daily App Balanced) — scannable data density without cockpit overwhelm.
**Variance:** 4 (Predictable Symmetric) — consistent grid layouts for tables, subtle asymmetry in hero cards.
**Motion:** 4 (Fluid CSS) — spring-based micro-interactions, staggered list reveals, no cinematic choreography.

## 2. Color Palette & Roles

- **Canvas** (#F7F7F8) — Primary background surface, warm neutral
- **Pure Surface** (#FFFFFF) — Card, table, and modal fill
- **Charcoal Ink** (#18181B / Zinc-950) — Primary text, deep headings
- **Muted Steel** (#71717A / Zinc-500) — Secondary text, descriptions, metadata
- **Faint Label** (#A1A1AA / Zinc-400) — Tertiary text, timestamps, pagination
- **Whisper Border** (#E4E4E7 / Zinc-200) — Card borders, structural lines, table separators
- **Ghost Hover** (#F4F4F5 / Zinc-100) — Row hover, button hover backgrounds
- **Ink Active** (#27272A / Zinc-800) — Active nav, primary button fill, selected states
- **Court Green** (#059669 / Emerald-600) — Single accent for active sessions, success states, primary CTAs
- **Court Green Light** (#D1FAE5 / Emerald-100) — Light accent backgrounds for active badges
- **Danger Red** (#DC2626 / Red-600) — Destructive actions, unpaid indicators, delete confirmations
- **Blue Gender** (#3B82F6 / Blue-500) — Male player indicator only (not an accent)
- **Pink Gender** (#EC4899 / Pink-500) — Female player indicator only (not an accent)

**Banned:** No purple, no neon, no gradient buttons, no pure black (#000), no oversaturated accents. One accent only (Court Green).

## 3. Typography Rules

- **Primary:** DM Sans — clean geometric sans-serif with distinctive character, excellent at management UI scale
- **Monospace:** DM Mono — for tabular data, balances, timer displays, level numbers
- **Display/Headings:** DM Sans Bold (700), track-tight (-0.02em), controlled scale (20-24px). Hierarchy through weight and color, not massive size jumps.
- **Body:** DM Sans Regular (400) / Medium (500), relaxed leading (1.5), max 65ch.
- **Labels:** DM Sans Semibold (600), uppercase, 11px, tracking-wide (0.06em), Zinc-400 color.
- **Data:** DM Mono Medium (500) for all numerical values — balances, counts, timer displays, tabular alignment.

**Banned:** Inter font. Generic system fonts as primary. Serif fonts in dashboards.

## 4. Component Stylings

**Buttons:**
- Primary: Ink Active fill (#27272A), white text, rounded-lg (8px), shadow on hover. Tactile scale(0.97) on active press.
- Accent: Court Green (#059669) for session/match actions. Same shape language.
- Ghost: Transparent bg, Zinc text, hover Zinc-100 bg. No border.
- Danger: Red-600 for destructive actions with confirmation pattern.

**Cards:**
- Generous rounded corners (rounded-2xl / 16px).
- Diffused whisper shadow: `0 2px 8px -4px rgba(0,0,0,0.04)`.
- Used only when elevation communicates hierarchy (hero banners, modals).
- Data lists use border-top dividers instead of cards for density.
- Dark hero cards use dot-pattern overlay at 4% opacity.

**Inputs:**
- Label above in uppercase Zinc-400 Semibold.
- 2px border in Zinc-200, focus ring in Zinc-200 bg.
- Rounded-lg (8px). Height 36px.

**Tables (AG Grid):**
- Header: Zinc-100 bg, uppercase 11px labels, Zinc-400 color, 0.06em tracking.
- Row height: 44px (relaxed) for standard, 52px for player rows with avatars.
- Alternating row background: Zinc-50 on odd rows.
- Hover: Zinc-50 bg, no border highlight.
- Pagination: Zinc-400 text, Zinc bg hover on buttons.

**Badges/Pills:**
- Rounded-md (6px), Semibold weight, compact padding (px-2 py-0.5).
- Gender: Blue-50/Blue-700 or Pink-50/Pink-700.
- Level: Emerald gradient scale (dark for high, light for low).
- Status: Emerald-50/Emerald-700 for active, Zinc-100/Zinc-500 for ended.

**Avatars:**
- Rounded-lg (8px) squircle shape — not circles.
- Initial letter on Blue-500 (M) or Pink-500 (F) background.
- Size: 28px in tables, 32px in cards, 20px in compact lists.

**Context Menus:**
- Rounded-xl (12px), white bg, shadow `0 12px 32px -12px rgba(0,0,0,0.15)`.
- Header row with avatar + name, divider, action items with icons.
- Scale-in animation from 0.96 with 4px upward translate.

**Modals:**
- Centered overlay with black/30 backdrop blur.
- Rounded-2xl (16px), generous padding (24px).
- Shadow `0 24px 48px -12px rgba(0,0,0,0.25)`.

## 5. Layout Principles

- **Sidebar:** 52px icon rail, expands to 192px on hover. Zinc white bg, Ink Active for current page.
- **Content area:** Max-width 5xl (1024px) for management pages, 4xl (896px) for focused pages, 2xl (672px) for settings.
- **Page headers:** Left-aligned, 32px bottom margin. Title in 20px Bold, description in 14px Zinc-400 Medium.
- **Grid-first:** CSS Grid for card layouts (2-col for dashboard stats, 2-col for game courts).
- **Spacing scale:** 4px base. 8px small gaps, 16px medium, 24px large, 32px sections.
- **Container padding:** 32px horizontal, 40px vertical.

## 6. Motion & Interaction

- **Spring physics:** All button/interactive elements use `cubic-bezier(0.16, 1, 0.3, 1)` for enter, `ease` for hover transitions.
- **Active press:** `scale(0.97)` on `active:` state for all buttons — tactile push feedback.
- **Sidebar expand:** 200ms duration with `cubic-bezier(0.25, 0.1, 0.25, 1)` easing.
- **Context menus:** Scale from 0.96 + 4px translateY with 120ms spring easing.
- **Page transitions:** 300ms opacity fade-in on mount.
- **List reveals:** Staggered `slideUp` with 40ms cascade delay per item.
- **Active pulse:** Emerald dot with `animate-pulse` for live session indicators.
- **Performance:** Only `transform` and `opacity` animated. No layout-triggering properties.

## 7. Anti-Patterns (Banned)

- No emojis anywhere in the interface
- No Inter font — use DM Sans
- No pure black (#000000) — use Zinc-950 (#18181B)
- No neon glow shadows on any element
- No gradient text or gradient buttons
- No custom mouse cursors
- No 3-column equal card layouts — use asymmetric grids or 2-column
- No generic placeholder names ("John Doe", "Acme Corp")
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen")
- No circular spinners for loading — use skeleton shimmer
- No overlapping elements — clean spatial separation
- No purple or blue as accent colors — single green accent only
- No exclamation marks in UI copy
- No title case on headers — use sentence case
