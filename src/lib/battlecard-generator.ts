import { supabase } from './supabase'
import type { QuoteResult } from './pricing-engine'
import type { Database } from '@/types/database'

type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type Product = Database['public']['Tables']['products']['Row']

const TIER_ORDER: Record<string, number> = { 'tier-1': 0, 'tier-2': 1, 'tier-3': 2, 'watch': 3 }

function tierLabel(tier: string | null): string {
  switch (tier) {
    case 'tier-1': return 'Tier 1 — Primary Threat'
    case 'tier-2': return 'Tier 2 — Secondary Threat'
    case 'tier-3': return 'Tier 3 — Peripheral'
    case 'watch':  return 'Watch — Emerging'
    default:       return 'Unclassified'
  }
}

function divider(label: string): string {
  return `\n${'═'.repeat(60)}\n  ${label.toUpperCase()}\n${'═'.repeat(60)}\n`
}

function formatProductBattleCard(
  product: Product,
  competitors: Competitor[],
  matrixRows: MatrixRow[],
): string {
  const sections: string[] = []

  sections.push(divider(`Battle Card: ${product.name}`))

  sections.push(
    `PRODUCT OVERVIEW\n` +
    `${product.positioning ?? product.description ?? '—'}\n`,
  )

  if (matrixRows.length === 0) {
    sections.push('No competitive intelligence data available for this product yet.\n')
    return sections.join('\n')
  }

  const sorted = [...matrixRows].sort(
    (a, b) => (TIER_ORDER[a.threat_tier ?? ''] ?? 9) - (TIER_ORDER[b.threat_tier ?? ''] ?? 9),
  )

  for (const row of sorted) {
    const comp = competitors.find((c) => c.id === row.competitor_id)
    const compName = comp?.name ?? 'Unknown Competitor'
    const compCategory = comp?.category ?? row.category ?? ''

    sections.push(divider(`${compName}${compCategory ? ` (${compCategory})` : ''}`))

    sections.push(`Threat Level: ${tierLabel(row.threat_tier)}`)
    if (row.escalation_status && row.escalation_status !== 'stable') {
      sections.push(`Status: ${row.escalation_status.toUpperCase()}`)
    }
    sections.push('')

    if (row.competitor_strength) {
      sections.push('▸ WHAT THEY DO WELL')
      sections.push(`  ${row.competitor_strength}`)
      sections.push('')
    }

    if (row.apporto_edge) {
      sections.push('▸ APPORTO ADVANTAGE')
      sections.push(`  ${row.apporto_edge}`)
      sections.push('')
    }

    if (row.key_overlap) {
      sections.push('▸ WHERE WE OVERLAP')
      sections.push(`  ${row.key_overlap}`)
      sections.push('')
    }

    if (row.pricing_intel) {
      sections.push('▸ PRICING INTEL')
      sections.push(`  ${row.pricing_intel}`)
      sections.push('')
    }

    if (row.lms_coverage) {
      sections.push('▸ LMS / INTEGRATION COVERAGE')
      sections.push(`  ${row.lms_coverage}`)
      sections.push('')
    }

    if (row.ferpa_positioning) {
      sections.push('▸ FERPA / COMPLIANCE POSITIONING')
      sections.push(`  ${row.ferpa_positioning}`)
      sections.push('')
    }

    if (row.sales_positioning_line) {
      sections.push('▸ POSITIONING LINE (use in conversations)')
      sections.push(`  "${row.sales_positioning_line}"`)
      sections.push('')
    }

    if (row.threat_rationale) {
      sections.push('▸ WHY THIS TIER')
      sections.push(`  ${row.threat_rationale}`)
      sections.push('')
    }

    if (row.strategic_window) {
      sections.push('▸ STRATEGIC WINDOW')
      sections.push(`  ${row.strategic_window}`)
      sections.push('')
    }

    if (row.latest_notes) {
      sections.push('▸ LATEST NOTES')
      sections.push(`  ${row.latest_notes}`)
      sections.push('')
    }

    sections.push(`Confidence: ${row.confidence}  |  Last updated: ${row.freshness_date ?? '—'}`)
    if (row.evidence_source) {
      sections.push(`Source: ${row.evidence_source}`)
    }
    sections.push('')
  }

  return sections.join('\n')
}

export interface BattleCardResult {
  content: string
  productCount: number
  competitorCount: number
  hasData: boolean
}

export async function generateBattleCard(
  quoteResult: QuoteResult | null,
): Promise<BattleCardResult> {
  let productIds: string[] = []
  let productNames: string[] = []

  if (quoteResult && quoteResult.lines.length > 0) {
    productIds = quoteResult.lines.map((l) => l.product_id)
    productNames = quoteResult.lines.map((l) => l.product_name)
  }

  const [
    { data: allProducts },
    { data: competitors },
    { data: matrix },
  ] = await Promise.all([
    supabase.from('products').select('*').eq('status', 'active'),
    supabase.from('competitors').select('*').order('name'),
    supabase.from('competitive_matrix').select('*'),
  ])

  if (!allProducts || !competitors || !matrix) {
    return { content: '', productCount: 0, competitorCount: 0, hasData: false }
  }

  if (productIds.length === 0) {
    productIds = allProducts.map((p) => p.id)
    productNames = allProducts.map((p) => p.name)
  }

  const cards: string[] = []
  let totalCompetitors = 0

  for (let i = 0; i < productIds.length; i++) {
    const product = allProducts.find((p) => p.id === productIds[i])
    if (!product) continue

    const rows = matrix.filter((r) => r.product_id === productIds[i])
    totalCompetitors += rows.length

    cards.push(formatProductBattleCard(product, competitors, rows))
  }

  if (cards.length === 0 || totalCompetitors === 0) {
    return {
      content: 'No competitive intelligence data available. Add competitors on the Competitive Intelligence page to generate battle cards.',
      productCount: productIds.length,
      competitorCount: 0,
      hasData: false,
    }
  }

  const content = cards.join('\n\n' + '─'.repeat(60) + '\n\n')

  return {
    content,
    productCount: productIds.length,
    competitorCount: totalCompetitors,
    hasData: true,
  }
}
