'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { journey as journeyApi, achievements } from '@/lib/api'
import Link from 'next/link'
import AudioPlayer from '@/components/AudioPlayer'

interface DayData {
  day_number: number
  state: string
  truth_statement: string
  doubt: string
  reframe: string
  action_prompt: string
  is_milestone_day: boolean
  rotating_question: string | null
  morning_completed: boolean
  evening_completed: boolean
  checkin_completed: boolean
  morning_audio_url?: string
  evening_audio_url?: string
  checkin_data?: any
}

// Track-matched background gradients
const TRACK_BG: Record<string, string> = {
  confidence:    'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(35,40%,9%) 55%, hsl(270,25%,10%) 100%)',
  wealth:        'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(140,30%,7%) 55%, hsl(160,25%,9%) 100%)',
  career:        'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(220,35%,9%) 55%, hsl(240,25%,10%) 100%)',
  relationships: 'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(330,30%,9%) 55%, hsl(280,25%,10%) 100%)',
  health:        'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(160,30%,8%) 55%, hsl(140,25%,9%) 100%)',
  peace:         'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(270,30%,9%) 55%, hsl(250,25%,10%) 100%)',
  fitness:       'linear-gradient(160deg, hsl(222,20%,7%) 0%, hsl(20,35%,8%) 55%, hsl(270,20%,9%) 100%)',
}

const TRACK_ACCENT: Record<string, { primary: string; glow: string }> = {
  confidence:    { primary: '#C9A84C', glow: 'rgba(201,168,76,0.12)' },
  wealth:        { primary: '#22c55e', glow: 'rgba(34,197,94,0.12)' },
  career:        { primary: '#60a5fa', glow: 'rgba(96,165,250,0.12)' },
  relationships: { primary: '#f472b6', glow: 'rgba(244,114,182,0.12)' },
  health:        { primary: '#34d399', glow: 'rgba(52,211,153,0.12)' },
  peace:         { primary: '#a78bfa', glow: 'rgba(167,139,250,0.12)' },
  fitness:       { primary: '#fb923c', glow: 'rgba(251,146,60,0.12)' },
}

const STATE_LABELS: Record<string, string> = {
  locked: 'Locked',
  morning_unlocked: 'Morning Ready',
  evening_unlocked: 'Evening Ready',
  checkin_unlocked: 'Check-in Ready',
  completed: 'Day Complete ✓',
  expired: 'Auto-advanced',
}

const ROTATING_LABELS: Record<string, string> = {
  resistance:   'How much resistance did you feel today? (1 = none, 10 = a lot)',
  identity:     'How strongly did you act like this new identity today? (1–10)',
  doubt:        'How true does today\'s doubt feel right now? (1–10)',
  believability:'How believable does today\'s truth feel? (1–10)',
}

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span style={{ color: 'hsl(220,10%,60%)' }}>{label}</span>
        <span style={{ color: '#C9A84C' }}>{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value}
        onChange={e => onChange(+e.target.value)} className="w-full accent-amber-500" />
    </div>
  )
}

export default function JourneyPage() {
  const router = useRouter()
  const { user, activeJourney, _hasHydrated } = useAuthStore()
  const [dayData, setDayData]         = useState<DayData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError]             = useState('')
  const [reportSent, setReportSent]   = useState(false)

  // Check-in state — milestone (4 sliders + evidence + action) vs non-milestone (1 slider + rotating)
  const [believability, setBelievability] = useState(5)
  const [doubtScore, setDoubtScore]       = useState(5)
  const [resistanceScore, setResistance]  = useState(5)
  const [identityScore, setIdentity]      = useState(7)
  const [actionCompleted, setAction]      = useState<'yes'|'partially'|'no'>('yes')
  const [evidenceText, setEvidence]       = useState('')
  const [rotatingScore, setRotating]      = useState(5)

  const jid      = activeJourney?.id
  const affDay   = activeJourney?.current_affirmation_day || 1
  const calDay   = activeJourney?.current_calendar_day || affDay

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    if (!jid)  { router.replace('/onboarding'); return }
    loadDay()
  }, [jid, affDay, _hasHydrated])

  async function loadDay() {
    if (!jid) return
    setLoading(true)
    setError('')
    try {
      const { data } = await journeyApi.getDay(jid, affDay)
      setDayData(data)
      // If day 21 is completed → redirect to completion page
      if (data.day_number === 21 && data.state === 'completed') {
        router.replace('/journey/complete')
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not load today\'s session')
    } finally { setLoading(false) }
  }

  async function handleMorningComplete() {
    if (!jid) return
    setActionLoading(true)
    try { await journeyApi.morningComplete(jid, affDay); await loadDay() }
    catch (e: any) { setError(e.response?.data?.message || 'Error') }
    finally { setActionLoading(false) }
  }

  async function handleEveningComplete() {
    if (!jid) return
    setActionLoading(true)
    try { await journeyApi.eveningComplete(jid, affDay); await loadDay() }
    catch (e: any) { setError(e.response?.data?.message || 'Error') }
    finally { setActionLoading(false) }
  }

  async function handleCheckin() {
    if (!jid || !dayData) return
    setActionLoading(true)
    try {
      let body: any = { believability_score: believability }
      if (dayData.is_milestone_day) {
        body = {
          believability_score: believability,
          doubt_score: doubtScore,
          resistance_score: resistanceScore,
          identity_score: identityScore,
          action_completed: actionCompleted,
          ...(evidenceText.trim() ? { evidence_text: evidenceText.trim() } : {}),
        }
      } else if (dayData.rotating_question) {
        body.rotating_question_key   = dayData.rotating_question
        body.rotating_question_score = rotatingScore
      }
      await journeyApi.submitCheckin(jid, affDay, body)
      await achievements.evaluate(jid)
      await loadDay()
    } catch (e: any) { setError(e.response?.data?.message || 'Error') }
    finally { setActionLoading(false) }
  }

  async function handleReport() {
    if (!jid || reportSent) return
    try {
      await journeyApi.reportAffirmation(jid, affDay)
      setReportSent(true)
    } catch { setReportSent(true) } // show success regardless
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222,20%,8%)' }}>
      <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
    </div>
  )

  const state    = dayData?.state || 'locked'
  const track    = activeJourney?.track || 'confidence'
  const bg       = TRACK_BG[track] || TRACK_BG.confidence
  const accent   = TRACK_ACCENT[track] || TRACK_ACCENT.confidence

  return (
    <div className="min-h-screen pb-24" style={{ background: bg }}>

      {/* Header — dual counter */}
      <div className="flex items-start justify-between px-6 pt-12 pb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Today&apos;s Journey
          </h1>
          <div className="flex gap-3 mt-1.5 text-xs" style={{ color: 'hsl(220,10%,50%)' }}>
            <span>Affirmation Day <strong style={{ color: 'hsl(45,30%,85%)' }}>{affDay}</strong></span>
            <span style={{ color: 'hsl(220,10%,35%)' }}>·</span>
            <span>Calendar Day <strong style={{ color: 'hsl(45,30%,85%)' }}>{calDay}</strong></span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs px-2 py-1 rounded-lg" style={{
            background: state === 'completed' ? accent.glow : 'rgba(255,255,255,0.06)',
            color: state === 'completed' ? accent.primary : 'hsl(45,30%,75%)',
            border: `1px solid ${state === 'completed' ? accent.primary + '4d' : 'rgba(255,255,255,0.1)'}`,
          }}>
            {STATE_LABELS[state] || state}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 mb-5">
        <div className="h-1.5 rounded-full" style={{ background: 'hsl(222,15%,18%)' }}>
          <div className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${(affDay / 21) * 100}%`, background: `linear-gradient(90deg, ${accent.primary}, ${accent.primary}cc)` }} />
        </div>
        <p className="text-xs mt-1 text-right" style={{ color: 'hsl(220,10%,45%)' }}>{affDay}/21 affirmation days</p>
      </div>

      <div className="px-6 space-y-4">

        {/* Doubt → Reframe context card (truth is shown inside the audio player) */}
        {(dayData?.doubt || dayData?.reframe) && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            {dayData.doubt && (
              <div className="px-5 pt-5 pb-3" style={{ background: 'rgba(255,80,80,0.06)' }}>
                <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: 'hsl(0,60%,65%)' }}>The Doubt</p>
                <p className="text-sm italic leading-relaxed" style={{ color: 'hsl(0,20%,70%)' }}>&ldquo;{dayData.doubt}&rdquo;</p>
              </div>
            )}
            {dayData.reframe && (
              <div className="px-5 py-3 pb-5" style={{ background: 'rgba(107,33,168,0.08)' }}>
                <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: '#9333EA' }}>The Reframe</p>
                <p className="text-sm leading-relaxed" style={{ color: 'hsl(270,20%,75%)' }}>{dayData.reframe}</p>
              </div>
            )}
          </div>
        )}

        {/* Morning session */}
        <div className="space-y-3">
          {dayData?.morning_audio_url ? (
            <AudioPlayer
              src={dayData.morning_audio_url}
              label="Morning Affirmation"
              icon="🌅"
              truthStatement={dayData.truth_statement}
              accentColor={accent.primary}
            />
          ) : (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xl">🌅</span>
                <div>
                  <p className="font-semibold">Morning Affirmation</p>
                  <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>
                    {state === 'locked' ? 'Unlocks today' : 'Audio generating…'}
                  </p>
                </div>
              </div>
            </div>
          )}
          {state === 'morning_unlocked' && (
            <button onClick={handleMorningComplete} disabled={actionLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: `linear-gradient(135deg, ${accent.primary}, ${accent.primary}cc)`, color: 'hsl(222,20%,8%)', opacity: actionLoading ? 0.6 : 1 }}>
              {actionLoading ? 'Saving…' : 'Mark Morning Complete ✓'}
            </button>
          )}
        </div>

        {/* Evening session */}
        {['evening_unlocked', 'checkin_unlocked', 'completed'].includes(state) && (
          <div className="space-y-3">
            {dayData?.evening_audio_url ? (
              <AudioPlayer
                src={dayData.evening_audio_url}
                label="Evening Affirmation"
                icon="🌙"
                truthStatement={dayData.truth_statement}
                accentColor="#9333EA"
              />
            ) : (
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">🌙</span>
                  <div>
                    <p className="font-semibold">Evening Affirmation</p>
                    <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Audio generating…</p>
                  </div>
                </div>
              </div>
            )}
            {state === 'evening_unlocked' && (
              <button onClick={handleEveningComplete} disabled={actionLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #6B21A8, #9333EA)', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Saving…' : 'Mark Evening Complete ✓'}
              </button>
            )}
          </div>
        )}

        {/* Check-in */}
        {state === 'checkin_unlocked' && dayData && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">✍️</span>
              <div>
                <p className="font-semibold">Daily Check-in</p>
                <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>
                  {dayData.is_milestone_day ? `Milestone Day ${affDay} — full reflection` : '30-second check-in'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Always: believability */}
              <ScoreSlider label="How believable does today's truth feel?" value={believability} onChange={setBelievability} />

              {dayData.is_milestone_day ? (
                <>
                  <ScoreSlider label="How true does today's doubt feel? (1 = not at all)" value={doubtScore} onChange={setDoubtScore} />
                  <ScoreSlider label="How much resistance did you feel today?" value={resistanceScore} onChange={setResistance} />
                  <ScoreSlider label="How strongly did you act like this new identity?" value={identityScore} onChange={setIdentity} />

                  {/* Action completed */}
                  <div>
                    <p className="text-sm mb-2" style={{ color: 'hsl(220,10%,60%)' }}>Did you complete your action?</p>
                    <div className="flex gap-2">
                      {(['yes', 'partially', 'no'] as const).map(v => (
                        <button key={v} onClick={() => setAction(v)}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all"
                          style={{
                            background: actionCompleted === v ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${actionCompleted === v ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            color: actionCompleted === v ? '#C9A84C' : 'hsl(220,10%,55%)',
                          }}>
                          {v === 'yes' ? '✓ Yes' : v === 'partially' ? '~ Partially' : '✗ No'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Evidence text */}
                  <div>
                    <p className="text-sm mb-2" style={{ color: 'hsl(220,10%,60%)' }}>What evidence did you create today? <span style={{ color: 'hsl(220,10%,40%)' }}>(optional)</span></p>
                    <textarea
                      value={evidenceText}
                      onChange={e => setEvidence(e.target.value)}
                      placeholder="Describe one moment where you acted like your new identity…"
                      rows={3}
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                      style={{ background: 'hsl(222,15%,14%)', border: '1px solid hsl(222,15%,22%)', color: 'hsl(45,30%,88%)' }}
                    />
                  </div>
                </>
              ) : dayData.rotating_question && (
                <ScoreSlider
                  label={ROTATING_LABELS[dayData.rotating_question] || dayData.rotating_question}
                  value={rotatingScore}
                  onChange={setRotating}
                />
              )}

              <button onClick={handleCheckin} disabled={actionLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Saving…' : 'Submit Check-in →'}
              </button>
            </div>
          </div>
        )}

        {/* Today's Action */}
        {dayData?.action_prompt && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(107,33,168,0.12)', border: '1px solid rgba(147,51,234,0.2)' }}>
            <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: '#9333EA' }}>Today&apos;s Action</p>
            <p className="text-sm leading-relaxed" style={{ color: 'hsl(45,30%,85%)' }}>{dayData.action_prompt}</p>
          </div>
        )}

        {/* Cultural sensitivity flag */}
        {dayData?.truth_statement && state !== 'locked' && (
          <button onClick={handleReport} disabled={reportSent}
            className="w-full text-xs py-2 rounded-xl transition-opacity"
            style={{ color: reportSent ? '#4ade80' : 'hsl(220,10%,40%)', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', opacity: reportSent ? 0.8 : 1 }}>
            {reportSent ? '✓ Reported — we\'ll review and regenerate' : 'This affirmation doesn\'t feel right for me →'}
          </button>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>

      <BottomNav active="journey" />
    </div>
  )
}

export function BottomNav({ active }: { active: string }) {
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
          className="flex-1 flex flex-col items-center py-3 text-xs gap-1 transition-colors"
          style={{ color: active === t.label.toLowerCase() ? '#C9A84C' : 'hsl(220,10%,45%)' }}>
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
