'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { payment } from '@/lib/api'
import Link from 'next/link'

interface PaymentRecord {
  id: string
  amount: number
  currency: string
  status: string
  tier: string
  created_at: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
}

export default function PaymentHistoryPage() {
  const router = useRouter()
  const { user, _hasHydrated } = useAuthStore()
  const [records, setRecords] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    load()
  }, [_hasHydrated, user])

  async function load() {
    try {
      const { data } = await payment.history()
      setRecords(Array.isArray(data) ? data : data.payments || [])
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not load payment history')
    } finally { setLoading(false) }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatAmount(amount: number, currency: string) {
    // Razorpay stores in paise
    const val = amount > 1000 ? amount / 100 : amount
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: 'linear-gradient(160deg, hsl(222,20%,8%) 60%, hsl(270,25%,11%) 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-12 pb-6">
        <Link href="/profile" className="w-9 h-9 flex items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <span style={{ color: 'hsl(45,30%,80%)' }}>←</span>
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Payment History</h1>
          <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Your past transactions</p>
        </div>
      </div>

      <div className="px-6">
        {loading && (
          <div className="flex justify-center pt-16">
            <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
          </div>
        )}

        {error && (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="rounded-2xl p-8 text-center mt-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-4xl mb-3">💳</p>
            <p className="font-semibold mb-1" style={{ color: 'hsl(45,30%,92%)' }}>No payments yet</p>
            <p className="text-sm" style={{ color: 'hsl(220,10%,50%)' }}>Your transactions will appear here after purchase.</p>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div className="space-y-3 mt-2">
            {records.map(rec => (
              <div key={rec.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold capitalize" style={{ color: 'hsl(45,30%,92%)' }}>
                      {rec.tier ? `${rec.tier.charAt(0).toUpperCase() + rec.tier.slice(1)} Plan` : 'AuraLoop'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,50%)' }}>{formatDate(rec.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: '#C9A84C' }}>{formatAmount(rec.amount, rec.currency)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      background: rec.status === 'captured' || rec.status === 'paid' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      color: rec.status === 'captured' || rec.status === 'paid' ? '#4ade80' : '#f87171',
                    }}>
                      {rec.status === 'captured' ? 'Paid' : rec.status}
                    </span>
                  </div>
                </div>
                {rec.razorpay_payment_id && (
                  <p className="text-xs font-mono" style={{ color: 'hsl(220,10%,40%)' }}>
                    {rec.razorpay_payment_id}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
