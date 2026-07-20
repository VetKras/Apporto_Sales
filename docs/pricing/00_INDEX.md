# Pricing & COGS Rebuild Plan — Apporto Sales App — INDEX

Status: **Ready for implementation.** This is the index — read this first, then work through the
numbered docs in this same folder in order. Each one is written as a direct implementation spec
(real SQL, real TypeScript, exact file/line targets), not prose to re-interpret.

| Doc | Covers |
|---|---|
| [01_DATABASE.md](./01_DATABASE.md) | Supabase migration — new tables, new config version, ExamSpace re-seed |
| [02_FORMULAS.md](./02_FORMULAS.md) | `pricing-engine.ts` code changes — the CoTutor formula, ExamSpace tier lookup |
| [03_CONFIG_SETTINGS.md](./03_CONFIG_SETTINGS.md) | `AdminConfigTab.tsx` / `QuoteInputsPanel.tsx` UI changes |
| [04_PRICES.md](./04_PRICES.md) | The canonical numbers themselves, with source/meaning for each |
| [05_PORTIA_AI.md](./05_PORTIA_AI.md) | `portia-chat/index.ts` — stale pricing prompt + a real bug (competitive context was never wired in) |

Apply in that order — 01 before 02 (formulas reference the new tables), 02 before 03 (UI calls the new
functions), 04 is reference data used by all of them, 05 is independent and can go anytime.

**2026-07-19 — Antony (CEO) decided the CoTutor price: $24/student/year, which is the 82.7%-margin
number.** This resolves Open Conflicts #1 and #2 below. **ExamSpace's billing-unit question (#3) was
not formally resolved but implementation proceeded anyway per direct instruction** — 01–04 implement
the per-student-annual model from the canonical workbook. If seat-day billing turns out to still be
required contractually, that's a follow-up, not a blocker on what's already written. #4
(PowerGrader/TrustEd) and #5 (Suite Tier) are still open and intentionally out of scope for this batch
— "the others I'll have it fix later, those are simpler."

## Why this exists

The pricing/COGS logic in this app (`src/lib/pricing-engine.ts`, `src/lib/suite-pricing*.ts`,
`supabase/migrations/*_pricing*.sql`) was seeded once during the initial bolt.new build and has not
been touched since. In parallel, a full pricing-intelligence rebuild happened in the AI File Indexer
UI app this sprint: canonical Excel workbooks (`CoTutor_Pricing_Final.xlsx`,
`exam_desktop_cost_v2026.xlsx`) now drive a real token-cost/COGS formula engine that's ingested into
SQLite (`pricing_sources` / `pricing_values` / `pricing_formulas`), plus a hardcoded pricing-context
erratum recording a 2026-07-08 repricing decision. This app was never connected to any of that. Every
number below was checked against the current canonical source — this is not a guess.

## Confirmed discrepancies

### CoTutor — the worst offender

| | This app (seed migration 010) | Canonical source |
|---|---|---|
| Pricing model | Flat per-tier price (`$20`/`$15`/`$10` per student/year, tiers "Departmental/Premium", "Campus/Standard", "Platform/Entry") | Formula: token COGS (validation call + chat call, cache-hit blended) × adoption rate + fixed infra, then `price = COGS / (1 − target margin)` |
| Rate | Flat tiers: 20 / 15 / 10 | **RESOLVED 2026-07-19 by Antony: $24/student/year**, from the live formula at the reference assumptions (10k students, `gpt-5.4-mini`, 4 assignments/month, 9-month contract). Not a tier lookup — supersedes the historical 80/65/50 workbook and the 2026-07-08 erratum's 30/25/20. |
| AI model catalog | 8 models, half of them **fabricated**: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-fable-5` do not appear anywhere in the CoTutor cost model. Canonical `AI_MODELS_DB` sheet is 100% OpenAI: `gpt-5.4-nano/mini/5.4`, `gpt-5.6-luna/terra/sol`, `gpt-5.5`. | See `AI_MODELS_DB` sheet in `CoTutor_Pricing_Final.xlsx` |
| Default model | `claude-haiku-4-5` (not a real option) | `gpt-5.4-mini` |
| COGS logic | Crude 4-bucket tier classifier (`standard/moderate/high/premium`) based only on input token price, no actual cost math | Full formula: `((totalInput×(1−cacheHit)/1e6)×inRate) + ((totalInput×cacheHit/1e6)×cachedRate) + (output/1e6)×outRate`, blended by adoption rate (70%), plus fixed infra ($2/student/year) |
| Target margin | Not modeled at all | **RESOLVED: 82.7%** (confirmed by Antony via the $24 decision above). The 2026-07-08 erratum's 70% is superseded — do not use it. |

### ExamSpace — different pricing *model*, not just different numbers

| | This app | Canonical source (`exam_desktop_cost_v2026.xlsx`) |
|---|---|---|
| Billing unit | `$/seat-day` (Medium $11, Large $16, GPU $23) × seats × exam days, plus flat $1,200 platform fee + $2,500 setup fee for new customers | `$/student/year` (annual, blended-cost based). Six tiers, not three: Container, Linux, Small (Windows), Medium, Large, GPU. Computed prices: Container $0.099, Linux $0.189, Small $0.489, Medium **$1.224**, Large **$2.753**, GPU **$5.543** — all per student per year. |
| Tier count | 3 (Medium/Large/GPU) | 6 (adds Container, Linux, Small) |
| Cost basis | None modeled — price is just a flat rate | Blended cost + explicit per-tier target margin (61%–75%, increasing with tier) feeding `price = cost / (1 − margin)` |

This is not a price update, it's a different SKU structure. Seat-day billing and per-student-annual
billing are not reconcilable by just changing numbers — this needs a product/GTM decision, not just an
engineering fix (see Open Decisions).

### PowerGrader

No formula-driven workbook exists yet for PowerGrader (unlike CoTutor/ExamSpace) — it's still flat
calculator CSVs (`PWG_Customer_Cost.csv`, `Customer_Cost.csv`) using GPT-4o token costs and a
monthly-platform-cost structure, not a per-student annual rate.

- This app seeds `$15/student/year` (per_student), `$120/faculty/year` (per_faculty), `$4/submission`
  (per_submission). None of these three numbers appear in any source file — they look invented for
  the initial seed, not sourced.
- The actual calculator model computes a **monthly platform cost** from assignment/quiz volume (e.g.
  2,000 students × 5 assignments/month → $6,499/month ≈ $32.50/student/year at a 10-month academic
  year), not a flat per-student rate. The per_student pricing type in this app's schema doesn't match
  how PowerGrader is actually priced.

### TrustEd

- This app seeds flat `$50/student/year` (Standalone) and `$40/student/year` (Bundle Add-on).
- Standalone canonical formula: `students × ($4 base + $0.50 video) + students × assignments/month ×
  ($0.10 storage + $0.08 analysis)`, × 10 academic months. At the reference customer size (7,200
  students) this computes to **$50.40/student/year** — coincidentally close to this app's flat number,
  but that's not a formula match, it's a coincidence at one specific input combination.
- Bundle (with CoTutor) uses **different** baseline rates ($0.08 storage / $0.05 analysis, not $0.10 /
  $0.08) plus a 20% discount on the combined subtotal — this app's flat `$40` bundle price doesn't
  reflect that formula at all, and the source CSV explicitly warns: *"Do not stack the 20% bundle
  discount on unconfirmed baseline rates."*

### Suite Tier bracket pricing (migration 020)

This is a separate, newer concept in this app only — graduated per-seat brackets for 3-product
bundles ($20/$11.67/$5 per seat at tier 1, scaling up through tier 3). I found **no equivalent** in
any canonical pricing workbook or CSV. This looks like it was designed directly in this app, not
sourced from product/finance data. Flagging it as unverified rather than wrong — it may be
intentional net-new bundle strategy, but it should be confirmed with whoever approved it before it's
treated as trustworthy alongside a rebuilt per-product engine.

## Open conflicts

1. ~~CoTutor target margin: 70% or 82.7%?~~ **RESOLVED 2026-07-19** — Antony confirmed $24/student/year,
   which is the 82.7%-margin formula output. The 2026-07-08 erratum (70% margin, $30/$25/$20 tiers) is
   superseded; the indexer app's `electron/ipc/pricing.js` erratum text should be updated to stop citing
   it as current.
2. ~~CoTutor pricing structure: flat tiers or continuous formula?~~ **RESOLVED** — continuous formula.
   $24/student/year is the reference price at the default assumption set (10k students, `gpt-5.4-mini`,
   4 assignments/month, 9-month contract); per-deal quotes still vary by those inputs through the same
   formula, same as `pricingSql.calculatePricing()` already does in the indexer app. No discrete tier
   bands for CoTutor going forward.
3. **ExamSpace billing unit: seat-day or per-student-annual?** Still open. This is a GTM/contract-structure
   decision, not a pricing-number decision — existing customer contracts may already be on seat-day
   billing.
4. **PowerGrader/TrustEd have no rebuilt formula workbook yet.** Still open. Either this app waits until
   those get the same CoTutor/ExamSpace treatment in the indexer app, or someone builds
   `PowerGrader_Pricing_Final.xlsx` / `TrustEd_Pricing_Final.xlsx` in the same shape so this plan can
   ingest them the same way.
5. **Suite Tier bracket source** — still open. Confirm who approved these rates; no source document found.

Recommend a short pricing sync with whoever owns ExamSpace/PowerGrader/TrustEd pricing (Veton/Lex) to
close #3–#5 before Phase 2/3 start. Phase 1 (CoTutor + ExamSpace ingestion) can now proceed on the
CoTutor side; ExamSpace ingestion itself isn't blocked by #3 (the workbook format is unaffected either
way) but the app's *contract terms and QuoteInputsPanel fields* for ExamSpace shouldn't be finalized
until #3 is settled.

## Target architecture

Extend the existing schema rather than forking a parallel one from the indexer app. Full reasoning in
[01_DATABASE.md](./01_DATABASE.md); summary:

```
ExamSpace → fits pricing_models as-is (flat $/student/year per tier). New rows, no new table.
CoTutor   → doesn't fit pricing_models (it's a live formula, not a flat rate). Two new small tables:
            cotutor_pricing_assumptions (business levers + technical usage assumptions)
            cotutor_ai_models (curated, approved-only model rate table — replaces hardcoded COTUTOR_MODELS)
```

`pricing-engine.ts`'s existing contract — "ALL pricing values come from the database, never
hardcoded, config_version_id preserved on every quote line" — is the right design. The problem isn't
the architecture, it's that the seeded *values* and the CoTutor/COGS *formula* were never connected to
the real cost model. This plan keeps `calculateQuote()`'s shape and swaps what feeds it (see
[02_FORMULAS.md](./02_FORMULAS.md) for the exact signature change).

## Implementation status

**CoTutor and ExamSpace: fully specified, ready to implement** — see 01–05. Both go into a single new
`pricing_config_versions` row (`v2-cotutor-formula-examspace-annual`) so this ships as one coherent,
auditable version bump, not a partial mix of old and new pricing on the same active config.

**PowerGrader, TrustEd, Suite Tier brackets: deliberately deferred**, per instruction — "the others
I'll have it fix later, those are simpler." Their known issues stay documented below so nothing gets
lost, but no new tables/formulas/docs were written for them in this pass. `pricing_models` rows for
these three are carried forward unchanged onto the new active config version (see 01_DATABASE.md) so
the app still has a complete product catalog — carrying forward stale numbers is not the same as
endorsing them; they're flagged `confidence: 'low'` in the new rows specifically so that distinction
survives in the data, not just in this doc.

## Verification (all five docs)

- [02_FORMULAS.md](./02_FORMULAS.md)'s reference-quote check: `calculateCoTutorPrice()` must reproduce
  $24.01/student/year and $240,103.75 ACV at the workbook's own example inputs, to the cent.
- [03_CONFIG_SETTINGS.md](./03_CONFIG_SETTINGS.md)'s UI checklist: margin/model changes recalculate
  live, all 6 ExamSpace tiers selectable and priced correctly, old CoTutor tier dropdown gone.
- [05_PORTIA_AI.md](./05_PORTIA_AI.md)'s checklist: competitive context actually reaches Portia's
  answers now; PowerGrader/TrustEd pricing questions get flagged as data gaps, not stated flatly.
- Have someone who didn't write this port sanity-check a handful of quotes against the canonical
  workbooks by hand before calling this done — a formula this involved deserves a second set of eyes,
  not just a passing unit test.

## Boundaries

- Don't touch `QuoteInputsPanel.tsx` / `QuoteOutputPanel.tsx` layout unless a field needs to
  change because the underlying model changed (e.g., ExamSpace moving off seat-day would need new
  inputs). Keep changes to data plumbing where possible.
- Don't invent numbers to fill Phase 2/3 gaps — flag them the same way this doc does and wait for a
  real source.
- Don't silently pick a resolution to the four open conflicts — that's Phase 0, and it's not an
  engineering call.
