# Apporto Sales

Internal sales intelligence tool for the Apporto AI Suite. Used during customer calls to generate quotes, proposals, competitive battlecards, and strategy briefs.

## Stack

- React 18 + TypeScript + Vite
- Supabase (Postgres + Edge Functions)
- Tailwind CSS + Radix UI

## Features

- **Deals & Quotes** — pricing calculator with configurable models, discount approval tiers, bundle suggestions, and snapshot history. CoTutor is formula-driven (token-COGS ÷ target margin, not flat tiers); ExamSpace bills $/student/year across six desktop tiers (Container/Linux/Small/Medium/Large/GPU), not $/seat-day.
- **Products** — product fact management and source document ingestion
- **Competitive** — competitive matrix and battlecard generation
- **Portia** — AI deal assistant (Edge Function backed). Voice inherited from Athena (analytics), pricing discipline from Jordan Pricing, competitive discipline from Domonic Competitive. Reads live pricing assumptions/rates via `apporto_pricing_reference_query` and the team's own pipeline via `apporto_pipeline_query` (both server-scoped to the requester's real authority level, resolved from `profiles` — never trusted from the client) — never states a price or margin from memory.
- **Settings** — pricing config (Product Prices & COGS tab includes CoTutor's business levers, technical usage assumptions, and approved AI model rate table alongside the flat-rate products), Team & Authority (roster + feature access, see below), integrations, admin config (L3+)

## Auth

Demo mode — email picker dropdown + password field (any non-empty string accepted). Session stored in localStorage. Profile and access level loaded from Supabase on sign-in.

## Access Levels

L4 → L1 (most to least control). Settings' Team & Authority tab requires L3+; Admin Config requires L3+.

Feature access (Portia, Competitive, Proposal/Battlecard/Strategy generation) is a two-tier cascade, enforced server-side (not via prompting):
- **Company ceiling** — L4/`_prv` sets a feature on/off per level (1-3) for the whole company, in Settings → Team & Authority → click a level card.
- **Team restriction** — an L3 manager can further restrict (never widen) a feature for their own direct reports only, from the same level cards for levels below their own.
- A feature is enabled for a user only if the ceiling for their level allows it *and* their manager hasn't restricted it. L4/`_prv` always has everything.

Roster management lives in the same level cards: L4 can add/move/archive anyone at any level; L3 can add/move people into levels 1-3 and only edit their own direct reports. Archiving (`status = 'inactive'`) is L4-only.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL and anon key
npm run dev
```

Apply migrations in order from `supabase/migrations/` via the Supabase dashboard or CLI.

## Edge Functions

`hubspot-action` and `portia-chat` must be deployed to your Supabase project. Calls use the project anon key.

---

## AI Coworker Log

_Each AI session that touches this codebase logs what it did here. Format: Date · Model · Summary._

| Date | Model | Work Done |
|---|---|---|
| 2026-07-19 | Claude Sonnet 5 | Feature-level access control (`docs/FEATURE_ACCESS_CONTROL_PLAN.md`, phases 1-5), implemented locally. Migration 022: `feature_flags` (5 seeded rows: portia, competitive, proposal_generation, battlecard_generation, strategy_generation), `feature_level_access` (L4 company-wide ceiling per feature+level 1-3, no seed rows so default is enabled), `feature_team_restrictions` (L3 manager-scoped narrowing for their own direct reports only, keyed by `manager_profile_id` — deliberately no `enabled` column, presence alone means restricted, so the schema can't represent widening past the ceiling). Migration 023: re-points Suite Tier `pricing_brackets` off the old v1 config version onto v2 and deletes the superseded v1 `pricing_models`/`pricing_config_versions` rows (no CASCADE — fails loudly instead of silently destroying real quote history if any still reference v1). New `src/lib/featureAccess.ts` (`effectiveAccess()` pure cascade, loaders, admin write helpers), wired into `AuthContext` (`hasFeature`, `refreshFeatureAccess`). `AppLayout` nav and `DealWorkspace` mode buttons (proposal/battlecard/strategy) now gate on `hasFeature()` instead of always rendering. New `TeamAuthorityTab.tsx` replaces the old static, read-only "Team members" + "Authority levels" list in Settings with clickable/expandable level cards: roster CRUD (add/move/archive, bounded by the editor's own level and, for L3, to their own direct reports), the L4 company-ceiling grid, and the L3 "restrict for my team" grid, surfaced per level. `portia-chat` edge function's `getEffectiveFeatureAccess()` — previously a stub returning "everything enabled" — now implements the real two-tier cascade against the two tables above, matching `effectiveAccess()` client-side exactly; `resolveRequester()` already selected `supervisor_profile_id`, no change needed there. Settings' Team & Authority tab gate changed from L4-only to L3+ (L3 needs it to manage their own reports). Migrations 022/023 are local `.sql` files only — not yet applied to the live Supabase database (same manual SQL Editor process used for 021 still needs to happen before this is live). |
| 2026-07-19 | Claude Sonnet 5 | CoTutor/ExamSpace pricing rebuild + Portia rebuild — full implementation of `docs/pricing/00_INDEX.md` through `05_PORTIA_AI.md`. Migration 021: `cotutor_pricing_assumptions` and `cotutor_ai_models` tables (formula-driven CoTutor pricing, replacing flat 20/15/10 tiers and the hardcoded, partly-fabricated `COTUTOR_MODELS` catalog — 4 Claude model entries never existed in the real cost model); ExamSpace re-seeded from $/seat-day (3 tiers) to $/student/year (6 tiers: Container/Linux/Small/Medium/Large/GPU). New `calculateCoTutorPrice()` in `pricing-engine.ts`, ported cell-for-cell from `CoTutor_Pricing_Final.xlsx` and verified to the cent against the workbook's reference quote ($24.01/student/yr, $240,103.75 ACV at 10k students / gpt-5.4-mini / 4 assignments-mo / 9-month contract — target margin 82.7%, confirmed by Antony/CEO 2026-07-19). Updated `QuoteInputsPanel`, `QuoteOutputPanel`, and `AdminConfigTab` (new "CoTutor Pricing Engine" tab: business levers, technical usage assumptions, approved AI model rate table) to match. `portia-chat` edge function: fixed a real bug where `competitive_context` was built client-side but never read server-side; added `apporto_pricing_reference_query` and `apporto_pipeline_query` tools (always available, not gated behind HubSpot config); added server-side access resolution (`resolveRequester`/`canAccessDeal`) that looks up real authority level from `profiles` by `user_profile_id` rather than trusting client-sent claims, and omits deal/competitive data entirely for unauthorized requests rather than relying on a prompt instruction to withhold it; removed the now-dead single-shot streaming fast path (tool-calling requires the non-streaming provider APIs, so this path never ran once tools became always-available); rewrote the persona (voice inherited from Athena, pricing discipline from Jordan Pricing, competitive discipline from Domonic Competitive — style only, no cross-app data). Feature-level access control (`feature_flags`/`feature_level_access`/`feature_team_restrictions`) is a separate, not-yet-built plan (`docs/FEATURE_ACCESS_CONTROL_PLAN.md`); Portia's `getEffectiveFeatureAccess()` is stubbed to "everything enabled" until that migration lands. PowerGrader/TrustEd pricing untouched (still unsourced v1 placeholders, `confidence: 'low'` — Phase 2). |
| 2026-06-29 | Claude Sonnet 4.6 | Replaced Supabase Auth with demo email-picker login. Fixed broken Edge Function auth (getSession → anon key) in DealWorkspace, PortiaPanel, PortiaStandalone, and SettingsPage (4 total — all cleared). Restored password field (accepts any string). Consolidated USERS list into users.ts. Added AdminConfigTab (prices, pricing rules, AI model costs) gated at L3+. Added configurable PricingRules loaded from DB. Migrated access control to opaque DB-only role flag; removed all human-readable admin identifiers from codebase. Added migration 015. Wired product_facts into deal workspace — each selected product now shows collapsible intel (positioning, sales claims, capabilities, risks, integrations) at point of quoting. Fixed TS union type error in SettingsPage tabs. |
| 2026-06-29 | Claude Sonnet 4.6 | Migration 016: ALTER competitive_matrix — added 9 enriched columns: sales_positioning_line, escalation_status (check constraint), threat_rationale, key_overlap, pricing_intel, lms_coverage, ferpa_positioning, evidence_source, strategic_window. Migration 017: seeded 19 missing competitors and 29 fully enriched competitive_matrix rows covering all 4 products (PowerGrader ×6, CoTutor ×9, TrustEd ×5, ExamSpace ×6 + Schoolyear new June 2026 entry). Data sourced from competitive_matrix_master.csv, per-product CSVs, Domonic LEARNING_LOG, and Schoolyear Safe brief. Each row includes threat rationale, escalation status, strategic windows, and sales positioning lines. |
