/**
 * Typed database helpers for critical Apporto Sales tables.
 *
 * Why this exists: supabase-js v2 requires Relationships arrays in the Database
 * generic that the Supabase CLI generates but we cannot generate locally. Rather
 * than fight the generic, we use the untyped client and apply explicit return types
 * here. All critical tables (pricing, quote_lines, deals, profiles) go through these
 * wrappers so schema drift is caught at one boundary rather than scattered across
 * the app.
 *
 * Long-term path: run `npx supabase gen types typescript --linked` once the project
 * has a linked Supabase project to regenerate a fully-compatible Database type and
 * replace these wrappers with the generated client.
 */

import { supabase } from './supabase'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']

export type ProfileRow            = Tables['profiles']['Row']
export type AuthorityRuleRow      = Tables['authority_rules']['Row']
export type ProductRow            = Tables['products']['Row']
export type ProductFactRow        = Tables['product_facts']['Row']
export type PricingConfigRow      = Tables['pricing_config_versions']['Row']
export type PricingModelRow       = Tables['pricing_models']['Row']
export type PricingBracketRow     = Tables['pricing_brackets']['Row']
export type CoTutorPricingAssumptionsRow = Tables['cotutor_pricing_assumptions']['Row']
export type CoTutorAiModelRow     = Tables['cotutor_ai_models']['Row']
export type PowerGraderPricingAssumptionsRow = Tables['powergrader_pricing_assumptions']['Row']
export type TrustEdPricingAssumptionsRow = Tables['trusted_pricing_assumptions']['Row']
export type DealRow               = Tables['deals']['Row']
export type DealInputRow          = Tables['deal_inputs']['Row']
export type QuoteLineRow          = Tables['quote_lines']['Row']
export type QuoteLineInsert       = Tables['quote_lines']['Insert']
export type QuoteOutputRow        = Tables['quote_outputs']['Row']
export type QuoteOutputInsert     = Tables['quote_outputs']['Insert']
export type CompetitorRow         = Tables['competitors']['Row']
export type CompetitiveMatrixRow  = Tables['competitive_matrix']['Row']
export type PortiaSessionRow      = Tables['portia_sessions']['Row']
export type PortiaMessageRow      = Tables['portia_messages']['Row']
export type AiEventInsert         = Tables['ai_events']['Insert']
export type ProposedUpdateRow     = Tables['proposed_updates']['Row']
export type QuoteSnapshotRow      = Tables['quote_snapshots']['Row']
export type QuoteSnapshotInsert   = Tables['quote_snapshots']['Insert']

export async function getActivePricingConfig(): Promise<{
  version: PricingConfigRow
  models: PricingModelRow[]
} | null> {
  const { data: version, error } = await supabase
    .from('pricing_config_versions')
    .select('*')
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !version) return null

  const { data: models, error: mErr } = await supabase
    .from('pricing_models')
    .select('*')
    .eq('config_version_id', (version as PricingConfigRow).id)
    .eq('is_active', true)

  if (mErr || !models) return null

  return {
    version: version as PricingConfigRow,
    models: (models as PricingModelRow[]),
  }
}

export async function getAllPricingConfigs(): Promise<PricingConfigRow[]> {
  const { data } = await supabase
    .from('pricing_config_versions')
    .select('*')
    .order('effective_date', { ascending: false })
  return (data ?? []) as PricingConfigRow[]
}

export async function getPricingModelsForVersion(versionId: string): Promise<PricingModelRow[]> {
  const { data } = await supabase
    .from('pricing_models')
    .select('*')
    .eq('config_version_id', versionId)
    .eq('is_active', true)
  return (data ?? []) as PricingModelRow[]
}

// --- CoTutor formula-driven pricing ------------------------------------------

export async function getCoTutorPricingAssumptions(versionId: string): Promise<CoTutorPricingAssumptionsRow | null> {
  const { data, error } = await supabase
    .from('cotutor_pricing_assumptions')
    .select('*')
    .eq('config_version_id', versionId)
    .maybeSingle()
  if (error) throw error
  return data as CoTutorPricingAssumptionsRow | null
}

export async function getCoTutorAiModels(versionId: string): Promise<CoTutorAiModelRow[]> {
  const { data, error } = await supabase
    .from('cotutor_ai_models')
    .select('*')
    .eq('config_version_id', versionId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as CoTutorAiModelRow[]
}

// --- PowerGrader formula-driven pricing --------------------------------------

export async function getPowerGraderPricingAssumptions(versionId: string): Promise<PowerGraderPricingAssumptionsRow | null> {
  const { data, error } = await supabase
    .from('powergrader_pricing_assumptions')
    .select('*')
    .eq('config_version_id', versionId)
    .maybeSingle()
  if (error) throw error
  return data as PowerGraderPricingAssumptionsRow | null
}

// --- TrustEd formula-driven pricing -------------------------------------------

export async function getTrustEdPricingAssumptions(versionId: string): Promise<TrustEdPricingAssumptionsRow | null> {
  const { data, error } = await supabase
    .from('trusted_pricing_assumptions')
    .select('*')
    .eq('config_version_id', versionId)
    .maybeSingle()
  if (error) throw error
  return data as TrustEdPricingAssumptionsRow | null
}

// --- Suite Tier pricing brackets --------------------------------------------

export async function getPricingBracketsForVersion(
  versionId: string
): Promise<PricingBracketRow[]> {
  const { data } = await supabase
    .from('pricing_brackets')
    .select('*')
    .eq('config_version_id', versionId)
    .eq('is_active', true)
    .order('suite_tier', { ascending: true })
    .order('bracket_index', { ascending: true })
  return (data ?? []) as PricingBracketRow[]
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getActiveProducts(): Promise<ProductRow[]> {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'active')
    .order('name')
  return (data ?? []) as ProductRow[]
}

export async function getProductFacts(): Promise<ProductFactRow[]> {
  const { data } = await supabase
    .from('product_facts')
    .select('*')
    .order('fact_type')
  return (data ?? []) as ProductFactRow[]
}

export async function getDeals(): Promise<DealRow[]> {
  const { data } = await supabase
    .from('deals')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as DealRow[]
}

export async function createDeal(payload: {
  customer_name: string
  owner_profile_id: string | null
  status?: string
}): Promise<DealRow | null> {
  const { data, error } = await supabase
    .from('deals')
    .insert(payload)
    .select()
    .single()
  if (error || !data) return null
  return data as DealRow
}

export async function replaceQuoteLines(
  dealId: string,
  rows: QuoteLineInsert[]
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase
    .from('quote_lines')
    .delete()
    .eq('deal_id', dealId)

  if (delErr) return { error: delErr.message }
  if (rows.length === 0) return { error: null }

  const { error: insErr } = await supabase
    .from('quote_lines')
    .insert(rows)

  return { error: insErr?.message ?? null }
}

export async function getQuoteLines(dealId: string): Promise<QuoteLineRow[]> {
  const { data } = await supabase
    .from('quote_lines')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at')
  return (data ?? []) as QuoteLineRow[]
}

export async function saveQuoteSnapshot(row: QuoteSnapshotInsert): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quote_snapshots')
    .insert(row)
    .select('id')
    .single()
  return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null }
}

export async function getQuoteSnapshots(dealId: string): Promise<QuoteSnapshotRow[]> {
  const { data } = await supabase
    .from('quote_snapshots')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  return (data ?? []) as QuoteSnapshotRow[]
}

export async function deleteQuoteSnapshot(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quote_snapshots').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export type IntegrationSettingsRow = Tables['integration_settings']['Row']

export async function getIntegrationSetting(provider: string): Promise<IntegrationSettingsRow | null> {
  const { data } = await supabase
    .from('integration_settings')
    .select('*')
    .eq('provider', provider)
    .maybeSingle()
  return data ? (data as IntegrationSettingsRow) : null
}

export async function getAllIntegrationSettings(): Promise<IntegrationSettingsRow[]> {
  const { data } = await supabase
    .from('integration_settings')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as IntegrationSettingsRow[]
}

export async function upsertIntegrationSetting(
  provider: string,
  apiKey: string,
  updatedBy: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('integration_settings')
    .upsert(
      { provider, api_key: apiKey, is_active: true, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'provider' }
    )
  return { error: error?.message ?? null }
}

export async function clearIntegrationSetting(provider: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('integration_settings')
    .update({ api_key: null, is_active: false, updated_at: new Date().toISOString() })
    .eq('provider', provider)
  return { error: error?.message ?? null }
}

export async function deleteIntegrationSetting(provider: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('integration_settings')
    .delete()
    .eq('provider', provider)
  return { error: error?.message ?? null }
}

export async function insertQuoteOutput(row: QuoteOutputInsert): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quote_outputs').insert(row)
  return { error: error?.message ?? null }
}

export async function logAiEvent(event: AiEventInsert): Promise<void> {
  await supabase.from('ai_events').insert(event)
}

export async function getProfiles(): Promise<ProfileRow[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('authority_level', { ascending: false })
  return (data ?? []) as ProfileRow[]
}

export async function getProfileByEmail(email: string): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .maybeSingle()
  return data ? (data as ProfileRow) : null
}

export async function getProfileByAuthId(authUserId: string): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  return data ? (data as ProfileRow) : null
}

export async function upsertProfileAuthLink(
  profileId: string,
  authUserId: string
): Promise<void> {
  await supabase
    .from('profiles')
    .update({ auth_user_id: authUserId })
    .eq('id', profileId)
}

export async function getOrCreatePortiaSession(
  dealId: string,
  userProfileId: string | null,
  dealTitle: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('portia_sessions')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return (existing as { id: string }).id

  const { data: newSession } = await supabase
    .from('portia_sessions')
    .insert({ deal_id: dealId, user_profile_id: userProfileId, title: dealTitle, mode: 'pricing_strategist' })
    .select('id')
    .single()

  return (newSession as { id: string } | null)?.id ?? ''
}

export async function getPortiaMessages(sessionId: string): Promise<PortiaMessageRow[]> {
  const { data } = await supabase
    .from('portia_messages')
    .select('id, role, content, source_trace, created_at')
    .eq('session_id', sessionId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
  return (data ?? []) as PortiaMessageRow[]
}

export async function insertPortiaMessage(msg: {
  session_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  source_trace?: Record<string, unknown>
}): Promise<void> {
  await supabase.from('portia_messages').insert(msg)
}

export async function getCompetitors(): Promise<CompetitorRow[]> {
  const { data } = await supabase.from('competitors').select('*').order('name')
  return (data ?? []) as CompetitorRow[]
}

export async function getCompetitiveMatrix(): Promise<CompetitiveMatrixRow[]> {
  const { data } = await supabase.from('competitive_matrix').select('*')
  return (data ?? []) as CompetitiveMatrixRow[]
}
