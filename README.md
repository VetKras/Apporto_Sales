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

Demo mode — email picker login, no password. Session stored in localStorage. Profile and access level loaded from Supabase on sign-in.

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
| 2026-06-29 | Claude Sonnet 4.6 | Replaced Supabase Auth with demo email-picker login. Fixed broken Edge Function auth (getSession → anon key) in DealWorkspace, PortiaPanel, PortiaStandalone. Removed dead password field from login form. Consolidated USERS list into users.ts. Added AdminConfigTab (prices, pricing rules, AI model costs) gated at L3+. Added configurable PricingRules loaded from DB. Migrated access control to opaque DB-only role flag; removed all human-readable admin identifiers from codebase. Added migration 015. |
