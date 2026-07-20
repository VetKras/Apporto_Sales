/**
 * Level-based feature access — company ceiling (L4) + team-scoped restriction (L3).
 *
 * Cascade rule: L4 sets the ceiling per (feature, level 1-3) in `feature_level_access`. L3
 * managers can further restrict a feature for their own direct reports in
 * `feature_team_restrictions` — that table has no "enabled" column, only presence/absence, so
 * there is no way to represent "grant beyond the ceiling" in its shape. Restriction only ever
 * flows downward. See docs/FEATURE_ACCESS_CONTROL_PLAN.md for the full design.
 */

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']
export type FeatureFlagRow = Tables['feature_flags']['Row']
export type FeatureLevelAccessRow = Tables['feature_level_access']['Row']
export type FeatureTeamRestrictionRow = Tables['feature_team_restrictions']['Row']

export interface FeatureAccessState {
  flags: FeatureFlagRow[]
  /** key = `${featureKey}:${authorityLevel}` */
  ceiling: Map<string, boolean>
  /** key = `${managerProfileId}:${featureKey}` */
  teamRestrictions: Set<string>
}

export const EMPTY_FEATURE_ACCESS_STATE: FeatureAccessState = {
  flags: [],
  ceiling: new Map(),
  teamRestrictions: new Set(),
}

/**
 * Loads the full ceiling table (small — 5 features × 3 levels max) plus team restrictions for
 * one specific manager (the current user's own supervisor, if any — that's the only manager
 * whose restrictions can ever apply to the current user). Admin UI screens that need to see
 * every manager's restrictions (not just the current user's own supervisor) should query
 * feature_team_restrictions directly rather than reuse this loader.
 */
export async function loadFeatureAccessState(supervisorProfileId: string | null): Promise<FeatureAccessState> {
  const [{ data: flags }, { data: ceilingRows }, teamRes] = await Promise.all([
    supabase.from('feature_flags').select('*'),
    supabase.from('feature_level_access').select('*'),
    supervisorProfileId
      ? supabase.from('feature_team_restrictions').select('*').eq('manager_profile_id', supervisorProfileId)
      : Promise.resolve({ data: [] as FeatureTeamRestrictionRow[] }),
  ])

  const ceiling = new Map<string, boolean>()
  for (const row of (ceilingRows ?? []) as FeatureLevelAccessRow[]) {
    ceiling.set(`${row.feature_key}:${row.authority_level}`, row.enabled)
  }
  const teamRestrictions = new Set<string>()
  for (const row of (teamRes.data ?? []) as FeatureTeamRestrictionRow[]) {
    teamRestrictions.add(`${row.manager_profile_id}:${row.feature_key}`)
  }
  return { flags: (flags ?? []) as FeatureFlagRow[], ceiling, teamRestrictions }
}

/** Pure cascade check — matches the server-side version in supabase/functions/portia-chat. */
export function effectiveAccess(
  featureKey: string,
  user: { authorityLevel: number; isPrv: boolean; supervisorProfileId: string | null },
  state: FeatureAccessState
): boolean {
  if (user.isPrv || user.authorityLevel >= 4) return true
  const ceilingValue = state.ceiling.get(`${featureKey}:${user.authorityLevel}`) ?? true
  if (!ceilingValue) return false
  if (user.supervisorProfileId && state.teamRestrictions.has(`${user.supervisorProfileId}:${featureKey}`)) {
    return false
  }
  return true
}

// ── Admin writes ────────────────────────────────────────────────────────────────
// Caller is responsible for checking the acting user's authority_level/_prv before calling
// these — matches this app's established client-side-enforcement pattern (see
// docs/FEATURE_ACCESS_CONTROL_PLAN.md Security note).

/** L4/_prv only. Sets the company-wide ceiling for one (feature, level) pair. */
export async function setFeatureLevelAccess(
  featureKey: string,
  authorityLevel: number,
  enabled: boolean,
  updatedBy: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('feature_level_access')
    .upsert(
      { feature_key: featureKey, authority_level: authorityLevel, enabled, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'feature_key,authority_level' }
    )
  return { error: error?.message ?? null }
}

/** L3 only, and only for their own reports. Presence = restricted; call clearTeamRestriction to lift it. */
export async function setTeamRestriction(
  managerProfileId: string,
  featureKey: string,
  updatedBy: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('feature_team_restrictions')
    .upsert(
      { manager_profile_id: managerProfileId, feature_key: featureKey, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'manager_profile_id,feature_key' }
    )
  return { error: error?.message ?? null }
}

export async function clearTeamRestriction(
  managerProfileId: string,
  featureKey: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('feature_team_restrictions')
    .delete()
    .eq('manager_profile_id', managerProfileId)
    .eq('feature_key', featureKey)
  return { error: error?.message ?? null }
}

/** Every manager's team restrictions — for the admin UI's "my team" grid across all viewers. */
export async function getTeamRestrictionsForManager(managerProfileId: string): Promise<FeatureTeamRestrictionRow[]> {
  const { data } = await supabase
    .from('feature_team_restrictions')
    .select('*')
    .eq('manager_profile_id', managerProfileId)
  return (data ?? []) as FeatureTeamRestrictionRow[]
}
