/**
 * Pure Suite Tier graduated-bracket pricing formula — zero imports, zero DB/Supabase
 * dependency, so it can be verified standalone (see scripts/verify-suite-tier-pricing.ts)
 * without triggering Vite-only `import.meta.env` access from src/lib/supabase.ts.
 *
 * Formula (cumulative, no cliffs at bracket boundaries):
 *   S <= 2,000          => C = S * R1
 *   2,000 < S <= 5,000  => C = 2,000*R1 + (S-2,000)*R2
 *   S > 5,000            => C = 2,000*R1 + 3,000*R2 + (S-5,000)*R3
 */

export type SuiteTier = 'tier_1' | 'tier_2' | 'tier_3'

export interface SuiteTierBracketBreakdown {
  bracket_index: number
  seats_in_bracket: number
  price_per_seat: number
  subtotal: number
}

const BRACKET_1_MAX = 2000
const BRACKET_2_MAX = 5000

export function computeSuiteTierTotal(
  totalSeats: number,
  brackets: { bracket_index: number; price_per_seat: number }[]
): { total_price: number; breakdown: SuiteTierBracketBreakdown[] } {
  if (totalSeats < 0) throw new Error('totalSeats must be >= 0')

  const byIndex = new Map(brackets.map((b) => [b.bracket_index, b.price_per_seat]))
  const r1 = byIndex.get(1)
  const r2 = byIndex.get(2)
  const r3 = byIndex.get(3)
  if (r1 == null || r2 == null || r3 == null) {
    throw new Error('Suite tier is missing one or more of brackets 1/2/3')
  }

  const breakdown: SuiteTierBracketBreakdown[] = []
  let total = 0

  const seatsInBracket1 = Math.min(totalSeats, BRACKET_1_MAX)
  if (seatsInBracket1 > 0) {
    const subtotal = round2(seatsInBracket1 * r1)
    breakdown.push({ bracket_index: 1, seats_in_bracket: seatsInBracket1, price_per_seat: r1, subtotal })
    total += subtotal
  }

  if (totalSeats > BRACKET_1_MAX) {
    const seatsInBracket2 = Math.min(totalSeats, BRACKET_2_MAX) - BRACKET_1_MAX
    const subtotal = round2(seatsInBracket2 * r2)
    breakdown.push({ bracket_index: 2, seats_in_bracket: seatsInBracket2, price_per_seat: r2, subtotal })
    total += subtotal
  }

  if (totalSeats > BRACKET_2_MAX) {
    const seatsInBracket3 = totalSeats - BRACKET_2_MAX
    const subtotal = round2(seatsInBracket3 * r3)
    breakdown.push({ bracket_index: 3, seats_in_bracket: seatsInBracket3, price_per_seat: r3, subtotal })
    total += subtotal
  }

  return { total_price: round2(total), breakdown }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
