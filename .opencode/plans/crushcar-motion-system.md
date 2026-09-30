# CrushCar Creative Motion System — Implementation Plan

## Overview

Transform the CrushCar landing page with a premium cinematic motion system centered around a dark luxury bus SVG that serves as the soul of the experience. All changes are purely visual — zero backend, API, or business logic modifications.

## Files to Create (13 new files)

### Components (`src/components/landing/`)

1. **BackgroundLayers.tsx** — Void gradient, 3 blobs, grid overlay, CSS particles, road
2. **BusSVG.tsx** — Premium dark coach SVG (560×200), React.memo wrapped
3. **EnhancedSeat.tsx** — Breathing glow seat component with layoutId transitions
4. **ActivityToast.tsx** — Social proof toast with spring animations + progress bar
5. **CinematicOverlay.tsx** — Orchestrates the full booking launch sequence
6. **ScreenWipe.tsx** — Screen wipe transition + booking page staggered reveal
7. **PageTransitionWrapper.tsx** — Wraps landing page, intercepts booking clicks

### Hooks (`src/hooks/`)

8. **useCountUp.ts** — IntersectionObserver-based animated counter
9. **useMouseParallax.ts** — Sets --mouse-x/--mouse-y CSS vars, touch-disabled
10. **useActivityToasts.ts** — Auto-generates social proof events every 3-7s

### Files to Modify (3 files, additive only)

11. **src/app/globals.css** — Append ~350 lines: CSS tokens, keyframes, RTL overrides, mobile
12. **src/app/layout.tsx** — Append Geist Mono font link to `<head>`
13. **src/app/page.tsx** — Wrap existing JSX with new layers; add cinematic trigger to CTA button

## Implementation Sequence

### Phase 1: Foundation (Steps 1-4)

#### Step 1 — CSS Design Tokens
- Append to `globals.css`:
  - `:root` tokens: `--blue-core`, `--blue-bright`, `--cyan-accent`, `--seat-*`, `--asphalt`, etc.
  - `@media (prefers-reduced-motion: reduce)` base override (kills all animations)
- Add Geist Mono font to `layout.tsx` `<head>`

#### Step 2 — Background System (`BackgroundLayers.tsx`)
- `VoidGradient` — fixed radial-gradient with `voidBreathe` 25s loop
- `BlobField` — 3 blobs with independent drift animations (38s, 45s, 22s)
- `GridOverlay` — SVG pattern, parallax via CSS `--mouse-x`/`--mouse-y`
- `Road` — fixed bottom, animated dashed center line (0.8s loop)
- Mobile: 1 blob at 50%, grid hidden, road dashes hidden

#### Step 3 — Bus SVG (`BusSVG.tsx`)
- Inline SVG: dark premium coach, blue LED accents, glowing headlights
- Props: `state: 'ambient' | 'launching' | 'nudge' | 'parked'`
- CSS classes: `.bus-wrapper`, `.wheel`, `.led-strip`, `.headlight-main`, `.tail-light`
- `React.memo` wrapped for performance
- RTL: `scaleX(-1)` via CSS `[dir="rtl"]` selector

#### Step 4 — Bus CSS Animations
- `busEnter` (1.5s, enters from left), `busFloat` (3.5s, gentle vertical), `busDrift` (60s, slow horizontal)
- `wheelSpin` (1.2s, continuous), `ledPulse` (2s), `headlightPulse` (3s), `tailFlicker` (4s)
- `busLaunch` (1.3s, rubber band → motion blur → exit) + `busLaunchRTL` variant
- `busNudge` (0.6s, spring forward +6px then return)

### Phase 2: Hero Enhancements (Steps 5-11)

#### Step 5 — Enhanced Hero Wrapper
- Wrap existing `HeroSection` content with `<BackgroundLayers />` + `<BusSVG />`
- z-index layering: blobs(z-2) → road(z-1) → grid(z-3) → particles(z-4) → bus(z-5) → hero content(z-10)
- Zero changes to existing hero JSX

#### Step 6 — Accent Word "في ثواني"
- `.accent-word` class: `accentShimmer` (3s gradient shift) + `underlineGlow` (3s pulse)
- Apply to existing gradient span in HeroSection

#### Step 7 — CTA Button Enhancements
- `.btn-primary` with `::before` shine sweep on hover
- `.ripple` class for click ripple effect
- Add `createRipple()` handler to CTA button (pure visual)

#### Step 8 — Count-Up Hook (`useCountUp.ts`)
- IntersectionObserver triggers count-up when visible
- `easeOutExpo` easing, configurable duration/decimals
- Drop-in replacement for static stat values

#### Step 9 — Stat Card Hover
- `.stat-card` with `translateY(-6px)` + blue border glow
- Mouse parallax tilt (±6deg) via CSS `rotateX`/`rotateY`

#### Step 10 — Mouse Parallax Hook (`useMouseParallax.ts`)
- Sets `--mouse-x`/`--mouse-y` on `document.documentElement`
- Disabled on touch devices
- Used by: blobs (±30px), grid (±15px), stat cards (tilt ±6deg)

#### Step 11 — Navbar Enhancements
- `.nav-logo` breathing glow (4s loop)
- `.nav-link::after` underline animation (RTL-aware, starts from right)
- `scrollProgress` state for reading progress bar (optional)

### Phase 3: Interactive Elements (Steps 12-14)

#### Step 12 — Enhanced Seat (`EnhancedSeat.tsx`)
- `React.memo` wrapped
- Breathing glow per state: free (green), mine (blue), taken (red), vip (amber)
- `layoutId` for Framer Motion layout transitions
- `whileHover`/`whileTap` spring animations

#### Step 13 — Seat Selection Effects
- Ripple effect on seat select (white flash → color transition)
- Adjacent seat pulse (stagger 60ms, scale 1.03→1)
- Bus nudge trigger (forward +6px spring return)
- Toast notification trigger

#### Step 14 — Activity Toast System
- `ActivityToast.tsx`: spring enter/exit, animated dot ping, progress bar countdown
- `useActivityToasts.ts`: scheduler (3-7s random interval), Arabic names, seat IDs
- Desktop: max 3 visible, bottom-left (RTL), spring stack
- Mobile: max 1 visible, bottom-center, full-width minus 24px

### Phase 4: Cinematic Booking Sequence (Steps 15-17)

#### Step 15 — Cinematic Overlay (`CinematicOverlay.tsx`)
- Phase 0 (0-200ms): Button ripple, lock scroll
- Phase 1 (200-600ms): World dims (radial vignette overlay), hero text fades with blur
- Phase 2 (400-900ms): Bus charges up (LED flashes 3x, headlights surge, exhaust particles)
- Phase 3 (900-2200ms): BUS LAUNCHES (rubber band → motion blur → exit left/right for RTL)
- Phase 3b: Dust trail (12 particles, random size/velocity, expand + fade)
- Phase 4 (900-1800ms): Road accelerates (0.15s loop), then fades

#### Step 16 — Screen Wipe (`ScreenWipe.tsx`)
- Phase 5 (1800-2400ms): `scaleX` wipe from right (RTL: from left)
- Phase 6 (2400-3500ms): Booking page elements stagger reveal
  - Trip header (2.4s) → Route (2.48s) → Date (2.56s) → Seat map (2.64s) → Price (2.72s) → Button (2.80s)

#### Step 17 — Page Transition Wrapper (`PageTransitionWrapper.tsx`)
- Wraps entire landing page
- Intercepts "ابدأ الحجز الآن" click → runs cinematic → then `router.push('/trips')`
- Uses `useState` for cinematic state: `'idle' | 'running' | 'complete'`

### Phase 5: Polish (Steps 18-22)

#### Step 18 — Mouse Parallax Integration
- Apply `--mouse-x`/`--mouse-y` to all relevant layers
- Bus hover reaction: cursor within 300px → subtle lean forward
- Bus hover:mouseenter → LED flash + exhaust puff (optional horn, muted default)

#### Step 19 — RTL Overrides
- `[dir="rtl"]` selectors for: nav underlines, toast direction, road animation, bus mirror, button shine, accent underline, bus launch direction

#### Step 20 — Mobile Optimizations
- Bus: 60% scale (336px), faster launch (0.9s), opacity 0.4 behind content
- Parallax: disabled, gyroscope tilt (±2deg) if available
- Seats: min 48×48px touch targets, larger grid spacing
- Toasts: bottom-center, full-width, max 1
- Blobs: 1 only at 50% opacity

#### Step 21 — Reduced Motion Fallbacks
- `@media (prefers-reduced-motion: reduce)`: kills all animations
- Static bus (centered, no movement), instant toasts, no transitions
- `useReducedMotion()` from framer-motion for JS-side checks

#### Step 22 — Performance Audit
- `will-change: transform` added before animations, removed via `onAnimationEnd`
- `React.memo` on: `BusSVG`, `EnhancedSeat`, `ActivityToast`, `BackgroundLayers`
- Max particles: 12 desktop / 6 mobile
- Target: 60fps on iPhone 12 / Pixel 6, Lighthouse ≥ 80

## Quality Checklist

- [ ] Bus enters smoothly on first load (no flash/jump)
- [ ] Bus wheels spin in correct direction
- [ ] LED strip visible but not distracting
- [ ] Headlights glow is subtle — not blinding
- [ ] "ابدأ الحجز الآن" click: full cinematic sequence fires correctly
- [ ] Dust cloud appears at correct position (bus rear)
- [ ] Dust dissipates before booking page reveals
- [ ] All existing seat selection logic UNCHANGED
- [ ] Realtime events still fire correctly
- [ ] RTL: bus mirrors correctly, toast enters from correct side
- [ ] Mobile: no horizontal scroll, touch targets ≥ 48px
- [ ] prefers-reduced-motion: zero animations fire
- [ ] Console: zero errors from animation code
- [ ] Booking flow: works identically with/without animations
- [ ] Bus launch: happens ONCE per click (no double-fire)
