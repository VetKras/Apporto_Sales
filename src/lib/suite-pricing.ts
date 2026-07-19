/**
 * Suite Tier graduated-bracket pricing — a NEW, PARALLEL quoting concept to the
 * per-product a-la-carte pricing engine in src/lib/pricing-engine.ts.
 *
 * This module does not call, modify, or depend on pricing-engine.ts, and vice versa.
 * Suite Tier pricing bills an entire product bundle against total seat count using
 * a cumulative graduated-bracket formula — it replaces nothing in the existing engine.
 *
 * The formula itself lives in suite-pricing-formula.ts (zero imports, no DB/Supabase
 * dependency) so it can be verified standalone. This file adds the DB-integrated
 * wrapper that loads bracket rates from pricing_brackets.
 *
 * Phase 1 scope: schema + calculation only. No rep-facing UI yet (see Phase 2+ notes
 * in the implementation plan). Bracket rates are never hardcoded here — always loaded
 * from pricing_brackets via getPricingBracketsForVersion().
 */

import { getPricingBracketsForVersion } from '@/lib/db'
import { computeSuiteTierTotal } from '@/lib/suite-pricing-formula'
import type { SuiteTier, SuiteTierBracketBreakdown } from '@/lib/suite-pricing-formula'

export type { SuiteTier, SuiteTierBracketBreakdown }
export { computeSuiteTierTotal }

export interface SuiteTierPriceResult {
  suite_tier: SuiteTier
  total_seats: number
  total_price: number
  breakdown: SuiteTierBracketBreakdown[]
  config_version_id: string
}

export async function calculateSuiteTierPrice(
  suiteTier: SuiteTier,
  totalSeats: number,
  configVersionId: string
): Promise<SuiteTierPriceResult> {
  const allBrackets = await getPricingBracketsForVersion(configVersionId)
  const tierBrackets = allBrackets.filter((b) => b.suite_tier === suiteTier)

  const { total_price, breakdown } = computeSuiteTierTotal(totalSeats, tierBrackets)

  return {
    suite_tier: suiteTier,
    total_seats: totalSeats,
    total_price,
    breakdown,
    config_version_id: configVersionId,
  }
}
