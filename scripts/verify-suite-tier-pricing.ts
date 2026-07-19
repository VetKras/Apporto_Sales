import { computeSuiteTierTotal } from '../src/lib/suite-pricing-formula'

const TIERS = {
  tier_1: [
    { bracket_index: 1, price_per_seat: 20.00 },
    { bracket_index: 2, price_per_seat: 11.66666667 },
    { bracket_index: 3, price_per_seat: 5.00 },
  ],
  tier_2: [
    { bracket_index: 1, price_per_seat: 30.00 },
    { bracket_index: 2, price_per_seat: 17.50 },
    { bracket_index: 3, price_per_seat: 7.50 },
  ],
  tier_3: [
    { bracket_index: 1, price_per_seat: 40.00 },
    { bracket_index: 2, price_per_seat: 23.33333333 },
    { bracket_index: 3, price_per_seat: 10.00 },
  ],
} as const

const CHECKPOINTS: { seats: number; tier: keyof typeof TIERS; expected: number }[] = [
  { seats: 2000,  tier: 'tier_1', expected: 40000 },
  { seats: 2000,  tier: 'tier_2', expected: 60000 },
  { seats: 2000,  tier: 'tier_3', expected: 80000 },
  { seats: 5000,  tier: 'tier_1', expected: 75000 },
  { seats: 5000,  tier: 'tier_2', expected: 112500 },
  { seats: 5000,  tier: 'tier_3', expected: 150000 },
  { seats: 10000, tier: 'tier_1', expected: 100000 },
  { seats: 10000, tier: 'tier_2', expected: 150000 },
  { seats: 10000, tier: 'tier_3', expected: 200000 },
]

let failures = 0

for (const cp of CHECKPOINTS) {
  const { total_price } = computeSuiteTierTotal(cp.seats, TIERS[cp.tier] as any)
  const pass = Math.abs(total_price - cp.expected) < 0.01
  console.log(pass ? 'PASS' : 'FAIL', cp.tier, 'at', cp.seats, 'seats: got', total_price, 'expected', cp.expected)
  if (!pass) failures++
}

const boundaryChecks = [
  { tier: 'tier_1' as const, before: 2000, after: 2001, maxDelta: 20 },
  { tier: 'tier_1' as const, before: 5000, after: 5001, maxDelta: 20 },
  { tier: 'tier_3' as const, before: 2000, after: 2001, maxDelta: 40 },
  { tier: 'tier_3' as const, before: 5000, after: 5001, maxDelta: 40 },
]

for (const bc of boundaryChecks) {
  const a = computeSuiteTierTotal(bc.before, TIERS[bc.tier] as any).total_price
  const b = computeSuiteTierTotal(bc.after, TIERS[bc.tier] as any).total_price
  const delta = b - a
  const pass = delta > 0 && delta <= bc.maxDelta
  console.log(pass ? 'PASS' : 'FAIL', bc.tier, 'no-cliff', bc.before, '->', bc.after, 'delta=', delta.toFixed(4))
  if (!pass) failures++
}

if (failures > 0) {
  console.error(failures, 'check(s) FAILED')
  process.exit(1)
} else {
  console.log('All Suite Tier pricing checks PASSED')
}
