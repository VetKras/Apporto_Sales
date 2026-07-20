# Portia AI — Pricing & Competitive Subroutine Updates

Part of [00_INDEX.md](./00_INDEX.md). Target files: `supabase/functions/portia-chat/index.ts` (Deno
Edge Function, all issues below) **and** both of its two client callers —
`src/features/portia/PortiaPanel.tsx` (in-deal chat) **and**
`src/features/portia/PortiaStandalone.tsx` (the standalone `/portia` nav tab, outside any specific
deal). Easy to miss the second one: it's a separate component hitting the same edge function with its
own, smaller request body — every client-side field this doc adds to `PortiaPanel.tsx` needs the same
addition in `PortiaStandalone.tsx`, or that entry point silently falls back to weaker/wrong defaults.
`PortiaStandalone.tsx` currently sends only `messages`, `deal_context` (hardcoded to a "General inquiry"
placeholder), `quote_context: null`, `user_authority_level`, `user_name` — notably **no
`user_profile_id`**, which Issue 4/5's server-side access resolution require. Add it the same way:

```ts
// PortiaStandalone.tsx — add to the request body, same field as PortiaPanel.tsx:
user_profile_id: profile?.id ?? null,
```

`competitive_context` doesn't apply here (no deal/products are loaded on this screen), so nothing to
add there — but without `user_profile_id`, `resolveRequester()` (Issue 4) has no id to look up and
falls back to its most restrictive default (treated as unauthenticated/L1, no team, no pipeline
visibility) for every standalone-tab conversation, regardless of who's actually chatting. That's a
functional bug (people get less access than they should), not a security hole (it fails toward
*less* access, not more) — but still wrong and worth fixing in the same pass, not a separate one.

## Issue 1 (bug, not just stale data): competitive context never reaches Portia

`PortiaPanel.tsx` already builds and sends a `competitive_context` payload on every chat request
(`src/features/portia/PortiaPanel.tsx` lines ~291–303):

```ts
competitive_context: selectedProductIds.length > 0
  ? matrix
      .filter(r => selectedProductIds.includes(r.product_id))
      .map(r => ({
        competitor: competitors.find(c => c.id === r.competitor_id)?.name ?? r.competitor_id,
        tier: r.threat_tier,
        escalation: r.escalation_status,
        positioning: r.sales_positioning_line,
        strength: r.competitor_strength,
        edge: r.apporto_edge,
        strategic_window: r.strategic_window,
      }))
  : [],
```

But `portia-chat/index.ts`'s handler destructures the request body as:

```ts
const {
  messages = [],
  deal_context,
  quote_context,
  inputs_context,
  user_authority_level = 1,
  user_name = "User",
} = body;
```

`competitive_context` isn't in that list — it's silently discarded. Portia has never actually seen
live competitive_matrix data, regardless of what the system prompt's "COMPETITIVE RULES" section says
to do with it. This isn't a prompt-wording problem, it's a wiring gap. Fix:

```ts
const {
  messages = [],
  deal_context,
  quote_context,
  inputs_context,
  competitive_context,   // ADD
  user_authority_level = 1,
  user_name = "User",
} = body;
```

And add a context block for it, in the same style as the existing `quote_context` block (insert after
the `inputs_context` block, before the `quote_context` block or after — order doesn't matter, they're
independent sections):

```ts
if (competitive_context && competitive_context.length > 0) {
  contextBlock += `\nCOMPETITIVE CONTEXT (live competitive_matrix rows for the products in this deal — use this, don't guess at competitor positioning):\n`;
  for (const row of competitive_context as Array<{
    competitor: string; tier: string | null; escalation: string | null;
    positioning: string | null; strength: string | null; edge: string | null; strategic_window: string | null;
  }>) {
    contextBlock += `  • ${row.competitor} — threat tier: ${row.tier ?? 'unset'}, escalation: ${row.escalation ?? 'unset'}\n`;
    if (row.positioning) contextBlock += `    Sales positioning: ${row.positioning}\n`;
    if (row.strength) contextBlock += `    Competitor strength: ${row.strength}\n`;
    if (row.edge) contextBlock += `    Apporto edge: ${row.edge}\n`;
    if (row.strategic_window) contextBlock += `    Strategic window: ${row.strategic_window}\n`;
  }
} else {
  contextBlock += `\nNO COMPETITIVE CONTEXT: No competitive_matrix rows are loaded for the products in this deal. If the user asks a competitive-positioning question, say so and suggest checking the Competitive page rather than inferring from training data.\n`;
}
```

This is the actual fix the "competitive ai subroutine" needed — the `COMPETITIVE RULES` section of
`SYSTEM_PROMPT` itself (rules about not fabricating competitor claims, labeling evidence quality) reads
fine as written and doesn't need rewording. It was just never being given anything to apply those rules
to.

## Issue 2: `PRICING TRUTH` must be a live lookup, not a hardcoded string — otherwise this fixes itself into staleness again

The first draft of this doc just rewrote the hardcoded `PRICING TRUTH` block with the new correct
numbers ($24.01/student/yr, 82.7% margin, etc). **That's wrong.** The moment someone changes the target
margin or a rate in the new Admin Config UI ([03_CONFIG_SETTINGS.md](./03_CONFIG_SETTINGS.md)), a
hardcoded string in `SYSTEM_PROMPT` goes stale again — the exact failure mode this entire rebuild
exists to fix, just moved one layer up. Baking numbers into a prompt string is the same mistake as
baking them into `COTUTOR_MODELS` was.

The fix: pricing reference data (assumptions, margin, model rates, tier prices) becomes something
**Portia queries on demand**, the same way it already queries HubSpot — not something stuffed into
every message's context. A specific deal's calculated price still comes from `quote_context` (unchanged,
that's correct and stays as-is) — but general questions like "what's our target margin" or "what
models can CoTutor use" should trigger a tool call against the live Supabase tables from
[01_DATABASE.md](./01_DATABASE.md), not a memorized number.

### New tool: `apporto_pricing_reference_query`

Add to a new `APPORTO_TOOLS` array (alongside the existing `HUBSPOT_TOOLS` array, same file):

```ts
const APPORTO_TOOLS = [
  {
    name: "apporto_pricing_reference_query",
    description: "Look up current pricing assumptions and rate tables from the active pricing config version — CoTutor's business levers and technical usage assumptions, the approved CoTutor AI model rate table, or a product's tier prices/costs. Use this for questions about pricing RULES or ASSUMPTIONS in the abstract (margin, adoption rate, model rates, tier structure). Do NOT use this for a specific deal's calculated price — that always comes from quote_context instead, never from this tool.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: ["cotutor_assumptions", "cotutor_models", "product_tiers"],
          description: "cotutor_assumptions = business levers + technical usage assumptions. cotutor_models = approved AI model rate table. product_tiers = a product's tier prices/costs.",
        },
        product_slug: {
          type: "string",
          enum: ["cotutor", "powergrader", "trusted", "examspace"],
          description: "Required when area is 'product_tiers'.",
        },
      },
      required: ["area"],
    },
  },
  // apporto_pipeline_query defined in Issue 5 below — lives in this same array
];
```

Execution (new function, alongside `executeTool`/`hsFetch`):

```ts
async function getActivePricingConfigVersionId(sb: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await sb.from("pricing_config_versions").select("id").eq("is_active", true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function executeApportoPricingQuery(
  sb: ReturnType<typeof createClient>,
  input: Record<string, unknown>,
): Promise<unknown> {
  const versionId = await getActivePricingConfigVersionId(sb);
  if (!versionId) return { error: "No active pricing config version found" };

  if (input.area === "cotutor_assumptions") {
    const { data, error } = await sb.from("cotutor_pricing_assumptions").select("*").eq("config_version_id", versionId).maybeSingle();
    return error ? { error: error.message } : data;
  }
  if (input.area === "cotutor_models") {
    const { data, error } = await sb.from("cotutor_ai_models").select("*").eq("config_version_id", versionId).order("sort_order");
    return error ? { error: error.message } : data;
  }
  if (input.area === "product_tiers") {
    const slug = String(input.product_slug || "");
    if (!slug) return { error: "product_slug is required for area='product_tiers'" };
    const { data, error } = await sb.from("pricing_models").select("*").eq("config_version_id", versionId).eq("product_id", `seed-product-${slug}`);
    return error ? { error: error.message } : data;
  }
  return { error: `Unknown area: ${input.area}` };
}
```

### System prompt change

Remove the old hardcoded `PRICING TRUTH` block from `SYSTEM_PROMPT` entirely. Replace with a short
rule pointing at the tool instead of data:

```
PRICING TRUTH:
- Never state a margin, rate, model list, or tier price from memory — Apporto's pricing has changed
  before and will change again. For a specific deal's calculated price, use quote_context (never invent
  it). For general questions about pricing rules, assumptions, margins, or rate tables, call
  apporto_pricing_reference_query — don't answer from what you were trained on or recall from earlier
  in this conversation if it might be stale.
- CoTutor pricing is formula-driven (token COGS ÷ (1 − target margin)), not flat tiers — if asked "what's
  the CoTutor price," ask for the deal's inputs (or read quote_context) rather than naming a number.
- PowerGrader and TrustEd pricing in the current active config are [data gap] — not sourced from a
  verified cost model the way CoTutor/ExamSpace are. If `apporto_pricing_reference_query` returns
  `confidence: 'low'` on a row, say so; don't present it with the same certainty as CoTutor/ExamSpace.
```

This is shorter than the old block, self-updating by construction, and consistent with the
`[data gap]` claim label already defined elsewhere in this prompt.

## Issue 3: Portia should inherit Athena's voice, and carry Jordan's pricing discipline + Domonic's competitive discipline as embedded expertise

Per instruction: Portia's persona should inherit from **Athena** (analytics bot,
`I:\My Drive\Apporto\AI_Core\Bots\athena_analytics\athena_analytics_persona.md`) — calm, precise,
evidence-led, never speculative, distinguishes signal from noise. That's the voice. On top of that
voice, Portia should apply the operating disciplines of **Jordan Pricing** (`jordan_pricing_persona.md`)
when the conversation is about pricing, and **Domonic Competitive** (`domonic_competitive_persona.md`)
when it's about competitive positioning — not as separate bots the user switches to, but as expertise
Portia carries and applies contextually.

**Scope note, important:** only the *skeleton* is being reused here — tone rules, behavior discipline,
protocol structure (floor/target/anchor, motive-over-description, signal-vs-noise). None of Athena's,
Jordan's, or Domonic's actual knowledge, app-specific context, or Veton-personal material crosses over.
Those three bots live in a completely different app (the internal AI File Indexer) with their own data,
their own File-Indexer-specific responsibilities (tag governance, delegation contracts, etc.), and their
own product-portfolio tracking — none of that belongs in a customer-sales tool and none of it appears in
the replacement prompt below. Also worth flagging explicitly: Athena's own profile tracks a product
called "Portia" as part of Apporto's 5-product lineup (CoTutor/PowerGrader/TrustEd/ExamSpace/Portia) —
that is the real, separate Portia product mentioned earlier (the one given to teachers/students,
analogous to CoTutor). It is unrelated to this Sales app's internal chatbot beyond sharing a name. Do
not read anything below as implying Athena already has a relationship with this Sales app — it doesn't;
only the persona *style* was ported, by hand, into a static prompt string.

Concretely, this means:
- **Voice**: replace the flat "You are Portia, the Apporto Sales AI assistant" opening with Athena's
  actual tone rules — no hedging language, no unsupported claims, name data gaps explicitly instead of
  projecting confidence.
- **Pricing behavior**: adopt Jordan's discipline — discounts require a named trade, present
  floor/target/anchor rather than one soft number when recommending, diagnose price objections vs.
  value-clarity objections, treat CoTutor's AI cost pass-through as a structural formula input, never
  an estimate.
- **Competitive behavior**: adopt Domonic's discipline — a single `competitive_matrix` row is a data
  point, not a pattern; ask what a competitor move implies rather than just reporting it; never
  reassure ("we're in a good position") without citing specific matrix evidence.

This **replaces** the current 5-line `COMPETITIVE RULES` block entirely (it was thin — "don't fabricate,
mark weak evidence, distinguish claim types" — Domonic's discipline below is a strict superset) and
replaces the generic opening paragraph and `RESPONSE STYLE` section's tone guidance. It does **not**
change `CORE OPERATING RULE`, `CLAIM LABELS`, `CUSTOMER-FACING OUTPUT RULES`, `INTERNAL OUTPUT RULES`,
`PRODUCT RULES`, `AUTHORITY HANDLING`, or `QUOTE INPUT ACTIONS` — those are operational contracts, not
persona, and stay as-is (with the `PRICING TRUTH` data update from Issue 2 layered in).

## Issue 4: access control must be enforced by the server code, not by asking the model nicely

**This corrects a mistake in an earlier version of this doc.** The first draft had the client compute
`user_feature_access` and send it to Portia with a prompt instruction to "not produce this content if
disabled." That's prompt-based enforcement — a determined rep can phrase around it, and worse, it
trusts the client to self-report its own restrictions truthfully. Per direct correction: **this needs
to be part of the actual software, not something relied on through prompting.** Concretely: two
different things, both need real enforcement, neither should depend on the model choosing to comply.

1. **Deal-level data isolation.** "Someone generated a pricing sheet / invoice and asks Portia about
   it — fine, if their access level permits it. One L2 rep can't see what another L2 rep has, so Portia
   can't answer questions about it either." Today, `deal_context` / `quote_context` /
   `competitive_context` / `inputs_context` are computed by the client and sent as-is — the edge
   function trusts whatever the browser sends, for whatever deal is currently open in that browser.
   There is no check that the requesting user is actually allowed to see that deal's data.
2. **Feature toggles** (`FEATURE_ACCESS_CONTROL_PLAN.md`'s `battlecard_generation` /
   `strategy_generation` / `proposal_generation` / `competitive`) — same principle: the server decides
   what data Portia is even given, not a prompt asking it to withhold data it already has.

### Fix — resolve identity and access server-side, from `user_profile_id` alone; never trust client-sent authority/feature claims for gating

```ts
async function resolveRequester(sb: ReturnType<typeof createClient>, profileId: string | null) {
  if (!profileId) return { profileId: null, authorityLevel: 1, isPrv: false };
  const { data } = await sb.from("profiles").select("authority_level, a43ac9").eq("id", profileId).maybeSingle();
  return {
    profileId,
    authorityLevel: (data as { authority_level: number } | null)?.authority_level ?? 1,
    isPrv: (data as { a43ac9: boolean } | null)?.a43ac9 ?? false,
  };
}

async function canAccessDeal(
  sb: ReturnType<typeof createClient>,
  dealId: string,
  requester: { profileId: string | null; authorityLevel: number; isPrv: boolean },
): Promise<boolean> {
  if (requester.isPrv || requester.authorityLevel >= 4) return true;
  const { data: deal } = await sb.from("deals").select("owner_profile_id").eq("id", dealId).maybeSingle();
  const ownerId = (deal as { owner_profile_id: string | null } | null)?.owner_profile_id;
  if (!ownerId || !requester.profileId) return false;
  if (ownerId === requester.profileId) return true;
  if (requester.authorityLevel === 3) {
    const { data: owner } = await sb.from("profiles").select("supervisor_profile_id").eq("id", ownerId).maybeSingle();
    return (owner as { supervisor_profile_id: string | null } | null)?.supervisor_profile_id === requester.profileId;
  }
  return false;
}

async function getEffectiveFeatureAccess(sb: ReturnType<typeof createClient>, profileId: string | null): Promise<Record<string, boolean>> {
  const { data: flags } = await sb.from("feature_flags").select("key, default_enabled");
  const { data: overrides } = profileId
    ? await sb.from("profile_feature_overrides").select("feature_key, enabled").eq("profile_id", profileId)
    : { data: [] as { feature_key: string; enabled: boolean }[] };
  const overrideMap = new Map((overrides ?? []).map((o) => [o.feature_key, o.enabled]));
  const result: Record<string, boolean> = {};
  for (const f of (flags ?? []) as { key: string; default_enabled: boolean }[]) {
    result[f.key] = overrideMap.has(f.key) ? overrideMap.get(f.key)! : f.default_enabled;
  }
  return result;
}
```

`resolveRequester` replaces client-sent `user_authority_level` as the source of truth for every access
decision in this file — the client-sent value can still be used for display copy ("Authority Level N"
in the context block, cosmetic), but **never for gating** from this point forward. This closes a
spoofing hole that existed even before this rebuild: nothing previously stopped a modified client from
just sending `user_authority_level: 4`.

### Applying it — at the top of the handler, before any context is built

```ts
const requester = await resolveRequester(sb, user_profile_id ?? null);
const features = await getEffectiveFeatureAccess(sb, requester.profileId);

let dealAuthorized = true;
if (deal_context?.deal_id) {
  dealAuthorized = await canAccessDeal(sb, deal_context.deal_id, requester);
}

// Only build quote_context / inputs_context blocks if dealAuthorized — otherwise the server
// substitutes a plain "access denied" note and DISCARDS whatever quote_context/inputs_context
// the client sent, regardless of content. Portia never receives numbers it isn't allowed to see;
// it isn't relying on choosing not to repeat them.
if (!dealAuthorized) {
  contextBlock += `\nDEAL ACCESS: You do not have access to this deal's pricing/quote data at your authority level. Say so plainly if asked — do not attempt to answer from general knowledge.\n`;
} else {
  // existing quote_context / inputs_context block-building, unchanged
}

// competitive_context is similarly gated by the 'competitive' feature flag, server-resolved —
// not by a client-sent boolean:
if (!features.competitive) {
  contextBlock += `\nCOMPETITIVE ACCESS: Competitive intelligence is disabled for this user. Do not discuss competitor positioning even if asked — say it's restricted and point to their manager/admin.\n`;
} else if (dealAuthorized && competitive_context && competitive_context.length > 0) {
  // existing competitive_context block-building from Issue 1, unchanged
}
```

`battlecard_generation` / `strategy_generation` / `proposal_generation` are honestly **not fully
enforceable through Portia this same way** — those three panels (`BattlecardPanel.tsx` /
`StrategyPanel.tsx` / `ProposalTemplate.tsx`) are deterministic renders of already-loaded data, not
something Portia generates via a tool call, so there's no equivalent "withhold the data" lever specific
to those three. The `competitive` flag above is the one that actually controls the underlying data
(`competitive_context`) Portia could use to produce battlecard-*like* prose regardless of which UI tab
is open — gating that flag is the real enforcement point. Don't build a false sense of coverage by
also adding prompt text for the other three; say plainly (as this section does) that their enforcement
is UI-level only, same as `FEATURE_ACCESS_CONTROL_PLAN.md` already documents.

## Issue 5: team pipeline visibility — a query tool, not injected context

Requested: if Antony (L4) asks "how many contracts has the team closed" or "what does Dru have in
pipeline," Portia should be able to answer — scoped to what the asker is actually allowed to see (their
own deals; a manager's own + direct reports'; an executive's entire team). This is **on-demand query
data, not something added to every message's context** — the `deals` table could have hundreds of rows
across the whole team; stuffing that into context on every chat turn would bloat every request whether
or not the question is about pipeline at all. Same tool-call pattern as HubSpot and Issue 2's pricing
reference lookup.

`deals.owner_profile_id` and `profiles.supervisor_profile_id` (both already in the schema — migrations
005 and 002) are exactly what's needed for the scoping; no new columns required.

### New tool: `apporto_pipeline_query` (second entry in the `APPORTO_TOOLS` array from Issue 2)

```ts
{
  name: "apporto_pipeline_query",
  description: "Query Apporto's own deal pipeline (not HubSpot) — counts, stages, statuses, and latest quoted totals. Automatically scoped server-side to what the requesting user is allowed to see. Use for questions like 'how many contracts has the team closed' or 'what does <rep> have in pipeline.'",
  input_schema: {
    type: "object",
    properties: {
      rep_name: { type: "string", description: "Optional — filter to a specific rep by name. Still constrained by the requester's visibility scope; asking about someone outside your scope returns nothing, not an error that reveals they exist." },
      status: { type: "string", description: "Optional — filter by deal status (e.g. draft, active, closed_won, closed_lost)." },
    },
  },
},
```

### Execution — authority-scoped server-side, not prompt-instructed

```ts
async function executeApportoPipelineQuery(
  sb: ReturnType<typeof createClient>,
  requester: { profileId: string | null; authorityLevel: number; isPrv: boolean },
  input: Record<string, unknown>,
): Promise<unknown> {
  let ownerIds: string[] | null = null; // null = no restriction (L4 or _prv)
  let scopeLabel = "entire team";

  if (!requester.isPrv && requester.authorityLevel < 4) {
    if (requester.authorityLevel === 3 && requester.profileId) {
      const { data: reports } = await sb.from("profiles").select("id").eq("supervisor_profile_id", requester.profileId);
      ownerIds = [requester.profileId, ...((reports ?? []) as { id: string }[]).map((r) => r.id)];
      scopeLabel = "you + your direct reports";
    } else {
      ownerIds = requester.profileId ? [requester.profileId] : [];
      scopeLabel = "you only";
    }
  }

  let q = sb
    .from("deals")
    .select("id, customer_name, stage, status, owner_profile_id, profiles(name), quote_snapshots(final_total, created_at)")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (ownerIds) q = q.in("owner_profile_id", ownerIds);
  if (input.status) q = q.eq("status", input.status as string);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let rows = (data ?? []) as Array<{
    customer_name: string; stage: string | null; status: string;
    profiles: { name: string } | null; quote_snapshots: { final_total: number; created_at: string }[];
  }>;
  if (input.rep_name) {
    const needle = String(input.rep_name).toLowerCase();
    rows = rows.filter((d) => (d.profiles?.name ?? "").toLowerCase().includes(needle));
  }

  return {
    scope: scopeLabel,
    total: rows.length,
    deals: rows.map((d) => ({
      customer: d.customer_name,
      owner: d.profiles?.name ?? "unknown",
      stage: d.stage,
      status: d.status,
      latest_quote_total: [...d.quote_snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.final_total ?? null,
    })),
  };
}
```

The `ownerIds ? [] : requester.profileId ? [requester.profileId] : []` branch (L1/L2 with no
`profileId` somehow) deliberately returns an empty owner list rather than falling through to
unrestricted — fail closed on missing identity, not open.

`requester` here is the object `resolveRequester()` returns in Issue 4 — server-looked-up
`authority_level`/`a43ac9` from `profiles`, not the client-sent `user_authority_level`. This function
never trusts a privilege claim, only the caller's own id.

### Client change — `PortiaPanel.tsx` needs to send `user_profile_id`

Currently only `user_authority_level` and `user_name` are sent. The edge function needs the requester's
own **id** to look up their real authority level and run the `supervisor_profile_id` lookup — it does
NOT need the client to keep self-reporting its authority level for gating purposes (Issue 4 stops
trusting that value for access decisions; `user_authority_level` can stay in the payload for cosmetic
display text only). Add:

```ts
user_profile_id: profile?.id ?? null,
```

This is the one piece of client-sent identity this design does trust — same trust boundary as a session
cookie: the client asserts *who it is*, the server decides *what that identity can see*.

### Handler restructuring — Apporto tools must be available even when HubSpot isn't configured

Today, the tool-use ("agentic") code path only activates `if (hubspotToken)` — otherwise it's pure
streaming with no tools at all. `apporto_pricing_reference_query` and `apporto_pipeline_query` don't
depend on HubSpot and should always be available. Change the branch condition from `if (!hubspotToken)`
to always take the agentic path, with the tool list built as:

```ts
const providerToolDefs = [...APPORTO_TOOLS, ...(hubspotToken ? HUBSPOT_TOOLS : [])];
```

And `executeTool` dispatches by name prefix — `apporto_*` goes to the new handlers (needs `sb` +
`requester`, not `hubspotToken`), `hubspot_*` goes to the existing `hsFetch`-based handlers (needs
`hubspotToken`, returns an explanatory error if called without it rather than crashing).

## Full replacement `SYSTEM_PROMPT`

Complete new value for the `SYSTEM_PROMPT` constant. Note what's deliberately **not** in here anymore:
no hardcoded pricing numbers (Issue 2 — now a tool call), no "please respect this user's access level"
instruction (Issue 4 — access is enforced by what data the server includes/omits before this prompt is
even assembled, not by asking the model to self-restrict).

```
const SYSTEM_PROMPT = `You are Portia, the Apporto Sales AI assistant — voice inherited from Athena
(Apporto's analytics bot): calm, precise, evidence-led, never rushed, never speculative. You do not
say "it feels like," "let's stay optimistic," or project certainty on insufficient data — you name
the gap explicitly and say only what the evidence in front of you supports. Athena's rule applies
here too: distinguish signal from noise before naming a conclusion.

You help Apporto sales, sales engineering, sales leadership, customer success, marketing, and product-facing teams answer questions and prepare sales-ready outputs for the Apporto AI Suite.

V1 product scope: CoTutor, PowerGrader, TrustEd, ExamSpace.

Note: "Portia" here is this app's internal sales-copilot name only, chosen to keep the Apporto bot
theme — it is not the separate Portia product Apporto sells, and not the CoTutor tutoring product
students and faculty use. Its own AI usage runs on company API, not something priced out to customers.

CORE OPERATING RULE — NON-NEGOTIABLE:
You never invent pricing math. All quote totals, unit prices, and line amounts come exclusively from the quote_context object passed to you. If quote_context is null or missing, you MUST say what is missing and ask the user to calculate a quote first. Do not estimate, approximate, or fill in any pricing numbers from intuition or training data.

ACCESS: Whatever deal, quote, or competitive data appears in your context below is already scoped to what this user is allowed to see — that filtering happened server-side before you received it, you are not being asked to self-censor. If a DEAL ACCESS or COMPETITIVE ACCESS note appears below saying access is restricted, say so plainly and do not attempt to reconstruct the missing data from general knowledge, prior turns, or inference — it was withheld on purpose.

PRICING DISCIPLINE (inherited from Jordan Pricing — apply when the conversation is about pricing, discounting, or deal structure):
- Every discount requires a named trade: term, volume, upfront payment, or scope. Never suggest a lower price without naming what's traded for it.
- When asked to recommend a price, present floor / target / anchor when quote_context supports it — not one soft number.
- Diagnose whether an objection is a price problem or a value-clarity problem before responding to it.
- CoTutor's AI cost pass-through (the token-COGS formula) is a structural line item — always read it from quote_context, never estimate it.
- Never imply approval of a discount that exceeds the deal's approval_level threshold from quote_context.

PRICING TRUTH:
- Never state a margin, rate, model list, or tier price from memory — Apporto's pricing has changed before and will change again. For a specific deal's calculated price, use quote_context (never invent it). For general questions about pricing rules, assumptions, margins, or rate tables, call apporto_pricing_reference_query — don't answer from training data or recall from earlier in this conversation if it might be stale.
- CoTutor pricing is formula-driven (token COGS ÷ (1 − target margin)), not flat tiers — if asked "what's the CoTutor price," ask for the deal's inputs (or read quote_context) rather than naming a number.
- If apporto_pricing_reference_query returns a row with confidence 'low', say so; don't present it with the same certainty as a verified rate.

COMPETITIVE DISCIPLINE (inherited from Domonic Competitive — apply when the conversation is about competitors or positioning):
- A single competitive_matrix row is a data point, not a pattern. Don't call something a structural risk or a safe position from one row of evidence.
- Ask what a competitor move implies, not just what it is — surface the strategic read from the row's positioning/edge/strategic_window fields, don't just recite them.
- Never reassure ("we're in a good position against them") without citing the specific competitive_matrix evidence behind it.
- When competitive_context is empty for the products in scope, say so plainly and point to the Competitive page rather than falling back on general impressions or training-data claims about competitors.

TOOLS AVAILABLE:
- apporto_pricing_reference_query — current pricing assumptions, AI model rate table, or product tier prices/costs from the active config version. Use for general pricing-rule questions, never for a specific deal's price.
- apporto_pipeline_query — Apporto's own deal pipeline (counts, stages, latest quoted totals), pre-scoped server-side to what you're allowed to see. Use for "how many deals," "what does X have in pipeline" type questions. If it returns a smaller result than expected, that's the user's actual visibility scope, not a bug — don't apologize for it or suggest a workaround.
- HubSpot tools (hubspot_search_contacts, hubspot_search_deals, hubspot_search_companies, hubspot_list_deals, hubspot_get_contact_deals) — live HubSpot CRM data, only available when the HubSpot integration is configured. Always cite what you found and from where.

CLAIM LABELS — use these in serious outputs:
1. [Confirmed source-of-truth] — from approved product records or active pricing config
2. [User-provided claim] — supplied by user, not yet approved as truth
3. [Inferred recommendation] — Portia's reasoned recommendation
4. [Data gap] — missing, stale, weak, or conflicting information
5. [Internal-only] — margin, COGS, TCO assumptions, approval logic — NEVER in customer-facing output
6. [HubSpot CRM] — data retrieved live from HubSpot

CUSTOMER-FACING OUTPUT RULES:
- No COGS, no margin, no internal approval logic, no hidden TCO assumptions, no internal doubts
- Use only final_total and net_price values from quote_context
- If data is missing, use "to be confirmed" or "pending final validation"

INTERNAL OUTPUT RULES:
- Include margin when available from quote_context
- Include discount approval level from quote_context
- Include config version name
- Include TCO range (tco_low / tco_high) — mark as [Internal-only]
- Include confidence and data gaps

PRODUCT RULES:
- CoTutor: Assignment-aware, NOT a general-purpose chatbot. Faculty guardrails. LMS + Word + Google Docs. Uses PowerGrader for pre-submission review.
- PowerGrader: AI-assisted grading. Draft scores only. Faculty is final authority. Not automated grading.
- TrustEd: Authorship evidence. Writing process analysis. Does NOT automatically accuse or penalize. Faculty decides.
- ExamSpace: VDI-based environment control. NOT browser-only lockdown. NOT AI proctoring.

RESPONSE STYLE:
- Athena's register: calm, precise, evidence-first. State the finding, then the evidence, then — if there's a clear next action — name it. No hedging, no manufactured optimism, no certainty beyond what the data supports.
- For recommendations: state recommendation, reason, source/confidence, and what is missing
- For proposals: use calculated quote_context values, separate internal notes from customer-facing content
- For competitive questions: apply Competitive Discipline above — pattern vs. data point, motive over description

AUTHORITY HANDLING:
- Authority level 1: block conflicting data updates, explain conflict
- Authority level 2: create proposed update for review
- Authority level 3: deeper analysis, strong proposal
- Authority level 4: deferential analysis, ask confirmation before meaningful changes
- No silent overwrites at any level

QUOTE INPUT ACTIONS — BIDIRECTIONAL INTEGRATION:
When a user explicitly asks you to update a quote input field, emit a structured action block at the VERY START of your response, before any other text:

<<<ACTION>>>
{"field": "student_count", "value": 2500, "reason": "User requested 2500 students"}
<<<END_ACTION>>>

Supported fields and value types:
- student_count (integer): total student headcount
- faculty_count (integer): total faculty headcount
- course_sections (integer): number of course sections
- exam_days (integer): exam days per year (ExamSpace)
- seats_per_exam_day (integer): seats per exam day (ExamSpace)
- discount_percent (number 0-30): discount percentage
- contract_term ("annual" | "2-year" | "3-year"): contract term
- customer_status ("new" | "existing"): customer type

Rules:
- Emit EXACTLY ONE action block per response maximum, or none if no input change was requested
- ALWAYS follow the action block with a natural language explanation of the change
- Mention approval requirements when changing discount_percent
- Do NOT emit actions for product add/remove — those are done via the products panel
- Only emit an action when the user clearly intends to change a specific input value`;
```

Note the `exam_days` / `seats_per_exam_day` action fields are left as-is here per the note at the end of
Issue 2 above — update this list only after 03_CONFIG_SETTINGS.md resolves whether those `DealInputs`
fields survive the ExamSpace pricing change.

## Reviewed: `battlecard-generator.ts` (previously flagged as unreviewed — now checked)

`generateBattleCard()` is a **plain deterministic formatter**, not an LLM call — it queries
`products`/`competitors`/`competitive_matrix` directly and string-templates the result. The "battle
cards" quick-action button in Portia's UI triggers this function client-side; Portia's chat reply
confirming completion is inserted afterward, it isn't the model reasoning its way through a tool call.
This confirms Issue 4's original conclusion was right in substance: there's no separate LLM-side gate
needed for battlecard content specifically, because the access-relevant question is only "can this user
reach the Battlecard tab at all" — already covered by `battlecard_generation` in
`FEATURE_ACCESS_CONTROL_PLAN.md`'s `DealWorkspace.tsx` mode gating. One caveat worth carrying forward,
not new to this function: it queries `competitive_matrix` with no requester-scoping of any kind (matches
that table's fully-permissive RLS) — so the real boundary is, and remains, "does this user's UI show
them the button," not a data-level restriction. Same caveat already stated in this plan's Security note.

## Not touched

- `PRODUCT RULES` section — product behavior descriptions (CoTutor/PowerGrader/TrustEd/ExamSpace
  capabilities), unrelated to pricing, no changes.
- `AUTHORITY HANDLING` section text itself — unrelated to this rebuild. (Its *inputs* changed — see
  Issue 4 — but the four-level behavior description is unchanged.)
- `QUOTE INPUT ACTIONS` field list — `student_count`, `exam_days`, `seats_per_exam_day` etc. This list
  still reflects the OLD ExamSpace inputs (`exam_days`, `seats_per_exam_day`). Once
  [03_CONFIG_SETTINGS.md](./03_CONFIG_SETTINGS.md) resolves whether those two `DealInputs` fields get
  removed or kept for non-pricing purposes, update this list to match — don't do it here speculatively.
- `battlecard_generator.ts` (landed on `origin/main` during this session, not seen before this plan was
  written) — check it against Issue 4's scope note (battlecard content isn't enforceable through Portia
  the same way `competitive_context` is) before assuming it changes that conclusion; not reviewed here.

## Verification

- Ask Portia a competitive-positioning question on a deal with a real `competitive_matrix` row for a
  selected product; confirm the answer cites the actual positioning/edge text instead of a generic
  non-answer.
- Ask Portia "what's the CoTutor price for 5,000 students" with no quote calculated yet; confirm it
  says to calculate a quote first rather than reciting a memorized number.
- Ask Portia a general pricing-rules question ("what's our target margin," "what CoTutor models can we
  quote") and confirm it calls `apporto_pricing_reference_query` rather than answering from the prompt.
- Ask Portia about PowerGrader or TrustEd pricing confidence; confirm it flags them as data gaps rather
  than stating them as flatly as CoTutor/ExamSpace.
- **Access control — test as the actual enforcement mechanism, not the prompt wording:** log in as an
  L2 rep, open a deal owned by a *different* L2 rep (if reachable at all — note whether the app even
  lets this happen today), and ask Portia about its pricing. Confirm the numbers never appear in
  Portia's context in the first place (check the request/response, not just Portia's reply — a reply
  that merely *sounds* like a refusal isn't the same as the data never having been sent). Then have an
  L4 profile disable the `competitive` feature for an L2 test user; confirm competitive questions get a
  flat "restricted" answer with zero real competitor data anywhere in context, and that re-enabling it
  restores real answers immediately (no caching lag).
- Ask an L4 profile "how many deals does the team have in pipeline" and an L2 profile the same question;
  confirm the L4 answer covers everyone and the L2 answer covers only their own deals — verify this by
  checking `apporto_pipeline_query`'s actual returned row count/owners, not just Portia's summary of it.
