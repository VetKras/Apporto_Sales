import { useState } from 'react'
import { Send, Loader2, Info, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function PortiaStandalone() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const response = await fetch(`${supabaseUrl}/functions/v1/portia-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          deal_context: { customer_name: 'General inquiry', deal_id: null },
          quote_context: null,
          user_authority_level: profile?.authority_level ?? 1,
          user_name: profile?.name ?? 'User',
        }),
      })

      if (!response.ok) throw new Error(await response.text())

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      let fullContent = ''
      const assistantId = crypto.randomUUID()
      setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content ?? ''
              if (delta) {
                fullContent += delta
                setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, content: fullContent } : msg))
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-neutral-900">Portia</h1>
        <p className="text-sm text-neutral-500">Ask product questions, get positioning help, or request battlecard drafts.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-neutral-600 font-medium">Hi, I'm Portia</p>
            <p className="text-sm text-neutral-400 mt-1 max-w-sm mx-auto">
              I can help with product questions, competitive analysis, proposal drafts, and deal strategy. For pricing proposals, open a deal and calculate a quote first.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-sm'
                : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm shadow-sm'
            )}>
              {msg.content || <Loader2 className="w-4 h-4 animate-spin inline" />}
            </div>
          </div>
        ))}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3 border border-red-200">{error}</div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-neutral-200 p-4 bg-white">
        <div className="flex gap-3">
          <input
            className="input-base flex-1"
            placeholder="Ask Portia anything about Apporto products or deals…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={loading}
          />
          <button className="btn-primary px-4 flex-shrink-0" onClick={send} disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
