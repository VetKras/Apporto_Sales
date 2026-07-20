# Level-Based Feature Access Control — Plan

Status: DRAFT for review. Nothing in this doc has been implemented yet. Independent of the pricing
rebuild plan (`docs/pricing/`) except for one integration point noted in
[`pricing/05_PORTIA_AI.md`](./pricing/05_PORTIA_AI.md) Issue 4 (Portia respects the same level-feature
matrix this doc defines) — that file needs a small correction once this plan changes, noted at the
bottom.

**2026-07-19 correction — this is NOT per-user.** An earlier version of this doc designed individual
per-person overrides ("pick a level to narrow the list, then toggle a feature for one specific rep").
That's wrong. The actual model is two separate surfaces:
1. **Roster management** — a place to add/remove people and assign them a level (1–4).
2. **Level access matrix** — a place to define which features are on/off *for a level as a whole* —
   not per person. Disabling battlecard generation for Level 1 disables it for every Level 1 user by
   default, full stop.

**2026-07-19 second correction — both surfaces are cascading, not L4-only.** L3 managers get scoped
write access too, on both surfaces:
- **Roster**: L4 can add anyone at any level (1–4). L3 can add people at Level 3 or below — a new hire
  an L3 manager adds becomes that manager's direct report.
- **Feature access**: L4 sets the company-wide ceiling per level — this is the maximum any Level 1/2/3
  user can have. L3 managers can further *restrict* features for their own direct reports specifically
  (narrower than the ceiling), but can never re-enable something L4 has turned off, and can never grant
  something beyond the L4 ceiling. Restriction only flows downward — this is enforced structurally by
  the schema below (there's no "enable" state in the manager-level table, only "restrict"), not just by
  application logic that could be bypassed.

## What was asked for

Level 4 users (Antony, and other execs) need to control which features exist for levels 1–3:
- Antony wants to be able to disable Portia (the AI chat assistant) for Level 1.
- Michael wants to be able to disable battlecard/plan generation for Level 1.

Both examples are level-wide toggles, not individual-rep toggles.

## What already exists (don't rebuild this part)

- `profiles.authority_level` (1–4) — already drives nav visibility. `AppLayout.tsx`'s `NAV_ITEMS`
  filters by `level >= item.minLevel || _prv`.
- `_prv` — a hidden elevated-access escape hatch (`profiles.a43ac9` via `AuthContext`), already used
  instead of a "superadmin" role. Migration `020_suite_tier_pricing_brackets.sql` documents this as the
  pattern to reuse for future admin gating — this plan follows that precedent, not a new role.
- `SettingsPage.tsx`'s **Team & Authority** tab (gated `level >= 4 || _prv`) already lists every profile
  with name/title/department/level/status — but it's **read-only**. No add, no remove, no level change.
  This is the tab both new surfaces below extend, not a new page.
- Every RLS policy in this app so far is permissive-to-authenticated (`USING (true)`), access control
  enforced client-side by authority level. Pre-existing app characteristic — see Security note below.

## What's actually toggleable today

| Feature key | What it gates | Where |
|---|---|---|
| `portia` | Entire Portia AI chat nav section | `AppLayout.tsx` nav item `/portia` |
| `competitive` | Competitive Intelligence nav section | `AppLayout.tsx` nav item `/competitive` |
| `proposal_generation` | "Proposal" mode/tab inside a deal | `DealWorkspace.tsx` `centerMode`, rendered by `QuoteOutputPanel.tsx` |
| `battlecard_generation` | "Battlecard" mode/tab inside a deal | same `centerMode` switch, `BattlecardPanel.tsx` |
| `strategy_generation` | "Strategy" mode/tab inside a deal | same `centerMode` switch, `StrategyPanel.tsx` |

`products` nav and the core `quote` mode aren't included — nobody asked to gate the product catalog or
base quoting, and removing quoting breaks the app's primary purpose. Adding a row later is trivial —
this is a data table, not a hardcoded list.

## Surface 1 — Roster management (who's at which level)

Extend the existing read-only profile list in Settings → Team & Authority into an editable one, gated
`level >= 3 || _prv` (not `>= 4` — L3 gets scoped write access here too):

- **Add person**: name, email, title, department, authority level. Inserts into `profiles` — table
  already exists, no schema change needed. Level field behaves differently by who's adding:
  - L4 / `_prv`: level dropdown offers 1–4, `supervisor_profile_id` freely assignable (or left null for
    L4 peers).
  - L3: level dropdown offers 1–3 only (cannot create another L4). `supervisor_profile_id` is not a
    free field for L3 — it's automatically set to the L3 user's own `profile.id`. An L3-added person is
    always that manager's direct report; this is what makes the feature-restriction scoping in Surface
    2 mean anything (see below).
- **Change level**: inline level selector on each row.
  - L4 / `_prv`: can change anyone's level to anything.
  - L3: can only change the level of profiles where `supervisor_profile_id === <own id>` (their own
    reports), and only within 1–3.
- **Archive User** — L4/`_prv` only, not L3. Sets `profiles.status = 'inactive'` rather than a hard
  delete — matches the existing `status` column (`active | inactive | pending`) and preserves history
  on any deals/quotes the person created (`owner_profile_id` / `created_by` foreign keys elsewhere in
  the schema would otherwise dangle). L3 can add and edit their own reports but cannot archive them —
  that's an L4-only action, separate from the add/edit scope above.
- No new table. This is CRUD on the existing `profiles` table, scope-checked in the UI/application layer
  (matching this app's established client-side-enforcement pattern — see Security note) using
  `profile.id` / `authority_level` / `supervisor_profile_id`, all already present.

## Surface 2 — Level access matrix (what each level can do), with L3 team-scoped restriction

Two tiers: L4 sets a **ceiling** per level (company-wide max); L3 managers can **restrict further**
for their own direct reports specifically. Restriction only flows downward — an L3 manager narrowing
their team's access can never widen it past what L4 allows, and this is a schema-level guarantee, not
just a UI rule that could be bypassed by calling Supabase directly: the manager-scoped table below has
no "enabled: true" state to write, only a restriction row's presence or absence.

### Schema (new migration, `021_feature_level_access.sql`)

```sql
-- Feature catalog — defines what CAN be toggled
CREATE TABLE feature_flags (
  key text PRIMARY KEY,              -- 'portia', 'battlecard_generation', etc.
  label text NOT NULL,               -- "Portia AI Assistant"
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- L4 ceiling — one row per (feature, level) pair. Level 4 is intentionally NOT a valid authority_level
-- value here — executives always have full access, nothing to toggle for them. No row for a given
-- (feature, level) means "enabled" (matches the seed default), enforced in the access-check helper.
CREATE TABLE feature_level_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  authority_level integer NOT NULL CHECK (authority_level BETWEEN 1 AND 3),
  enabled boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES profiles(id),   -- always an L4/_prv profile — enforced at the app layer
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_key, authority_level)
);

-- L3 team-scoped restriction — presence of a row means this manager has disabled this feature for
-- their own direct reports. There is deliberately no "enabled" column: a restriction can only be
-- added (narrow) or removed (revert to the L4 ceiling) — there is no way to represent "grant beyond
-- the ceiling" in this table's shape, which is the actual enforcement of "L3 can disable more but
-- never enable something L4 disabled," not just a rule documented in application code.
CREATE TABLE feature_team_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_profile_id text NOT NULL REFERENCES profiles(id),  -- the L3 whose reports this restricts
  feature_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  updated_by text REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_profile_id, feature_key)
);
```

RLS: same permissive-to-authenticated pattern as the rest of this schema. Write scoping enforced at the
application layer: `feature_level_access` writes only from `level >= 4 || _prv` UI;
`feature_team_restrictions` writes only from `level === 3` UI, and only with
`manager_profile_id = <own profile.id>` — an L3 user can only ever write a restriction row naming
themselves as the manager, never another manager's id.

Seed `feature_flags` with the five rows above. No seed rows needed in either access table — absence
everywhere means "fully enabled," matching current (pre-this-feature) behavior exactly.

### Access-check logic (cascading, narrow-only)

```ts
function effectiveAccess(
  featureKey: string,
  user: { authorityLevel: number; isPrv: boolean; supervisorProfileId: string | null },
  ceiling: Map<string, boolean>,           // key = `${featureKey}:${authorityLevel}`, from feature_level_access
  teamRestrictions: Set<string>,           // key = `${managerProfileId}:${featureKey}`, from feature_team_restrictions
): boolean {
  if (user.isPrv || user.authorityLevel >= 4) return true;
  const ceilingValue = ceiling.get(`${featureKey}:${user.authorityLevel}`) ?? true;
  if (!ceilingValue) return false; // L4 said no — nothing below can override
  if (user.supervisorProfileId && teamRestrictions.has(`${user.supervisorProfileId}:${featureKey}`)) {
    return false; // this user's manager narrowed it further
  }
  return true;
}
```

### Access-check hook

`useFeatureAccess()` (new file `src/lib/featureAccess.ts`), loaded once in `AuthContext` alongside
`profile`:
1. On profile load, fetch `feature_level_access` (small, ~15 rows) and — if
   `profile.supervisor_profile_id` is set — the team restrictions for that one manager (`WHERE
   manager_profile_id = profile.supervisor_profile_id`, at most 5 rows).
2. `hasFeature(key)` runs `effectiveAccess()` above against the current profile.
3. Expose via context, same place `_prv` already lives.

### Wiring (unchanged from the earlier draft — only what feeds `hasFeature()` changed)

- `AppLayout.tsx`: extend `ALL_NAV_ITEMS` with an optional `featureKey`. Filter becomes
  `(level >= item.minLevel || _prv) && (!item.featureKey || hasFeature(item.featureKey))`.
- `DealWorkspace.tsx`: the `(['quote','proposal','battlecard','strategy'] as const).map(...)` button
  row filters out `proposal`/`battlecard`/`strategy` entries whose `featureKey` is disabled for the
  current user. `quote` is never gated.
- If a saved deal's `centerMode` points at a feature that's since been disabled, fall back to `'quote'`
  on load rather than rendering a blocked panel.

### Admin UI — Settings → Team & Authority

Two grids, both below the roster (Surface 1):

- **Company ceiling** (visible/writable only to `level >= 4 || _prv`): rows = the 5 features, columns =
  Level 1 / Level 2 / Level 3. One checkbox per cell, writes `feature_level_access`.
- **My team** (visible/writable to `level === 3`, and to L4/_prv for oversight but framed as read-only
  there — L4 already controls the ceiling, doesn't need a second write path into a specific manager's
  team table): rows = the 5 features, one column ("Restrict for my team"). A cell is disabled/greyed
  out if the company ceiling for the viewing manager's own level is already off (nothing to further
  restrict). Checking it inserts a `feature_team_restrictions` row; unchecking deletes it.

## Security note (be upfront about this, don't bury it)

This is UX-level gating, consistent with how `authority_level` nav filtering already works in this
app — it hides/shows UI, it does not stop a user from calling Supabase directly with the anon key and
reading/writing whatever the permissive RLS policies allow. If the actual concern is "Level 1 must not
be able to use Portia at all" (compliance-grade), this plan doesn't fully satisfy that as written — it
satisfies "Level 1 doesn't see the Portia tab in normal use," matching every other access control in
this app. **Portia's own enforcement is the one place this goes further** — see
[`pricing/05_PORTIA_AI.md`](./pricing/05_PORTIA_AI.md) Issue 4, which has the edge function look up
`feature_level_access` itself server-side (by the requester's real, server-verified authority level)
before deciding what data to hand the model, rather than trusting a client-sent flag. That's real
enforcement for the one feature (`competitive`) where Portia actually holds data a UI toggle alone
can't fully withhold. The other four features remain UI-level only. Closing this gap everywhere would
mean real Supabase Auth sessions + RLS keyed off `auth.uid()`, a materially bigger change than asked
for here.

## Correction needed in `pricing/05_PORTIA_AI.md`

That file's Issue 4 was written against the old per-user design
(`getEffectiveFeatureAccess(sb, profileId)` reading `profile_feature_overrides`). Update it to
implement the same two-tier cascade as `effectiveAccess()` above — needs the requester's
`supervisor_profile_id` too, so `resolveRequester()` there should select it alongside
`authority_level`/`a43ac9`:

```ts
// resolveRequester() in 05_PORTIA_AI.md Issue 4 — add supervisor_profile_id to the select:
const { data } = await sb.from("profiles").select("authority_level, a43ac9, supervisor_profile_id").eq("id", profileId).maybeSingle();
// ...and return it as requester.supervisorProfileId alongside authorityLevel/isPrv.

async function getEffectiveFeatureAccess(
  sb: ReturnType<typeof createClient>,
  requester: { authorityLevel: number; isPrv: boolean; supervisorProfileId: string | null },
): Promise<Record<string, boolean>> {
  const { data: flags } = await sb.from("feature_flags").select("key");
  const keys = ((flags ?? []) as { key: string }[]).map((f) => f.key);
  if (requester.isPrv || requester.authorityLevel >= 4) {
    return Object.fromEntries(keys.map((k) => [k, true]));
  }
  const { data: ceilingRows } = await sb.from("feature_level_access").select("feature_key, enabled").eq("authority_level", requester.authorityLevel);
  const ceiling = new Map((ceilingRows ?? []).map((r) => [r.feature_key, r.enabled]));
  let restricted = new Set<string>();
  if (requester.supervisorProfileId) {
    const { data: teamRows } = await sb.from("feature_team_restrictions").select("feature_key").eq("manager_profile_id", requester.supervisorProfileId);
    restricted = new Set((teamRows ?? []).map((r) => r.feature_key));
  }
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    const ceilingValue = ceiling.get(key) ?? true;
    result[key] = ceilingValue && !restricted.has(key);
  }
  return result;
}
```

Called as `getEffectiveFeatureAccess(sb, requester)` — `requester` already comes from that file's
`resolveRequester()`, just needs the one extra field selected above.

## Data fix needed (unrelated to schema, do it regardless of phase order)

`supabase/migrations/20260627180321_011_seed_profiles.sql` currently seeds Veton at
`authority_level = 3` (`'seed-veton-krasniqi'`, reporting to `'seed-antony-awaida'`). Per instruction,
this should be Level 4:

```sql
UPDATE profiles SET authority_level = 4 WHERE id = 'seed-veton-krasniqi';
```

Small follow-on question this raises, not answered here: at L4 there's no `supervisor_profile_id`
concept in this plan's model (L4 users aren't anyone's "report" for team-restriction purposes) — decide
whether to null out Veton's `supervisor_profile_id` too, or leave it set but simply unused by any L4
logic (harmless either way, since every access check in this plan short-circuits to "always true" before
ever reading `supervisor_profile_id` for an L4 user).

## Phased plan

**Phase 1** — migration (`feature_flags`, `feature_level_access`, `feature_team_restrictions`, seed 5
feature rows only), `featureAccess.ts` hook (`effectiveAccess()` cascade), wire into `AuthContext`.

**Phase 2** — `AppLayout.tsx` nav gating (`portia`, `competitive`).

**Phase 3** — `DealWorkspace.tsx` / `QuoteOutputPanel.tsx` mode gating (`proposal_generation`,
`battlecard_generation`, `strategy_generation`).

**Phase 4** — Admin UI in Settings → Team & Authority: roster CRUD scoped by level (Surface 1: L4 full,
L3 own-reports-only), company-ceiling grid (L4/_prv only), my-team-restriction grid (L3 only).

**Phase 5** — Apply the correction above to `pricing/05_PORTIA_AI.md` Issue 4 (two-tier cascade,
`supervisor_profile_id` added to `resolveRequester()`).

**Phase 6** — Verification:
- L4 disables Portia for Level 1 in the ceiling grid; confirm every Level 1 test profile loses the
  Portia nav item, Level 2/3 unaffected. Re-enable; confirm immediate recovery for all of them.
- An L3 manager restricts `battlecard_generation` for "my team"; confirm only that manager's direct
  reports lose the battlecard tab, and a different manager's Level 1 reports keep it (Michael's original
  ask, satisfied via team scoping rather than per-user overrides).
- With Portia (`competitive`) disabled at the L4 ceiling for Level 2, confirm an L3 manager's "my team"
  grid shows that checkbox already greyed out/on — there's nothing to further restrict, and no UI path
  exists to turn it back on for their team.
- L3 adds a new hire at Level 2; confirm the new profile's `supervisor_profile_id` is set to that L3
  automatically, and that L3 can subsequently edit/deactivate that profile but not an unrelated L2
  profile added by someone else.
