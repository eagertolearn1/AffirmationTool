'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { progress, achievements } from '@/lib/api'
import { BottomNav } from '../journey/page'

interface SessionHistory {
  day: number
  believability_score: number | null
  doubt_score: number | null
  action_completed: string | null
}

interface RecentSession {
  affirmation_day_number: number
  calendar_date: string
  state: string
  doubt_score: number | null
  believability_score: number | null
  action_completed: string | null
}

const BADGE_META: Record<string, { icon: string; label: string; desc: string }> = {
  journey_completer:   { icon: '🏆', label: 'Journey Completer',   desc: 'Completed all 21 affirmation days' },
  perfect_consistency: { icon: '⚡', label: 'Perfect Consistency',  desc: '21 days in 21 calendar days — no gaps' },
  strong_momentum:     { icon: '🚀', label: 'Strong Momentum',      desc: 'Days 1–14 without a single gap' },
  comeback_champion:   { icon: '💪', label: 'Comeback Champion',    desc: 'Resumed after 3+ days and finished' },
  action_taker:        { icon: '✅', label: 'Action Taker',         desc: '80%+ action completion rate' },
}

function MiniBar({ value, max = 10, color = '#C9A84C' }: { value: number; max?: number; color?: string }) {
  return (
    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
    </div>
  )
}

export default function ProgressPage() {
  const router = useRouter()
  const { user, activeJourney, _hasHydrated } = useAuthStore()
  const [dashboard, setDashboard] = useState<any>(null)
  const [badges, setBadges]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const jid = activeJourney?.id

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    if (!jid)  { router.replace('/journey'); return }
    load()
  }, [jid, _hasHydrated])

  async function load() {
    if (!jid) return
    setLoading(true)
    try {
      const [d, b] = await Promise.all([progress.dashboard(jid), achievements.get(jid)])
      setDashboard(d.data)
      setBadges(b.data?.badges || [])
    } catch {}
    finally { setLoading(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222,20%,8%)' }}>
      <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
    </div>
  )

  const j       = dashboard?.journey
  const score   = j?.transformation_score || 0
  const history: SessionHistory[] = dashboard?.score_history || []
  const recent: RecentSession[]   = dashboard?.recent_sessions || []

  const affDay      = j?.affirmation_day  || 0
  const calDay      = j?.calendar_day     || 0
  const streak      = j?.streak           || 0
  const consistency = calDay > 0 ? Math.round((affDay / calDay) * 100) : 0

  const day1B   = history.find(h => h.day === 1)?.believability_score ?? null
  const latestB = history.length > 0 ? history[history.length - 1]?.believability_score : null
  const bGain   = (day1B != null && latestB != null) ? latestB - day1B : null

  const actionsYes   = recent.filter(s => s.action_completed === 'yes').length
  const actionsTotal = recent.filter(s => s.action_completed != null).length
  const actionRate   = actionsTotal > 0 ? Math.round((actionsYes / actionsTotal) * 100) : null

  return (
    <div className="min-h-screen pb-24" style={{ background: 'hsl(222,20%,8%)' }}>
      <div className="px-6 pt-12 pb-6">
        <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Your Progress
        </h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Track your identity transformation</p>
      </div>

      <div className="px-6 space-y-4">

        {/* Transformation Score */}
        <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04))', border: '1px solid rgba(201,168,76,0.25)' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#C9A84C' }}>Transformation Score</p>
          <p className="text-6xl font-bold" style={{ color: '#E8C97A' }}>{score}</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(220,10%,50%)' }}>out of 100</p>
          <div className="mt-4 h-2 rounded-full mx-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${score}%`, height: '100%', background: 'linear-gradient(90deg, #C9A84C, #E8C97A)', borderRadius: 999, transition: 'width 1s ease' }} />
          </div>
        </div>

        {/* Dual counter + stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Affirmation Days', value: affDay, sub: 'of 21', color: '#E8C97A' },
            { label: 'Calendar Days', value: calDay, sub: 'elapsed', color: 'hsl(45,30%,85%)' },
            { label: 'Current Streak', value: `${streak}🔥`, sub: 'consecutive days', color: streak > 0 ? '#fb923c' : 'hsl(45,30%,85%)' },
            { label: 'Consistency', value: `${consistency}%`, sub: 'affirmation / calendar', color: consistency >= 80 ? '#4ade80' : consistency >= 50 ? '#E8C97A' : '#f87171' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1" style={{ color: 'hsl(220,10%,50%)' }}>{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,40%)' }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Believability trend */}
        {history.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'hsl(45,30%,85%)' }}>Believability ↑</p>
              {bGain != null && (
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: bGain >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', color: bGain >= 0 ? '#4ade80' : '#f87171' }}>
                  {bGain >= 0 ? '+' : ''}{bGain.toFixed(1)} since Day 1
                </span>
              )}
            </div>
            <div className="flex items-end gap-1 h-20">
              {history.map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div style={{ width: '100%', height: `${((h.believability_score || 0) / 10) * 72}px`, background: 'linear-gradient(180deg, #C9A84C, rgba(201,168,76,0.3))', minHeight: 3, borderRadius: '3px 3px 0 0' }} />
                  <p style={{ fontSize: 8, color: 'hsl(220,10%,40%)' }}>D{h.day}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doubt trend */}
        {history.some(h => h.doubt_score != null) && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(45,30%,85%)' }}>Doubt Score ↓ <span className="text-xs font-normal" style={{ color: 'hsl(220,10%,50%)' }}>lower is better</span></p>
            <div className="flex items-end gap-1 h-16 mt-3">
              {history.filter(h => h.doubt_score != null).map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div style={{ width: '100%', height: `${((h.doubt_score || 0) / 10) * 56}px`, background: 'linear-gradient(180deg, #f87171, rgba(248,113,113,0.3))', minHeight: 3, borderRadius: '3px 3px 0 0' }} />
                  <p style={{ fontSize: 8, color: 'hsl(220,10%,40%)' }}>D{h.day}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Identity gap closing */}
        {bGain != null && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(107,33,168,0.1)', border: '1px solid rgba(147,51,234,0.2)' }}>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#9333EA' }}>Identity Gap Closing</p>
            <div className="space-y-2.5">
              {[['Day 1', day1B], ['Today', latestB]].map(([lbl, val]) => (
                <div key={lbl as string} className="flex items-center gap-3">
                  <span className="text-xs w-12 shrink-0" style={{ color: 'hsl(220,10%,55%)' }}>{lbl as string}</span>
                  <MiniBar value={val as number || 0} color={lbl === 'Today' ? '#9333EA' : 'rgba(147,51,234,0.4)'} />
                  <span className="text-xs w-5 text-right" style={{ color: 'hsl(220,10%,55%)' }}>{val ?? '–'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action completion */}
        {actionRate != null && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'hsl(45,30%,85%)' }}>Action Completion</p>
              <span className="font-bold text-sm" style={{ color: actionRate >= 80 ? '#4ade80' : '#E8C97A' }}>{actionRate}%</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {recent.map((s, i) => s.action_completed != null && (
                <div key={i} style={{ width: 24, height: 24, borderRadius: 6, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.action_completed === 'yes' ? 'rgba(74,222,128,0.15)' : s.action_completed === 'partially' ? 'rgba(251,146,60,0.15)' : 'rgba(248,113,113,0.12)',
                  border: `1px solid ${s.action_completed === 'yes' ? 'rgba(74,222,128,0.35)' : s.action_completed === 'partially' ? 'rgba(251,146,60,0.35)' : 'rgba(248,113,113,0.25)'}`,
                  color: s.action_completed === 'yes' ? '#4ade80' : s.action_completed === 'partially' ? '#fb923c' : '#f87171',
                }}>
                  {s.action_completed === 'yes' ? '✓' : s.action_completed === 'partially' ? '~' : '✗'}
                </div>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'hsl(220,10%,40%)' }}>{actionsYes} of {actionsTotal} milestone actions completed</p>
          </div>
        )}

        {/* Achievements */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: 'hsl(45,30%,85%)' }}>Achievements</p>
          <div className="space-y-3">
            {Object.entries(BADGE_META).map(([key, meta]) => {
              const earned = badges.find((b: any) => b.badge_type === key)?.earned
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-2xl" style={{ opacity: earned ? 1 : 0.25 }}>{meta.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: earned ? 'hsl(45,30%,90%)' : 'hsl(220,10%,45%)' }}>{meta.label}</p>
                    <p className="text-xs" style={{ color: 'hsl(220,10%,38%)' }}>{meta.desc}</p>
                  </div>
                  {earned && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)', whiteSpace: 'nowrap' }}>Earned ✓</span>}
                </div>
              )
            })}
          </div>
        </div>

      </div>

      <BottomNav active="progress" />
    </div>
  )
}
