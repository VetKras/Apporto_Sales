# Canonical Prices & Assumptions — CoTutor + ExamSpace

Part of [00_INDEX.md](./00_INDEX.md). This is the definitive numeric reference — every number here is
already encoded in [01_DATABASE.md](./01_DATABASE.md)'s seed data; this file exists so the *meaning* of
each number is documented in one place instead of scattered across SQL comments. If a number in
01_DATABASE.md and this file ever disagree after future edits, this file is describing what SHOULD be
true — treat a mismatch as a bug to fix, not as this file being wrong.

Source: `CoTutor_Pricing_Final.xlsx` and `exam_desktop_cost_v2026.xlsx`, both captured 2026-07-19.
CoTutor pricing decision confirmed by Antony (CEO), 2026-07-19: **$24/student/year**.

## CoTutor — Business Levers

| Field | Value | What it means / what happens if you raise it |
|---|---|---|
| Target Gross Margin | **82.7%** | The slice of every customer dollar kept as profit. At 82.7%, $1.00 of cost becomes a $5.78 price. Raise → customer price up. Hard cap 95% (guarded in schema). **This is the number Antony confirmed — do not use the old 70% figure from the 2026-07-08 erratum, it's superseded.** |
| Active User Adoption Rate | **70%** | Share of enrolled students expected to actually use CoTutor (research baseline 62%; 70% used as a safety buffer). Every enrolled student is priced; only 70% are assumed to generate AI cost. Raise → assumed AI bill up → price up. |
| Fixed Infrastructure / Student / Year | **$2.00** | Servers, DB, auth — owed even if a student never opens CoTutor. Every extra $1 here adds ~$5.80 to customer price at the current margin. |

## CoTutor — Technical Usage Assumptions

| Field | Value | Meaning |
|---|---|---|
| Student Messages per Assignment | **15** | Chat messages a typical student sends per assignment. The single biggest cost lever — more messages = more AI calls AND longer re-sent history. |
| Validation Call — Input Tokens/Message | **1,862** | Size of the safety screen run on every message (rules + student's message). No chat history included. |
| Validation Call — Output Tokens/Message | **80** | The safety screen's short pass/fail verdict. |
| Chat Call — Input Tokens/Message | **2,500** | Size of the actual tutoring request (lesson prompt + assignment + student's document) — turn-1 size, history grows on top. |
| Chat Call — Output Tokens/Message | **399** | Length of the tutor's written reply. |
| Chat History Added per Turn | **500 tokens** | How much the conversation grows each exchange; later messages re-send all of it. |
| Validation Pass Rate | **85%** | Share of messages the safety screen approves for the full (expensive) tutoring call. |
| Cache Hit Rate | **30%** | Share of repeated input billed at the model's ~90%-discounted cached rate. |

## CoTutor — AI Model Catalog (`cotutor_ai_models`)

All rates USD per 1M tokens. **This replaces the old `COTUTOR_MODELS` array — the 4 Claude entries
(`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-fable-5`) in that array never
existed in the real cost model and must not carry over.**

| model_id | Label | Input | Cached Input | Output | Default |
|---|---|---|---|---|---|
| gpt-5.4-nano | GPT-5.4 Nano | $0.20 | $0.02 | $1.25 | |
| gpt-5.4-mini | GPT-5.4 Mini | $0.75 | $0.075 | $4.50 | ✓ (matches workbook's `SALES_QUOTE!B6` default) |
| gpt-5.4 | GPT-5.4 | $2.50 | $0.25 | $15.00 | |
| gpt-5.6-luna | GPT-5.6 Luna | $1.00 | $0.10 | $6.00 | |
| gpt-5.6-terra | GPT-5.6 Terra | $2.50 | $0.25 | $15.00 | |
| gpt-5.6-sol | GPT-5.6 Sol | $5.00 | $0.50 | $30.00 | |
| gpt-5.5 | GPT-5.5 | $5.00 | $0.50 | $30.00 | |

## CoTutor — Reference Quote (validates the formula port)

At the workbook's own example inputs — **10,000 students, gpt-5.4-mini, 4 assignments/month, 9-month
(academic year) contract:**

| Step | Value |
|---|---|
| API cost / assignment | $0.0855 |
| API cost / active student / year | $3.08 |
| Blended API cost / enrolled student / year (× 70% adoption) | $2.15 |
| + Fixed infrastructure / student / year | $2.00 |
| = Total blended COGS / student / year | **$4.15** |
| ÷ (1 − 82.7%) → Customer price / student / year | **$24.01** |
| × 10,000 students → Total Annual Contract Value | **$240,103.75** |

Compare against ChatGPT Edu benchmark ($30/user/year): CoTutor undercuts by ~20% (`0.80×`) at this
reference point, while priced from real COGS rather than matched to the competitor.

If [02_FORMULAS.md](./02_FORMULAS.md)'s `calculateCoTutorPrice()` doesn't reproduce **$24.01** and
**$240,103.75** at these exact inputs, the port has a bug — fix the code, don't adjust these reference
numbers.

## ExamSpace — Tier Pricing (`pricing_models`, replaces the old 3-tier seat-day model)

Billing unit changed: **$/student/year (annual)**, not $/seat-day. See
[00_INDEX.md](./00_INDEX.md) for the open question on whether this billing-model change needs a
separate GTM/contract-terms confirmation — implemented here per the latest canonical source regardless,
since that's what was asked for.

| Tier | SKU | Blended Cost | Margin | Customer Price (annual/student) | Profit/student |
|---|---|---|---|---|---|
| Container (browser only) | EDU-ES-CTR | $0.0385 | 61% | **$0.10** | $0.060 |
| Linux | EDU-ES-LIN | $0.0662 | 65% | **$0.19** | $0.123 |
| Small (Windows) | EDU-ES-SM | $0.1466 | 70% | **$0.49** | $0.342 |
| Medium | EDU-ES-MED | $0.3672 | 70% | **$1.22** | $0.857 |
| Large | EDU-ES-LG | $0.6883 | 75% | **$2.75** | $2.065 |
| GPU (Windows) | EDU-ES-GPU | $1.3857 | 75% | **$5.54** | $4.157 |

Reference: assumes 1 total exam hour/student/year (baked into the blended cost figures above, not a
separate live input in this pass — see 02_FORMULAS.md §5 note on `seats_per_exam_day`/`exam_days`).
Respondus benchmark used for comparison: $2.00/student/year — every tier here undercuts it except GPU
(2.77×, reflecting real GPU compute cost, not a pricing mistake).

**Platform Fee ($1,200/year) and Setup Fee ($2,500 one-time), new customers only — unchanged, carried
forward as-is.** No source contradicts these; they're a separate cost/fee line from desktop compute
pricing and this workbook doesn't model them at all.

## What's explicitly NOT in this file

PowerGrader, TrustEd, and Suite Tier bracket pricing — deferred per your instruction ("the others I'll
have it fix later, those are simpler"). Their current state and known issues are still documented in
[00_INDEX.md](./00_INDEX.md)'s discrepancy tables; nothing about them changes with this batch of work.
