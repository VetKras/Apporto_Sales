import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Lock, Info, ChevronDown, Database, ClipboardPaste, Check, X, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'
import type { QuoteResult, DealInputs } from '@/lib/pricing-engine'
import {
  SECTION_LABELS,
  PROPOSAL_SECTION_KEYS,
  generateProposalSections,
  type ProposalSections,
  type ProposalSectionKey,
} from '@/features/deals/ProposalTemplate'
import { generateBattleCard } from '@/lib/battlecard-generator'
import type { Database as DB } from '@/types/database'

type Profile = DB['public']['Tables']['profiles']['Row']
type Deal = DB['public']['Tables']['deals']['Row']

interface SourceTrace {
  config_version_id?: string
  config_version_name?: string
  has_quote?: boolean
  user_authority_level?: number
  generated_at?: string
  hubspot_tools_used?: string[]
}

interface ToolEvent {
  type: 'tool_call' | 'tool_result'
  name: string
  label?: string
  found?: number
}

export interface QuoteAction {
  field: 'student_count' | 'faculty_count' | 'course_sections' | 'discount_percent' |
         'exam_days' | 'seats_per_exam_day' | 'contract_term' | 'customer_status'
  value: number | string
  reason: string
}

interface PendingAction {
  action: QuoteAction
  status: 'pending' | 'applied' | 'dismissed' | 'blocked'
  blocked_reason?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  source_trace?: SourceTrace
  toolEvents?: ToolEvent[]
  pendingAction?: PendingAction
}

interface Props {
  deal: Deal
  quoteResult: QuoteResult | null
  profile: Profile | null
  centerMode: 'quote' | 'proposal' | 'battlecard' | 'strategy'
  proposalSections: ProposalSections
  onProposalSectionChange: (key: ProposalSectionKey, value: string) => void
  inputs: Omit<DealInputs, 'deal_id'>
  onInputsChange: (inputs: Omit<DealInputs, 'deal_id'>) => void
  onCalculate: () => void
  centerContent: string
  onCenterContentChange: (content: string) => void
}

const AUTHORITY_MAX_DISCOUNT: Record<number, number> = { 1: 5, 2: 10, 3: 15 }

function getMaxDiscount(level: number): number {
  return AUTHORITY_MAX_DISCOUNT[level] ?? (level >= 4 ? 30 : 5)
}

const VALID_ACTION_FIELDS = new Set([
  'student_count', 'faculty_count', 'course_sections', 'discount_percent',
  'exam_days', 'seats_per_exam_day', 'contract_term', 'customer_status',
])

function filterActionBlocks(content: string): string {
  return content
    .replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/g, '')
    .replace(/<<<ACTION>>>[\s\S]*/g, '')
    .trim()
}

function extractAction(fullContent: string): QuoteAction | null {
  const match = /<<<ACTION>>>\s*([\s\S]*?)\s*<<<END_ACTION>>>/.exec(fullContent)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    if (!VALID_ACTION_FIELDS.has(parsed.field as string)) return null
    return parsed as unknown as QuoteAction
  } catch {
    return null
  }
}

function actionFieldLabel(field: QuoteAction['field']): string {
  const labels: Record<QuoteAction['field'], string> = {
    student_count: 'Student count',
    faculty_count: 'Faculty count',
    course_sections: 'Course sections',
    discount_percent: 'Discount %',
    exam_days: 'Exam days/yr',
    seats_per_exam_day: 'Seats/exam day',
    contract_term: 'Contract term',
    customer_status: 'Customer status',
  }
  return labels[field]
}

export function PortiaPanel({
  deal, quoteResult, profile, centerMode, proposalSections,
  onProposalSectionChange, inputs, onInputsChange, onCalculate,
  centerContent: _centerContent, onCenterContentChange,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [traceOpen, setTraceOpen] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    async function ensureSession() {
      const { data } = await supabase
        .from('portia_sessions')
        .select('id')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setSessionId(data.id)
        const { data: msgs } = await supabase
          .from('portia_messages')
          .select('id, role, content, source_trace')
          .eq('session_id', data.id)
          .in('role', ['user', 'assistant'])
          .order('created_at', { ascending: true })
        if (msgs) {
          setMessages(msgs.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            source_trace: m.source_trace as SourceTrace,
          })))
        }
      } else {
        const { data: newSession } = await supabase
          .from('portia_sessions')
          .insert({
            deal_id: deal.id,
            user_profile_id: profile?.id ?? null,
            title: deal.customer_name,
            mode: 'pricing_strategist',
          })
          .select('id')
          .single()
        if (newSession) setSessionId(newSession.id)
      }
    }
    ensureSession()
  }, [deal.id, profile?.id])

  function applyAction(msgId: string, action: QuoteAction) {
    const updated = { ...inputs } as Record<string, unknown>
    updated[action.field] = action.value

    onInputsChange(updated as unknown as Omit<DealInputs, 'deal_id'>)
    onCalculate()

    setMessages((m) =>
      m.map((msg) =>
        msg.id === msgId
          ? { ...msg, pendingAction: { ...msg.pendingAction!, status: 'applied' } }
          : msg
      )
    )

    if (sessionId) {
      supabase.from('ai_events').insert({
        event_type: 'applied_update' as const,
        status: 'created',
        deal_id: deal.id,
        actor_profile_id: profile?.id ?? null,
        reference: {
          field: action.field,
          old_value: (inputs as Record<string, unknown>)[action.field],
          new_value: action.value,
          reason: action.reason,
          session_id: sessionId,
        },
      })
    }
  }

  function dismissAction(msgId: string) {
    setMessages((m) =>
      m.map((msg) =>
        msg.id === msgId
          ? { ...msg, pendingAction: { ...msg.pendingAction!, status: 'dismissed' } }
          : msg
      )
    )
  }

  const PROPOSAL_FILL_PATTERNS = [
    /\b(fill|update|generate|draft|write|populate|auto[- ]?fill)\b.*\b(proposal|proposal sections)\b/i,
    /\b(proposal|proposal sections)\b.*\b(fill|update|generate|draft|write|populate|auto[- ]?fill)\b/i,
    /\bfill\b.*\bproposal\b/i,
  ]

  const BATTLECARD_FILL_PATTERNS = [
    /\b(fill|update|generate|draft|write|populate|auto[- ]?fill|build|create|show|get)\b.*\b(battle[ ]?cards?|battlecards?)\b/i,
    /\b(battle[ ]?cards?|battlecards?)\b.*\b(fill|update|generate|draft|write|populate|auto[- ]?fill|build|create|show|get)\b/i,
    /\b(battle[ ]?cards?|battlecards?)\b/i,
  ]

  function isProposalFillCommand(text: string): boolean {
    return PROPOSAL_FILL_PATTERNS.some((re) => re.test(text))
  }

  function isBattleCardFillCommand(text: string): boolean {
    return BATTLECARD_FILL_PATTERNS.some((re) => re.test(text))
  }

  const FIELD_ALIASES: Record<string, { field: QuoteAction['field']; label: string }> = {
    'student count': { field: 'student_count', label: 'student count' },
    'students': { field: 'student_count', label: 'student count' },
    'student': { field: 'student_count', label: 'student count' },
    'faculty count': { field: 'faculty_count', label: 'faculty count' },
    'faculty': { field: 'faculty_count', label: 'faculty count' },
    'course sections': { field: 'course_sections', label: 'course sections' },
    'sections': { field: 'course_sections', label: 'course sections' },
    'exam days': { field: 'exam_days', label: 'exam days' },
    'exam day': { field: 'exam_days', label: 'exam days' },
    'seats per exam day': { field: 'seats_per_exam_day', label: 'seats per exam day' },
    'seats': { field: 'seats_per_exam_day', label: 'seats per exam day' },
    'seats per day': { field: 'seats_per_exam_day', label: 'seats per exam day' },
    'discount': { field: 'discount_percent', label: 'discount' },
    'discount percent': { field: 'discount_percent', label: 'discount' },
    'discount percentage': { field: 'discount_percent', label: 'discount' },
  }

  function parseInputUpdateCommand(text: string): { field: QuoteAction['field']; value: number; label: string } | null {
    const verbRe = /\b(?:update|set|change|make|adjust|increase|decrease|put)\b/i
    if (!verbRe.test(text)) return null

    const lower = text.toLowerCase()

    const sortedAliases = Object.keys(FIELD_ALIASES).sort((a, b) => b.length - a.length)

    for (const alias of sortedAliases) {
      if (!lower.includes(alias)) continue

      const patterns = [
        new RegExp(`${alias}[^0-9]*\bto\b[^0-9]*([0-9,]+)`, 'i'),
        new RegExp(`\bto\b[^0-9]*([0-9,]+)[^0-9]*${alias}`, 'i'),
        new RegExp(`${alias}[^0-9]*=\s*([0-9,]+)`, 'i'),
        new RegExp(`${alias}\s+(?:to\s+)?([0-9,]+)`, 'i'),
      ]

      for (const re of patterns) {
        const m = re.exec(text)
        if (m) {
          const rawNum = m[1].replace(/,/g, '')
          const value = parseInt(rawNum, 10)
          if (isNaN(value) || value < 0) return null

          let finalValue = value
          if (FIELD_ALIASES[alias].field === 'discount_percent') {
            finalValue = Math.min(value, 100)
          }

          return { field: FIELD_ALIASES[alias].field, value: finalValue, label: FIELD_ALIASES[alias].label }
        }
      }
    }

    return null
  }

  async function handleProposalFill(text: string) {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'user' as const,
        content: text,
        source_trace: {},
      })
    }

    let assistantContent = ''
    let sourceTrace: SourceTrace | undefined

    if (!quoteResult) {
      assistantContent =
        "I'd be happy to fill in the proposal for you, but we need a calculated quote first. Please calculate a quote on the Quote tab, then ask me again to fill the proposal. I won't invent pricing totals."
    } else {
      const generated = generateProposalSections(deal, quoteResult, profile)
      PROPOSAL_SECTION_KEYS.forEach((key) => {
        if (generated[key]) onProposalSectionChange(key, generated[key])
      })
      const productNames = quoteResult.lines.map((l) => l.product_name).filter(Boolean)
      const productList = productNames.length > 0 ? productNames.join(', ') : 'the selected products'
      assistantContent =
        `Done! I've filled in all proposal sections based on the current quote data for ${productList}. ` +
        `You can review and edit each section on the proposal panel — the Executive Summary, The Challenge, Solution Fit, and Investment Rationale sections now have content tailored to ${deal.customer_name}'s deal. ` +
        `Switch to the Proposal tab to review, and let me know if you'd like any adjustments.`
      sourceTrace = {
        config_version_id: quoteResult.config_version_id,
        config_version_name: quoteResult.config_version_name,
        has_quote: true,
        user_authority_level: profile?.authority_level ?? 1,
        generated_at: new Date().toISOString(),
      }
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: assistantContent, source_trace: sourceTrace }
    setMessages((m) => [...m, assistantMsg])

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'assistant' as const,
        content: assistantContent,
        source_trace: sourceTrace ?? {},
      })
    }

    setLoading(false)
  }

  async function handleBattleCardFill(text: string) {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'user' as const,
        content: text,
        source_trace: {},
      })
    }

    const result = await generateBattleCard(quoteResult)

    let assistantContent = ''
    if (!result.hasData) {
      assistantContent = result.content
    } else {
      onCenterContentChange(result.content)
      const productList = quoteResult && quoteResult.lines.length > 0
        ? quoteResult.lines.map((l) => l.product_name).join(', ')
        : 'all active products'
      assistantContent =
        `Done! I've generated battle cards for ${productList}, covering ${result.competitorCount} competitor${result.competitorCount !== 1 ? 's' : ''} total. ` +
        `Each card includes threat tier, competitor strengths, Apporto advantages, pricing intel, LMS coverage, FERPA positioning, and ready-to-use positioning lines. ` +
        `Switch to the Battlecard tab to review, and let me know if you'd like to adjust anything.`
    }

    const sourceTrace: SourceTrace = {
      has_quote: !!quoteResult,
      user_authority_level: profile?.authority_level ?? 1,
      generated_at: new Date().toISOString(),
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: assistantContent, source_trace: sourceTrace }
    setMessages((m) => [...m, assistantMsg])

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'assistant' as const,
        content: assistantContent,
        source_trace: sourceTrace,
      })
    }

    setLoading(false)
  }

  async function handleInputUpdate(text: string, parsed: { field: QuoteAction['field']; value: number; label: string }) {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'user' as const,
        content: text,
        source_trace: {},
      })
    }

    const oldValue = (inputs as Record<string, unknown>)[parsed.field] as number
    const updated = { ...inputs } as Record<string, unknown>
    updated[parsed.field] = parsed.value
    onInputsChange(updated as unknown as Omit<DealInputs, 'deal_id'>)
    onCalculate()

    const assistantContent =
      `Done! I've updated the ${parsed.label} from ${oldValue?.toLocaleString() ?? 0} to ${parsed.value.toLocaleString()}. ` +
      `The quote has been recalculated with the new value. ` +
      `Let me know if you'd like any other changes.`

    const sourceTrace: SourceTrace = {
      has_quote: !!quoteResult,
      user_authority_level: profile?.authority_level ?? 1,
      generated_at: new Date().toISOString(),
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: assistantContent, source_trace: sourceTrace }
    setMessages((m) => [...m, assistantMsg])

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'assistant' as const,
        content: assistantContent,
        source_trace: sourceTrace,
      })
      await supabase.from('ai_events').insert({
        event_type: 'applied_update' as const,
        status: 'created',
        deal_id: deal.id,
        actor_profile_id: profile?.id ?? null,
        reference: {
          field: parsed.field,
          old_value: oldValue,
          new_value: parsed.value,
          reason: 'local command parse',
          session_id: sessionId,
        },
      })
    }

    setLoading(false)
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)

    if (isBattleCardFillCommand(text)) {
      await handleBattleCardFill(text)
      return
    }

    if (isProposalFillCommand(text)) {
      await handleProposalFill(text)
      return
    }

    const inputUpdate = parseInputUpdateCommand(text)
    if (inputUpdate) {
      await handleInputUpdate(text, inputUpdate)
      return
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    if (sessionId) {
      await supabase.from('portia_messages').insert({
        session_id: sessionId,
        role: 'user' as const,
        content: text,
        source_trace: {},
      })
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(`${supabaseUrl}/functions/v1/portia-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? supabaseAnonKey}`,
          'Apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          deal_context: { customer_name: deal.customer_name, deal_id: deal.id },
          quote_context: quoteResult ? {
            config_version_name: quoteResult.config_version_name,
            config_version_id: quoteResult.config_version_id,
            final_total: quoteResult.final_total,
            discount_percent: quoteResult.discount_percent,
            approval_level: quoteResult.approval_level,
            per_student_price: quoteResult.per_student_price,
            lines: quoteResult.lines.map((l) => ({
              product_name: l.product_name,
              tier_label: l.tier_label,
              quantity: l.quantity,
              unit: l.unit,
              unit_price: l.unit_price,
              net_price: l.net_price,
            })),
            tco_low: quoteResult.tco_low,
            tco_high: quoteResult.tco_high,
            gross_margin_percent: quoteResult.gross_margin_percent,
          } : null,
          inputs_context: {
            student_count: inputs.student_count,
            faculty_count: inputs.faculty_count,
            course_sections: inputs.course_sections,
            exam_days: inputs.exam_days,
            seats_per_exam_day: inputs.seats_per_exam_day,
            discount_percent: inputs.discount_percent,
            contract_term: inputs.contract_term,
            customer_status: inputs.customer_status,
            selected_product_slugs: inputs.selected_products.map((p) => p.product_slug),
          },
          user_authority_level: profile?.authority_level ?? 1,
          user_name: profile?.name ?? 'User',
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(err || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let rawContent = ''
      let hubspotToolsUsed: string[] = []
      const collectedToolEvents: ToolEvent[] = []
      const assistantId = crypto.randomUUID()

      setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '', toolEvents: [] }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'tool_call') {
              const ev: ToolEvent = { type: 'tool_call', name: parsed.name, label: parsed.label }
              collectedToolEvents.push(ev)
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, toolEvents: [...(msg.toolEvents ?? []), ev] }
                    : msg
                )
              )
              continue
            }

            if (parsed.type === 'tool_result') {
              const ev: ToolEvent = { type: 'tool_result', name: parsed.name, found: parsed.found }
              collectedToolEvents.push(ev)
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, toolEvents: [...(msg.toolEvents ?? []), ev] }
                    : msg
                )
              )
              continue
            }

            const delta = parsed.choices?.[0]?.delta?.content ?? parsed.delta ?? ''
            if (delta) {
              rawContent += delta
              const displayContent = filterActionBlocks(rawContent)
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: displayContent } : msg
                )
              )
            }

            if (parsed.hubspot_tools_used?.length) {
              hubspotToolsUsed = parsed.hubspot_tools_used
            }
          } catch { /* non-JSON line */ }
        }
      }

      const extractedAction = extractAction(rawContent)
      const cleanContent = filterActionBlocks(rawContent)

      let pendingAction: PendingAction | undefined
      if (extractedAction) {
        if (extractedAction.field === 'discount_percent') {
          const maxDiscount = getMaxDiscount(profile?.authority_level ?? 1)
          if (Number(extractedAction.value) > maxDiscount) {
            pendingAction = {
              action: extractedAction,
              status: 'blocked',
              blocked_reason: `Discount of ${extractedAction.value}% exceeds your authority level (max ${maxDiscount}%). Manager/VP/CFO approval required.`,
            }
          }
        }
        if (!pendingAction) {
          pendingAction = { action: extractedAction, status: 'pending' }
        }
      }

      const sourceTrace: SourceTrace = {
        config_version_id: quoteResult?.config_version_id,
        config_version_name: quoteResult?.config_version_name,
        has_quote: !!quoteResult,
        user_authority_level: profile?.authority_level ?? 1,
        generated_at: new Date().toISOString(),
        hubspot_tools_used: hubspotToolsUsed.length > 0 ? hubspotToolsUsed : undefined,
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: cleanContent, source_trace: sourceTrace, pendingAction }
            : msg
        )
      )

      if (sessionId && cleanContent) {
        await supabase.from('portia_messages').insert({
          session_id: sessionId,
          role: 'assistant' as const,
          content: cleanContent,
          source_trace: sourceTrace,
        })
        await supabase.from('ai_events').insert({
          event_type: 'generation' as const,
          status: 'created',
          deal_id: deal.id,
          actor_profile_id: profile?.id ?? null,
          reference: {
            session_id: sessionId,
            has_quote: !!quoteResult,
            hubspot_tools_used: hubspotToolsUsed,
            has_action: !!extractedAction,
          },
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      setMessages((m) => m.filter((msg) => msg.content !== ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Portia</div>
          <div className="text-xs text-neutral-400">Apporto Sales AI</div>
        </div>
        {quoteResult && (
          <div className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
            Quote: {formatCurrency(quoteResult.final_total)}
          </div>
        )}
      </div>

      {!quoteResult && (
        <div className="mx-3 mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-500 flex gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>No quote calculated yet. Portia will ask you to calculate a quote before she can write pricing proposals. She will not invent totals.</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">👋</div>
            <p className="text-sm text-neutral-500">Hi! I'm Portia, your Apporto Sales AI.</p>
            <p className="text-xs text-neutral-400 mt-1">Ask me about products, pricing strategy, competitive positioning, or to draft a proposal. You can also ask me to update quote inputs — e.g. "set students to 2500".</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-xl px-3 py-2.5 text-sm',
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-sm'
                : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'
            )}>
              {msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length > 0 && (
                <div className="mb-2.5 space-y-1">
                  {msg.toolEvents.map((ev, i) => (
                    <div key={i} className={cn(
                      'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md',
                      ev.type === 'tool_call'
                        ? 'bg-orange-50 text-orange-700 border border-orange-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    )}>
                      <Database className="w-3 h-3 flex-shrink-0" />
                      {ev.type === 'tool_call'
                        ? ev.label
                        : ev.found != null
                          ? `Found ${ev.found} result${ev.found !== 1 ? 's' : ''}`
                          : 'Query complete'
                      }
                    </div>
                  ))}
                </div>
              )}

              <div className="whitespace-pre-wrap leading-relaxed">
                {msg.content || <Loader2 className="w-3 h-3 animate-spin inline" />}
              </div>

              {msg.role === 'assistant' && msg.pendingAction && msg.content && (
                <PendingActionCard
                  pendingAction={msg.pendingAction}
                  onApply={() => applyAction(msg.id, msg.pendingAction!.action)}
                  onDismiss={() => dismissAction(msg.id)}
                />
              )}

              {msg.role === 'assistant' && msg.source_trace && msg.content && (
                <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                  <button
                    className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600"
                    onClick={() => setTraceOpen(traceOpen === msg.id ? null : msg.id)}
                  >
                    <Info className="w-3 h-3" /> Source trace
                    <ChevronDown className={cn('w-3 h-3 transition-transform', traceOpen === msg.id && 'rotate-180')} />
                  </button>
                  {traceOpen === msg.id && (
                    <div className="mt-1.5 text-xs text-neutral-500 space-y-1 font-mono">
                      {msg.source_trace.config_version_name && (
                        <div>Config: {String(msg.source_trace.config_version_name)}</div>
                      )}
                      <div>Authority: L{String(msg.source_trace.user_authority_level)}</div>
                      {msg.source_trace.has_quote && <div className="text-emerald-600">Quote context included</div>}
                      {!msg.source_trace.has_quote && <div className="text-amber-600">No quote context — pricing estimates not available</div>}
                      {msg.source_trace.hubspot_tools_used && msg.source_trace.hubspot_tools_used.length > 0 && (
                        <div className="text-orange-600">
                          HubSpot tools: {msg.source_trace.hubspot_tools_used.join(', ')}
                        </div>
                      )}
                      <div className="text-neutral-400">{String(msg.source_trace.generated_at)}</div>
                    </div>
                  )}

                  {centerMode === 'proposal' && (
                    <div>
                      {applyOpen === msg.id ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            className="flex-1 text-xs border border-neutral-200 rounded px-1.5 py-1 bg-white text-neutral-700 focus:outline-none focus:border-brand-400"
                            defaultValue=""
                            onChange={(e) => {
                              if (!e.target.value) return
                              onProposalSectionChange(e.target.value as ProposalSectionKey, msg.content)
                              setApplyOpen(null)
                            }}
                          >
                            <option value="" disabled>Pick section…</option>
                            {PROPOSAL_SECTION_KEYS.map((key) => (
                              <option key={key} value={key}>
                                {SECTION_LABELS[key]}
                                {proposalSections[key] ? ' (replaces)' : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            className="text-xs text-neutral-400 hover:text-neutral-600 px-1"
                            onClick={() => setApplyOpen(null)}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                          onClick={() => setApplyOpen(msg.id)}
                        >
                          <ClipboardPaste className="w-3 h-3" /> Apply to proposal
                        </button>
                      )}
                    </div>
                  )}

                  {(centerMode === 'battlecard' || centerMode === 'strategy') && (
                    <button
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium capitalize"
                      onClick={() => onCenterContentChange(msg.content)}
                    >
                      <ClipboardPaste className="w-3 h-3" /> Apply to {centerMode}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-3 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-200">
            Error: {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 border-t border-neutral-200 p-3">
        <div className="flex gap-2">
          <input
            className="input-base text-sm py-2 flex-1"
            placeholder={`Ask Portia… or say "set students to 2500"`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            disabled={loading}
          />
          <button
            className="btn-primary px-3 py-2 flex-shrink-0"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-neutral-400 mt-1.5 leading-tight">
          Portia can update quote inputs and draft proposals. She will not invent pricing totals.
        </p>
      </div>
    </div>
  )
}

function PendingActionCard({
  pendingAction,
  onApply,
  onDismiss,
}: {
  pendingAction: PendingAction
  onApply: () => void
  onDismiss: () => void
}) {
  const { action, status, blocked_reason } = pendingAction

  if (status === 'applied') {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
        <Check className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Applied — {actionFieldLabel(action.field)} updated to <strong>{String(action.value)}</strong> and quote recalculated.</span>
      </div>
    )
  }

  if (status === 'dismissed') {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-xs text-neutral-400 bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200">
        <X className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Dismissed — {actionFieldLabel(action.field)} unchanged.</span>
      </div>
    )
  }

  if (status === 'blocked') {
    return (
      <div className="mt-2.5 text-xs bg-red-50 rounded-lg px-3 py-2.5 border border-red-200">
        <div className="flex items-start gap-2 text-red-700">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Approval required</span>
            <p className="mt-0.5 text-red-600">{blocked_reason}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-red-500">
            Proposed: {actionFieldLabel(action.field)} → <strong>{String(action.value)}</strong>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2.5 bg-brand-50 rounded-lg border border-brand-200 overflow-hidden">
      <div className="px-3 py-2 flex items-start gap-2">
        <Zap className="w-3.5 h-3.5 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-brand-800">Portia wants to update a quote input</p>
          <div className="mt-1 text-xs text-brand-700 space-y-0.5">
            <div><span className="text-brand-500">Field:</span> {actionFieldLabel(action.field)}</div>
            <div><span className="text-brand-500">New value:</span> <strong>{String(action.value)}</strong></div>
            <div className="text-brand-500 italic">{action.reason}</div>
          </div>
        </div>
      </div>
      <div className="flex border-t border-brand-200">
        <button
          onClick={onApply}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border-r border-brand-200"
        >
          <Check className="w-3.5 h-3.5" /> Apply &amp; recalculate
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-neutral-500 bg-white hover:bg-neutral-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Dismiss
        </button>
      </div>
    </div>
  )
}
