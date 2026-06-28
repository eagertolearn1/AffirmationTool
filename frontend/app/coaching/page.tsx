'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useAuthStore } from '@/lib/store'
import { coaching, payment } from '@/lib/api'
import Link from 'next/link'

interface Message { role: 'user' | 'assistant'; content: string; created_at?: string }

interface CrisisResponse {
  message: string
  resources: { name: string; contact: string; hours: string }[]
  action: string
}

export default function CoachingPage() {
  const router = useRouter()
  const { user, activeJourney, _hasHydrated } = useAuthStore()
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [status, setStatus]       = useState<any>(null)
  const [crisis, setCrisis]       = useState<CrisisResponse | null>(null)
  const [buyingCredits, setBuyingCredits] = useState(false)
  const [rzpReady, setRzpReady]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const jid = activeJourney?.id

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    if (!jid)  { router.replace('/journey'); return }
    loadHistory()
    loadStatus()
  }, [jid])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadHistory() {
    if (!jid) return
    const { data } = await coaching.getHistory(jid)
    setMessages(data.messages || [])
  }

  async function loadStatus() {
    if (!jid) return
    const { data } = await coaching.getStatus(jid)
    setStatus(data)
  }

  async function send() {
    if (!input.trim() || !jid || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const { data } = await coaching.sendMessage(jid, userMsg)
      if (data.crisis) {
        setCrisis(data.response)
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
      }
      loadStatus()
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Could not reach coach'
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }])
    } finally { setLoading(false) }
  }

  async function buyCredits(planId: 'coaching_credits_5' | 'coaching_credits_20') {
    if (!jid || !rzpReady) return
    setBuyingCredits(true)
    try {
      const { data: order } = await payment.createOrder({ plan_id: planId, journey_id: jid })
      const options = {
        key:         order.key_id,
        amount:      order.amount,
        currency:    order.currency,
        name:        'AuraLoop',
        description: order.description,
        order_id:    order.order_id,
        prefill:     { email: user?.email || '', name: user?.name || '' },
        theme:       { color: '#C9A84C' },
        handler: async () => { loadStatus() },
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.open()
    } catch {}
    finally { setBuyingCredits(false) }
  }

  return (
    <>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" onReady={() => setRzpReady(true)} />
    <div className="min-h-screen flex flex-col" style={{ background: 'hsl(222,20%,8%)' }}>
      {/* Header */}
      <div className="px-6 pt-12 pb-4 border-b" style={{ borderColor: 'hsl(222,15%,16%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>AI Coach</h1>
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'hsl(220,10%,45%)' }}>
              <span style={{ color: '#C9A84C', fontSize: 8 }}>●</span> You are chatting with an AI — not a human coach
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,50%)' }}>
              {status ? `${status.remaining} messages left today` : 'Loading…'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)' }}>✦</div>
        </div>
      </div>

      {/* Crisis banner */}
      {crisis && (
        <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="font-semibold text-red-400 mb-2">🆘 {crisis.message}</p>
          <div className="space-y-2">
            {crisis.resources.map(r => (
              <div key={r.name} className="text-sm" style={{ color: 'hsl(45,30%,85%)' }}>
                <strong>{r.name}</strong> — {r.contact} <span style={{ color: 'hsl(220,10%,50%)' }}>({r.hours})</span>
              </div>
            ))}
          </div>
          <p className="text-sm mt-2" style={{ color: 'hsl(220,10%,55%)' }}>{crisis.action}</p>
          <button onClick={() => setCrisis(null)} className="mt-3 text-xs underline" style={{ color: 'hsl(220,10%,50%)' }}>Dismiss</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-hide">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>✦</div>
            <p className="font-medium" style={{ color: 'hsl(45,30%,85%)' }}>Your AI coach is ready</p>
            <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Ask about today&apos;s affirmation or share what&apos;s on your mind</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background:   m.role === 'user' ? 'linear-gradient(135deg, #C9A84C, #E8C97A)' : 'rgba(255,255,255,0.06)',
                color:        m.role === 'user' ? 'hsl(222,20%,8%)' : 'hsl(45,30%,92%)',
                borderRadius: m.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
              }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '1rem 1rem 1rem 0.25rem' }}>
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <span key={i} className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#C9A84C', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Limit reached — buy credits */}
      {status && status.remaining === 0 && (
        <div className="mx-4 mb-2 rounded-2xl p-4" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'hsl(45,30%,90%)' }}>
            Daily limit reached — add more messages
          </p>
          <p className="text-xs mb-3" style={{ color: 'hsl(220,10%,50%)' }}>Credits roll over. Use anytime during your 21-day journey.</p>
          <div className="flex gap-2">
            <button onClick={() => buyCredits('coaching_credits_5')} disabled={buyingCredits || !rzpReady}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-opacity"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'hsl(45,30%,85%)', opacity: buyingCredits ? 0.6 : 1 }}>
              +5 messages<br /><span style={{ color: 'hsl(220,10%,55%)' }}>₹99</span>
            </button>
            <button onClick={() => buyCredits('coaching_credits_20')} disabled={buyingCredits || !rzpReady}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-opacity"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: buyingCredits ? 0.6 : 1 }}>
              +20 messages<br /><span style={{ opacity: 0.75 }}>₹299</span>
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'hsl(222,15%,16%)', background: 'hsl(222,18%,10%)' }}>
        <div className="flex gap-2 items-end">
          <textarea
            rows={1}
            placeholder={status?.remaining === 0 ? 'Buy more messages above to continue…' : 'Ask your coach…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={status?.remaining === 0}
            className="flex-1 rounded-xl px-4 py-3 text-sm resize-none outline-none"
            style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,22%)', color: 'hsl(45,30%,92%)', maxHeight: '120px', opacity: status?.remaining === 0 ? 0.5 : 1 }}
          />
          <button onClick={send} disabled={loading || !input.trim() || status?.remaining === 0}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-opacity"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', opacity: loading || !input.trim() || status?.remaining === 0 ? 0.4 : 1 }}>
            <span style={{ color: 'hsl(222,20%,8%)', fontSize: '1.1rem' }}>↑</span>
          </button>
        </div>
      </div>

      <BottomNav active="coach" />
    </div>
    </>
  )
}

function BottomNav({ active }: { active: string }) {
  const tabs = [
    { href: '/journey',  icon: '✦', label: 'Journey' },
    { href: '/coaching', icon: '💬', label: 'Coach' },
    { href: '/progress', icon: '📈', label: 'Progress' },
    { href: '/profile',  icon: '👤', label: 'Profile' },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t" style={{ background: 'hsl(222,18%,11%)', borderColor: 'hsl(222,15%,18%)' }}>
      {tabs.map(t => (
        <Link key={t.href} href={t.href}
          className="flex-1 flex flex-col items-center py-3 text-xs gap-1"
          style={{ color: active === t.label.toLowerCase() ? '#C9A84C' : 'hsl(220,10%,45%)' }}>
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
