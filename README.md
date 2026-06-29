# Apporto Sales

Internal sales intelligence tool for the Apporto AI Suite. Used during customer calls to generate quotes, proposals, competitive battlecards, and strategy briefs.

## Stack

- React 18 + TypeScript + Vite
- Supabase (Postgres + Edge Functions)
- Tailwind CSS + Radix UI

## Features

- **Deals & Quotes** — pricing calculator with configurable models, discount approval tiers, bundle suggestions, and snapshot history
- **Products** — product fact management and source document ingestion
- **Competitive** — competitive matrix and battlecard generation
- **Portia** — AI deal assistant (Edge Function backed)
- **Settings** — pricing config, team authority levels, integrations, admin config (L3+)

## Auth

Demo mode — email picker dropdown + password field (any non-empty string accepted). Session stored in localStorage. Profile and access level loaded from Supabase on sign-in.

## Access Levels

L4 → L1 (most to least control). Settings requires L3+. Some tabs gate further by level.

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
| 2026-06-29 | Claude Sonnet 4.6 | Replaced Supabase Auth with demo email-picker login. Fixed broken Edge Function auth (getSession → anon key) in DealWorkspace, PortiaPanel, PortiaStandalone, and SettingsPage (4 total — all cleared). Restored password field (accepts any string). Consolidated USERS list into users.ts. Added AdminConfigTab (prices, pricing rules, AI model costs) gated at L3+. Added configurable PricingRules loaded from DB. Migrated access control to opaque DB-only role flag; removed all human-readable admin identifiers from codebase. Added migration 015. Wired product_facts into deal workspace — each selected product now shows collapsible intel (positioning, sales claims, capabilities, risks, integrations) at point of quoting. Fixed TS union type error in SettingsPage tabs. |
| 2026-06-29 | Claude Sonnet 4.6 | Migration 016: ALTER competitive_matrix — added 9 enriched columns: sales_positioning_line, escalation_status (check constraint), threat_rationale, key_overlap, pricing_intel, lms_coverage, ferpa_positioning, evidence_source, strategic_window. Migration 017: seeded 19 missing competitors and 29 fully enriched competitive_matrix rows covering all 4 products (PowerGrader ×6, CoTutor ×9, TrustEd ×5, ExamSpace ×6 + Schoolyear new June 2026 entry). Data sourced from competitive_matrix_master.csv, per-product CSVs, Domonic LEARNING_LOG, and Schoolyear Safe brief. Each row includes threat rationale, escalation status, strategic windows, and sales positioning lines. |
