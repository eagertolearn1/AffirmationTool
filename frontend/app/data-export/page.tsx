'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { user as userApi } from '@/lib/api'
import Link from 'next/link'

export default function DataExportPage() {
  const router = useRouter()
  const { user, _hasHydrated } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) router.replace('/auth')
  }, [_hasHydrated, user])

  async function handleExport() {
    setLoading(true)
    setError('')
    setDone(false)
    try {
      const { data } = await userApi.exportData()
      // Trigger browser download of the JSON blob
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `auraloop-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDone(true)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Export failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: 'linear-gradient(160deg, hsl(222,20%,8%) 60%, hsl(270,25%,11%) 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-12 pb-6">
        <Link href="/profile" className="w-9 h-9 flex items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <span style={{ color: 'hsl(45,30%,80%)' }}>←</span>
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Export My Data</h1>
          <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Download everything AuraLoop knows about you</p>
        </div>
      </div>

      <div className="px-6 space-y-4 mt-2">
        {/* Info card */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#C9A84C' }}>What&apos;s included</p>
          {[
            ['👤', 'Profile', 'Your name, email, and account details'],
            ['🗺️', 'Journeys', 'All 21-day journey data and settings'],
            ['📅', 'Sessions', 'Every morning & evening session record'],
            ['✍️', 'Check-ins', 'Your daily check-in scores and notes'],
            ['💬', 'Coaching', 'Your full AI coaching message history'],
            ['🏆', 'Achievements', 'Badges and milestone records'],
          ].map(([icon, title, desc]) => (
            <div key={title as string} className="flex items-start gap-3 mb-3 last:mb-0">
              <span className="text-lg">{icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'hsl(45,30%,92%)' }}>{title as string}</p>
                <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>{desc as string}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Privacy note */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(107,33,168,0.12)', border: '1px solid rgba(147,51,234,0.2)' }}>
          <p className="text-xs" style={{ color: 'hsl(220,10%,60%)' }}>
            Your data is exported as a JSON file. It contains everything stored about you on AuraLoop servers.
            You can use this data to switch services, create a backup, or review what we&apos;ve stored.
          </p>
        </div>

        {error && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {done && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <p className="text-sm" style={{ color: '#4ade80' }}>✓ Download started — check your Downloads folder.</p>
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={loading}
          className="w-full py-3.5 rounded-2xl font-semibold transition-opacity"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Preparing export…' : 'Download My Data →'}
        </button>

        <p className="text-xs text-center" style={{ color: 'hsl(220,10%,40%)' }}>
          Export is delivered as a JSON file. Processing may take a few seconds.
        </p>
      </div>
    </div>
  )
}
