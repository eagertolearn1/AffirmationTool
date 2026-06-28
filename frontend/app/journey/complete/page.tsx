'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { journey as journeyApi, payment, progress as progressApi } from '@/lib/api'
import Link from 'next/link'

declare global {
  interface Window { Razorpay: any }
}

const RENEWAL_PLANS = [
  {
    id: 'standard_renewal',
    label: 'Standard Renewal',
    price: '₹699',
    priceNum: 69900,
    features: ['New 21-day journey', 'Full audio affirmations', 'Progress tracking', 'AI Coach (20 msgs/day)'],
    tag: '',
  },
  {
    id: 'premium_renewal',
    label: 'Premium Renewal',
    price: '₹1,299',
    priceNum: 129900,
    features: ['New 21-day journey', 'Full audio affirmations', 'Progress tracking', 'Unlimited AI coaching', 'Voice personalisation', 'WhatsApp nudges', 'Priority support'],
    tag: 'Best Value',
  },
]

export default function JourneyCompletePage() {
  const router  = useRouter()
  const { user, _hasHydrated } = useAuthStore()
  const [journeyId, setJourneyId] = useState<string | null>(null)
  const [stats, setStats]         = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [selectedPlan, setSelectedPlan] = useState('premium_renewal')
  const [paying, setPaying]       = useState(false)
  const [payError, setPayError]   = useState('')

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    loadData()
  }, [_hasHydrated, user])

  async function loadData() {
    try {
      const { data: j } = await journeyApi.getCurrent()
      if (j && j.journey_id) {
        setJourneyId(j.journey_id)
        // Load progress for transformation score
        try {
          const { data: prog } = await progressApi.dashboard(j.journey_id)
          setStats(prog)
        } catch {}
      }
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  async function handleRenew() {
    if (!journeyId || paying) return
    setPaying(true); setPayError('')
    try {
      // Load Razorpay SDK
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = () => resolve(); s.onerror = () => reject(new Error('SDK load failed'))
          document.head.appendChild(s)
        })
      }

      const { data: order } = await payment.createOrder({ plan_id: selectedPlan, journey_id: journeyId })

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key:         order.key_id,
          amount:      order.amount,
          currency:    order.currency,
          name:        'AuraLoop',
          description: order.description,
          order_id:    order.order_id,
          prefill: { name: user?.name || '', email: user?.email || '' },
          theme: { color: '#C9A84C' },
          handler: async (response: any) => {
            try {
              await payment.verify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                plan_id: selectedPlan,
                journey_id: journeyId,
              })
              resolve()
            } catch (e) { reject(e) }
          },
          modal: { ondismiss: () => reject(new Error('dismissed')) },
        })
        rzp.open()
      })

      // After renewal payment, redirect to onboarding to start new journey
      router.push('/onboarding')
    } catch (e: any) {
      if (e.message !== 'dismissed') {
        setPayError(e.response?.data?.message || e.message || 'Payment failed. Please try again.')
      }
    } finally { setPaying(false) }
  }

  const score = stats?.transformation_score ?? stats?.score ?? null
  const streak = stats?.streak_days ?? stats?.current_streak ?? null
  const days   = stats?.affirmation_days_completed ?? stats?.days_completed ?? 21

  return (
    <div className="min-h-screen pb-16" style={{ background: 'hsl(222,20%,8%)' }}>
      {/* Hero confetti header */}
      <div className="relative overflow-hidden px-6 pt-16 pb-10 text-center"
        style={{ background: 'linear-gradient(160deg, hsl(222,20%,10%) 0%, hsl(270,25%,13%) 100%)' }}>
        {/* Decorative stars */}
        {['top-4 left-8', 'top-8 right-12', 'top-2 left-1/2', 'top-6 right-6'].map((pos, i) => (
          <span key={i} className={`absolute text-${i % 2 === 0 ? 'xl' : 'lg'} opacity-40 ${pos}`} style={{ color: '#C9A84C' }}>✦</span>
        ))}
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl"
          style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.25), rgba(232,201,122,0.1))', border: '2px solid rgba(201,168,76,0.4)' }}>
          🌟
        </div>
        <h1 className="text-3xl font-bold mb-2" style={{
          background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          21 Days Complete!
        </h1>
        <p className="text-base" style={{ color: 'hsl(45,30%,75%)' }}>
          You've completed your AuraLoop journey.
        </p>
        <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,55%)' }}>
          You showed up every day. That's identity in action.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center pt-12">
          <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
        </div>
      ) : (
        <div className="px-6 space-y-5 mt-6">
          {/* Stats summary */}
          <div className="rounded-2xl p-5 grid grid-cols-3 gap-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { label: 'Days Completed', value: `${days}/21` },
              { label: 'Day Streak', value: streak != null ? `${streak} 🔥` : '—' },
              { label: 'Transform Score', value: score != null ? `${score}` : '—' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>{s.value}</p>
                <p className="text-xs mt-1" style={{ color: 'hsl(220,10%,50%)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Identity shift message */}
          <div className="rounded-2xl p-5 text-center"
            style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.03))', border: '1px solid rgba(201,168,76,0.2)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'hsl(45,30%,82%)' }}>
              "Identity change isn't about what you do once.<br/>
              It's about who you become through repetition."
            </p>
            <p className="text-xs mt-2" style={{ color: 'hsl(220,10%,45%)' }}>— AuraLoop</p>
          </div>

          {/* Renewal section */}
          <div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'hsl(45,30%,92%)' }}>Continue Your Growth</h2>
            <p className="text-sm mb-4" style={{ color: 'hsl(220,10%,50%)' }}>
              Start a new 21-day journey. Choose a new identity track or deepen the one you've built.
            </p>

            <div className="space-y-3">
              {RENEWAL_PLANS.map(plan => {
                const isSelected = selectedPlan === plan.id
                return (
                  <button key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                    className="w-full text-left rounded-2xl p-4 transition-all"
                    style={{
                      background: isSelected ? 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.06))' : 'rgba(255,255,255,0.03)',
                      border: `1.5px solid ${isSelected ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: isSelected ? '#C9A84C' : 'hsl(220,10%,40%)' }}>
                          {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: '#C9A84C' }} />}
                        </div>
                        <span className="font-semibold text-sm" style={{ color: 'hsl(45,30%,92%)' }}>{plan.label}</span>
                        {plan.tag && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(201,168,76,0.2)', color: '#C9A84C' }}>
                            {plan.tag}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-base" style={{ color: '#C9A84C' }}>{plan.price}</span>
                    </div>
                    <ul className="space-y-0.5 pl-6">
                      {plan.features.map(f => (
                        <li key={f} className="text-xs" style={{ color: 'hsl(220,10%,60%)' }}>• {f}</li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            {payError && (
              <p className="text-xs mt-3 text-center" style={{ color: '#f87171' }}>{payError}</p>
            )}

            <button onClick={handleRenew} disabled={paying}
              className="w-full mt-4 py-4 rounded-2xl font-bold text-base"
              style={{
                background: paying ? 'rgba(201,168,76,0.3)' : 'linear-gradient(135deg, #C9A84C, #E8C97A)',
                color: 'hsl(222,20%,8%)',
                opacity: paying ? 0.7 : 1,
              }}>
              {paying ? 'Processing…' : `Renew — ${RENEWAL_PLANS.find(p => p.id === selectedPlan)?.price}`}
            </button>

            <p className="text-xs text-center mt-2" style={{ color: 'hsl(220,10%,40%)' }}>
              Secure payment via Razorpay · 21-day new journey starts immediately
            </p>
          </div>

          {/* Skip / go home */}
          <div className="text-center pt-2 pb-4">
            <Link href="/journey" className="text-sm" style={{ color: 'hsl(220,10%,45%)' }}>
              View My Journey Summary →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
