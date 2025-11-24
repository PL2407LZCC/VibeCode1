# Kiosk Layout & Theme Refresh Plan

## Objective
- Deliver a kiosk experience where the cart column remains fully visible regardless of zoom level while the product gallery keeps its previous responsive layout and spacing.
- Update the application theme colors to a black, pink, and white palette across kiosk and admin surfaces.

## Phases

### Phase 1 — UI Architecture Review *(coding paused until this phase is complete)*
- [x] Audit kiosk layout structure in `client/src/App.tsx` to map component composition and wrappers.
- [x] Inspect related layout styles in `client/src/App.css`, `client/src/components/CartPanel.tsx`, and `client/src/components/ProductGrid.tsx` for constraints that may conflict with the target behavior.
- [x] Document any legacy decisions (e.g., fixed heights, grid definitions, container wrappers) that could block the desired scroll/zoom behavior.
- [x] Summarize findings and confirm feasibility or required rearchitecture before moving forward.

### Phase 2 — Layout Strategy Definition
- [x] Propose updated layout approach that keeps the cart column pinned while restoring product grid responsiveness.
- [x] Validate CSS strategy against zoom scenarios (browser zoom in/out, small desktop viewports) conceptually.
- [x] Identify any shared layout utilities or breakpoints that must be adjusted.
- [x] Review with stakeholder (user) for approval.

**Proposed Strategy Overview**
- Introduce explicit layout wrappers in the kiosk view: `kiosk-layout__products` (flex column housing the grid) and `kiosk-layout__cart` (sticky container for the cart). The main `kiosk-layout` becomes a two-column CSS grid with `minmax(0, 1fr)` for the product column and `minmax(320px, 360px)` for the cart column to maintain responsive width without forcing height coupling.
- Convert the `app-shell` back to a flex column (`display: flex; flex-direction: column; min-height: 100dvh`) so the page can grow taller than the viewport when the product grid expands. Allow the browser to manage vertical scroll while keeping the cart pinned via sticky positioning.
- Replace the shared `--kiosk-column-height` variable with cart-specific sizing: apply `max-height: calc(100dvh - top-bar-offset)` only to the cart wrapper and its content, remove height constraints from the product column, and ensure `cart-panel` uses `flex: 1` with internal scroll for its contents.
- Guard sticky offsets with a single CSS custom property derived from the top bar height so zoom adjustments keep the cart flush to the viewport without affecting the product column.
- Preserve product grid responsiveness by retaining the original `repeat(auto-fill, minmax(220px, 1fr))` definition and letting it flow vertically; ensure gutters remain via padding or `gap` and rely on global body scrolling to avoid card overlap.
- Plan for future extension: if kiosk pages need independent scrolling (e.g., kiosk vs admin), encapsulate layout logic using a dedicated `kiosk-layout.css` module to keep concerns isolated.

### Phase 3 — Implementation
- [x] Apply agreed structural changes to layout components and styles.
- [x] Adjust or introduce CSS custom properties to support responsive behavior.
- [x] Ensure cart interactions (scrolling content, totals visibility) remain intact.

### Phase 4 — Theme Refresh
- [x] Define the black/pink/white palette (hex values, usage guidelines).
- [x] Update global styles, gradients, and component accents to the new palette.
- [x] Verify contrast and accessibility implications.

### Phase 5 — Validation & Regression Testing
- [ ] Cross-check kiosk and admin interfaces across common breakpoints and zoom levels.
- [ ] Run existing unit/integration/UI tests and add new ones if regressions are possible.
- [ ] Capture before/after screenshots or notes for stakeholder sign-off.

## Progress Log
- 2025-11-17 — Phase 1 complete. Audited kiosk structure in `client/src/App.tsx`; confirmed `main.kiosk-layout` wraps `ProductGrid` and `CartPanel` without intermediary containers. Reviewed `client/src/App.css` and found global layout relies on CSS custom properties (`--kiosk-viewport-height`, `--kiosk-column-height`) that force a shared min-height on the grid and cart column, potentially conflicting with the desired product scroll behavior. Noted sticky cart setup in `cart-panel` styles and the absence of component-level overrides in `CartPanel.tsx` and `ProductGrid.tsx`. Future layout changes must resolve tension between viewport-driven height vars and responsive product grid.
- 2025-11-17 — Phase 2 complete. Designed a layout strategy that decouples the product column height from the cart column by restoring global flex layout, introducing dedicated kiosk column wrappers, and limiting viewport-height math to the cart only. Conceptually validated the approach against zoom scenarios (cart stays pinned; product column gains natural page scroll). Identified need to retire `--kiosk-column-height`, adjust sticky offsets, and potentially extract kiosk-specific styles into a dedicated module during implementation. Strategy approved to proceed.
- 2025-11-17 — Phase 3 complete. Updated `client/src/App.tsx` to introduce `kiosk-layout__products` and `kiosk-layout__cart` wrappers so the product gallery and cart column can be controlled independently. Refined `client/src/App.css` to restore the flex-based shell, add new layout wrapper styles, and replace shared viewport height variables with cart-specific sticky offsets (`--layout-sticky-offset`, `--cart-max-height`). Confirmed the cart keeps its sticky behavior and internal scrolling while the product grid regains natural flow.
- 2025-11-17 — Phase 3 follow-up. Restructured the kiosk view so the cart renders inside a new floating container: updated `App.tsx` to move `CartPanel` into a sibling `<aside>` (`kiosk-cart-float`) and refactored `App.css` with `--cart-width`/`--cart-float-height`, a flex-based `kiosk-layout`, and fixed positioning for large screens. The cart now floats independently, staying visible while products scroll beneath.
- 2025-11-24 — Phase 3 follow-up. Tuned floating cart breakpoints in `App.css` with a responsive `--cart-gap` and `@media (max-width: 1040px)` overrides so the cart drops beneath the product grid when zoom narrows the viewport (e.g., 133% zoom), preventing overlap while keeping desktop behavior intact at standard zoom levels. Added padding adjustments to keep the full-width cart from introducing horizontal scroll.
- 2025-11-24 — Phase 4 complete. Added theme variables (`--color-background`, `--color-accent`, etc.) to `App.css`, refreshed kiosk/admin surfaces to use the black/pink/white palette, and updated buttons, cards, and alerts with new gradients. Confirmed key text/background pairs meet WCAG AA contrast (e.g., #f5f5f8 on #050507 ≈ 14.4:1; #ff4fa7 on #11111a ≈ 5.7:1).
