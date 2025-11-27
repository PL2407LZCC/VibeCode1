# Sales Overview Enhancement Plan

## Objective
- Transform the admin "Sales Overview" card into a richer analytics hub that highlights performance trends, product insights, and operational alerts in a succinct, actionable format.
- Balance quick-glance metrics with deeper drill-down options so admins can monitor kiosk health without leaving the dashboard.

## Current Snapshot
- Data feed comes from `GET /admin/stats/sales`, returning: totals (revenue, transactions, items sold), 7-day daily buckets, 4-week weekly buckets, and top products with quantity and revenue.
- UI surfaces three KPI tiles, two horizontal bar lists, and a top-products table; charts are static with limited annotations, no comparative period indicators, and no contextual callouts.
- Sections now default to collapsed (per recent update), emphasizing the need for compact but meaningful summaries when collapsed.

## Success Criteria
- Meaningful at-a-glance KPIs that convey trend direction (up/down vs previous period).
- A collapsible summary state that still communicates key shifts (e.g., revenue change) before expanding.
- Accessible visualizations (keyboard, screen reader, color contrast) with test coverage.
- Clear pathways for future drill-down (filters, export) without overloading initial release.

## Phase 1 — Discovery & Analytics Inventory *(coding paused until this phase is complete)*
- [x] Audit existing Prisma models, repositories, and seed data to confirm which time-series or aggregation capabilities already exist.
- [ ] Interview stakeholders (user, kiosk operators) to understand which decisions they make from the dashboard (inventory planning, promotions, staffing).
- [x] Identify additional metrics desired: e.g., average order value (AOV), conversion from kiosk views to purchases, revenue by time of day, low-inventory alerts.
- [x] Document data gaps and feasibility notes (which require schema changes vs. derived on the fly).

## Phase 2 — Experience & Information Architecture
- [ ] Define the collapsed-state summary: primary KPI(s), sparkline or delta text, alert badges.
- [ ] Sketch expanded layout groupings: KPIs, trends, product leaderboard, potential anomalies/alerts.
- [ ] Choose visualization types per insight (area chart for revenue trend, donut for payment mix, stacked bars for product categories, etc.), keeping contrast and responsiveness in mind.
- [ ] Validate design direction with stakeholder, incorporating accessibility considerations (ARIA labels, text equivalents).

## Phase 3 — Data Modeling & API Updates
- [ ] Extend backend calculations to provide *(mostly complete; payment method breakdown still pending)*:
  - [x] Period-over-period deltas (e.g., vs last week/month).
  - [ ] Aggregations needed for new charts (hourly histogram, category mix, payment method breakdown if available).
    - [x] Hourly histogram (current period).
    - [x] Category mix *(new product.category field added + aggregation wired up).* 
    - [ ] Payment method breakdown *(not available in current data model).* 
  - [x] Alert triggers (e.g., products below threshold, sudden revenue dips) and recommended thresholds.
- [x] Update `GET /admin/stats/sales` (or introduce versioned endpoint) to return structured payloads with units, time ranges, and meta for client rendering.
- [x] Add tests covering new repository methods and edge cases (no sales, sparse data).

## Phase 4 — Frontend Implementation
- [x] Introduce a dedicated `SalesOverview` component with internal state for chart views and filters, keeping AdminDashboard concise.
- [x] Render enhanced KPI tiles with delta indicators, tooltips, and accessible descriptions.
- [x] Replace static lists with chart components (consider lightweight charting library or custom SVG) supporting responsive layouts and dark theme.
- [x] Surface alerts or recommendations (e.g., "Trail Mix inventory will deplete in ~3 days") with clear actions.
- [ ] Ensure collapsed summary shows headline KPI + trend and exposes keyboard toggle.

## Phase 5 — Validation & Observability
- [ ] Write unit and integration tests for the new component, including accessibility assertions (ARIA roles, keyboard toggles).
- [ ] Add Playwright scenarios validating expanded/collapsed interactions, tooltip focus, and data accuracy against mocked API responses.
- [ ] Instrument analytics/logging to capture admin interactions (e.g., chart filters used) if beneficial.
- [ ] Document release notes, data assumptions, and rollback plan.

## Backlog & Stretch Ideas
- Real-time refresh toggle or auto-refresh interval for busy kiosks.
- CSV export or link to deeper reporting environment.
- Anomaly detection badges (e.g., revenue outside expected range based on historical data).
- Inventory health integration: overlay sales velocity with stock to flag replenishment needs.
- Mobile-friendly summary cards for on-the-go monitoring.

## Next Steps
1. Schedule/complete stakeholder discovery (Phase 1) to finalize prioritized metrics.
2. Validate collapsed summary experience and design for keyboard users, then implement within AdminDashboard toggle.
3. Decide on approach for payment method breakdown data (schema change vs. placeholder messaging) and implement if feasible.
4. Evaluate need for dedicated SalesOverview tests or component-level coverage to satisfy Phase 5 requirements.
5. Plan frontend treatments for additional visualizations (e.g., drilldowns, tooltips) once remaining metrics are available.
