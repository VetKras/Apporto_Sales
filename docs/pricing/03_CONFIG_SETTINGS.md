# Config & Settings UI Implementation — CoTutor + ExamSpace

Part of [00_INDEX.md](./00_INDEX.md). Depends on [01_DATABASE.md](./01_DATABASE.md) and
[02_FORMULAS.md](./02_FORMULAS.md) being applied first — this file wires the new tables/formula into
the UI that reps and admins actually touch.

## `AdminConfigTab.tsx` — Settings → Admin Config

### Remove
- The `COTUTOR_MODELS` import and anything rendering the old CoTutor COGS-tier editor tied to it.

### Add — new sub-section "CoTutor Pricing Engine" (still inside the existing `prices` tab, or a new
tab alongside `prices` / `rules` / `ai` — either works, keep it next to "Product Prices & COGS" since
it's the same job for CoTutor specifically)

Two editable blocks, matching `cotutor_pricing_assumptions` exactly:

**Business Levers** (the 3 fields exec/sales leadership actually change):
- Target Gross Margin % (`target_gross_margin`) — validate 0–95%, same guard the workbook itself uses.
  Show the live-computed price at reference assumptions (10k students / gpt-5.4-mini / 4 assignments /
  9 months) next to the slider so changing margin shows its dollar effect immediately, same pattern the
  workbook's README describes ("RAISE → customer price UP").
- Active User Adoption Rate % (`active_user_adoption_rate`)
- Fixed Infrastructure $/Student/Year (`fixed_infra_per_student_year`)

**Technical Usage Assumptions** (product/eng — the 8 remaining fields): render as a plain editable
table, one row per field, pulling the same explanatory text as `BACKEND_ASSUMPTIONS` column C so
non-engineers editing this later have the same context the workbook gives (e.g. "Student Messages per
Assignment — THE biggest cost lever: more messages = more AI calls AND a longer conversation to
re-read each time"). Copy these descriptions verbatim from
[04_PRICES.md](./04_PRICES.md) — don't write new ones, the workbook's phrasing was written by whoever
owns this model and reflects real reasoning, not just a value.

Saving either block: `UPDATE cotutor_pricing_assumptions SET ... WHERE config_version_id = ?`, no new
table needed, this maps directly to the schema in 01_DATABASE.md.

### Add — "CoTutor AI Models" editor

Replace whatever currently lets someone pick from `COTUTOR_MODELS` with a table sourced from
`cotutor_ai_models`: model_id, label, provider, input/cached/output rates, default flag. Same
edit/save pattern as the existing "AI Model Costs" tab (`ai` tab, `AI_COSTS_PROVIDER` /
`updateIntegrationSetting` pattern) — except this is a real table now, not an `integration_settings`
JSON blob override. If `AI Model Costs` tab currently exists specifically to override
`COTUTOR_MODELS.inputPricePerMTok`/`outputPricePerMTok`, it becomes redundant once `cotutor_ai_models`
is the live source — remove the override tab rather than keeping two competing places to change the
same rate.

### `calcMargin()` — no changes needed

It already computes `((price - cost) / price) * 100` generically from whatever `default_price` /
`default_cost` it's given. ExamSpace's new rows populate `default_cost` for the first time (see
01_DATABASE.md) — margin display starts working correctly for ExamSpace with zero changes to this
function.

## `QuoteInputsPanel.tsx` — the deal-quoting form

### CoTutor section
- AI model dropdown: source options from `cotutor_ai_models` (loaded once per config version, same
  place `pricingModels` is already loaded in `DealWorkspace.tsx` — see 02_FORMULAS.md §7) instead of
  the deleted `COTUTOR_MODELS` array. Default selection = the row where `is_default = true`.
- Tier selector (`tier_name` dropdown: "Departmental / Premium" etc.) — **remove**. CoTutor no longer
  has discrete tiers; there's nothing to select. Replace with a read-out showing the live-computed
  `customerPricePerStudentPerYear` and `totalBlendedCogsPerStudentPerYear` from
  `calculateCoTutorPrice()`, updating as student count / assignments / model change — same
  "recalculates as you type" feel the workbook's `SALES_QUOTE` sheet has.
- `assignments_per_course` field: already exists on `SelectedProduct` — now feeds the formula directly
  (`assignments_per_month` param) instead of being informational-only. Confirm the field's current
  label/copy still makes sense given it's now load-bearing, not just descriptive.

### ExamSpace section
- Tier selector: expand from 3 options (Medium/Large/GPU) to 6 (Container/Linux/Small/Medium/Large/
  GPU), sourced from `pricing_models` the same way it already is (no new loader needed, just more rows
  come back from the existing `find()` call once 01_DATABASE.md is applied).
- `seats_per_exam_day` and `exam_days` inputs: **check before removing.** `buildProductLines()` no
  longer reads them for ExamSpace pricing (02_FORMULAS.md §5 uses `inputs.student_count` directly now,
  matching every other product). Grep the rest of this file and `StrategyPanel.tsx` /
  `ProposalTemplate.tsx` for other reads of these two fields before deleting the inputs — if nothing
  else uses them, remove; if something does (e.g. a capacity/TCO note), keep the fields but stop
  wiring them into the price calculation.

## `pricing-engine.ts` exports consumed by the UI — confirm nothing else imports the deleted symbols

Before removing `COTUTOR_MODELS`, `COTUTOR_MODEL_MAP`, `COTUTOR_DEFAULT_MODEL`, `CoTutorModelDef`,
`cotutorCogsTier`, `CoTutorCogsTier`, grep the whole `src/` tree for each name — `AdminConfigTab.tsx`
and `QuoteInputsPanel.tsx` are the two known importers from this investigation, but confirm there
isn't a third (e.g. `StrategyPanel.tsx`'s battlecard/competitive copy referencing model names for
positioning text).

## Verification checklist for this file specifically

- [ ] Change target margin in Admin Config, confirm the reference-price readout moves accordingly and
      a brand-new quote at 10k/gpt-5.4-mini/4/9 reflects it.
- [ ] Change AI model on an in-progress quote, confirm price recalculates without a page reload.
- [ ] Select each of the 6 ExamSpace tiers on a quote, confirm price and (if shown) cost/margin change
      per row, matching the numbers in [04_PRICES.md](./04_PRICES.md).
- [ ] Confirm the old CoTutor tier dropdown is gone from the quote UI, not just hidden/disabled.
