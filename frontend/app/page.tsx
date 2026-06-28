'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { journey } from '@/lib/api'
import Link from 'next/link'

// ─── Sample audio URL — replace with your real R2 signed URL ─
const SAMPLE_AUDIO_URL = process.env.NEXT_PUBLIC_SAMPLE_AUDIO_URL || ''

export default function LandingPage() {
  const router = useRouter()
  const { user, _hasHydrated, setActiveJourney } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [playing, setPlaying]   = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { setChecking(false); return }

    // Logged-in: route to correct place
    journey.getCurrent().then(({ data }) => {
      if (data.status === 'active') {
        setActiveJourney({
          id: data.journey_id, track: data.track, status: data.status,
          current_affirmation_day: data.current_affirmation_day,
          current_calendar_day: data.current_calendar_day,
          transformation_score: data.transformation_score,
        })
        router.replace('/journey')
      } else {
        router.replace('/onboarding')
      }
    }).catch(() => router.replace('/auth'))
  }, [user, _hasHydrated])

  function toggleAudio() {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  if (checking && _hasHydrated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222,20%,8%)' }}>
        <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(222,20%,8%)', color: 'hsl(45,30%,92%)' }}>
      {/* Hidden audio element */}
      {SAMPLE_AUDIO_URL && (
        <audio ref={audioRef} src={SAMPLE_AUDIO_URL} onEnded={() => setPlaying(false)} />
      )}

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 sticky top-0 z-50"
        style={{ background: 'rgba(18,22,32,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xl" style={{ color: '#C9A84C' }}>✦</span>
          <span className="font-bold text-lg tracking-tight" style={{ color: 'hsl(45,30%,92%)' }}>AuraLoop</span>
        </div>
        <Link href="/auth"
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)' }}>
          Get Started
        </Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-12 text-center"
        style={{ background: 'linear-gradient(160deg, hsl(222,20%,10%) 0%, hsl(270,25%,12%) 100%)' }}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
          style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C' }}>
          ✦ AI-Powered Identity Change · 21 Days
        </div>
        <h1 className="text-4xl font-bold leading-tight mb-4" style={{ letterSpacing: '-0.02em' }}>
          Change who you are,<br />
          <span style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            not just what you do
          </span>
        </h1>
        <p className="text-base leading-relaxed max-w-sm mx-auto mb-8" style={{ color: 'hsl(220,10%,60%)' }}>
          AuraLoop rewires your self-concept through daily audio affirmations, AI coaching, and science-backed identity shifts — in 21 days.
        </p>
        <Link href="/auth"
          className="inline-block px-8 py-4 rounded-2xl font-bold text-base"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)' }}>
          Start My 21-Day Journey →
        </Link>
        <p className="text-xs mt-3" style={{ color: 'hsl(220,10%,40%)' }}>
          Standard ₹999 · Premium ₹1,999 · One-time payment
        </p>
      </section>

      {/* ── Sample Audio Player ──────────────────────────────── */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'hsl(45,30%,92%)' }}>Hear What Day 1 Sounds Like</h2>
        <p className="text-sm text-center mb-6" style={{ color: 'hsl(220,10%,50%)' }}>
          Your morning affirmation — crafted for your identity track, in your language.
        </p>

        <div className="max-w-sm mx-auto rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {/* Waveform visual */}
          <div className="flex items-center gap-1 justify-center mb-5 h-10">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="rounded-full"
                style={{
                  width: 3,
                  height: playing ? `${8 + Math.abs(Math.sin(i * 0.5 + Date.now() / 300)) * 24}px` : `${6 + Math.sin(i * 0.7) * 10 + 10}px`,
                  background: playing ? '#C9A84C' : 'rgba(201,168,76,0.35)',
                  transition: 'height 0.15s ease',
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={SAMPLE_AUDIO_URL ? toggleAudio : undefined}
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-xl"
              style={{
                background: 'linear-gradient(135deg, #C9A84C, #E8C97A)',
                color: 'hsl(222,20%,8%)',
                cursor: SAMPLE_AUDIO_URL ? 'pointer' : 'not-allowed',
                opacity: SAMPLE_AUDIO_URL ? 1 : 0.6,
              }}>
              {playing ? '⏸' : '▶'}
            </button>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'hsl(45,30%,92%)' }}>Day 1 Morning Affirmation</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,50%)' }}>
                {SAMPLE_AUDIO_URL ? 'Confidence track · English · 45s' : 'Sample available after launch'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section className="px-6 py-10" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'hsl(45,30%,92%)' }}>How AuraLoop Works</h2>
        <p className="text-sm text-center mb-8" style={{ color: 'hsl(220,10%,50%)' }}>
          Three steps. 21 days. A new identity.
        </p>
        <div className="space-y-4 max-w-sm mx-auto">
          {[
            { step: '1', icon: '🧠', title: 'Set your identity goal', desc: 'Tell us who you want to become — confident, calm, disciplined, or more. We map your current beliefs vs. your target identity.' },
            { step: '2', icon: '🎧', title: 'Daily audio rituals', desc: 'Every morning and evening, a 45-second personalised affirmation in your language. Designed to address your actual doubts, not generic positivity.' },
            { step: '3', icon: '📈', title: 'Track your shift', desc: 'Check in daily. Watch your Transformation Score climb. See your believability rise, your doubt drop, your identity solidify.' },
          ].map(item => (
            <div key={item.step} className="flex gap-4 rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)' }}>
                {item.icon}
              </div>
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: 'hsl(45,30%,92%)' }}>{item.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'hsl(220,10%,55%)' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Science Section ──────────────────────────────────── */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'hsl(45,30%,92%)' }}>Built on Science</h2>
        <p className="text-sm text-center mb-8" style={{ color: 'hsl(220,10%,50%)' }}>
          Not affirmation woo. Neuroscience-backed identity work.
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
          {[
            { icon: '🔁', title: 'Neuroplasticity', desc: '21 days of repetition creates measurable neural pathway changes' },
            { icon: '🪞', title: 'Identity Theory', desc: 'Self-concept precedes behaviour — change the identity, change the action' },
            { icon: '🎙️', title: 'Spaced Repetition', desc: 'Morning + evening audio encodes beliefs across sleep cycles' },
            { icon: '📊', title: 'Cognitive Reframing', desc: 'Doubt → Reframe → Truth structure dismantles limiting beliefs' },
          ].map(item => (
            <div key={item.title} className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-2xl">{item.icon}</span>
              <p className="font-semibold text-xs mt-2 mb-1" style={{ color: 'hsl(45,30%,92%)' }}>{item.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'hsl(220,10%,50%)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sample Infographic ───────────────────────────────── */}
      <section className="px-6 py-10" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'hsl(45,30%,92%)' }}>What You Get Each Day</h2>
        <p className="text-sm text-center mb-6" style={{ color: 'hsl(220,10%,50%)' }}>A shareable progress card you can keep or post.</p>
        {/* Progress card mockup */}
        <div className="max-w-xs mx-auto rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, hsl(222,20%,13%), hsl(270,25%,14%))', border: '1px solid rgba(201,168,76,0.25)' }}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>✦ AuraLoop</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.12)', color: '#C9A84C' }}>Day 7 of 21</span>
            </div>
            <p className="text-sm font-semibold leading-snug mb-4" style={{ color: 'hsl(45,30%,92%)' }}>
              "I am someone who leads with calm confidence, even when the stakes are high."
            </p>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'hsl(220,10%,55%)' }}>
                  <span>Believability</span><span style={{ color: '#C9A84C' }}>7/10 (+3 since Day 1)</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: '70%', background: 'linear-gradient(90deg, #C9A84C, #E8C97A)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'hsl(220,10%,55%)' }}>
                  <span>Doubt Score</span><span style={{ color: '#60a5fa' }}>4/10 (↓ from 8)</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: '40%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <span className="text-2xl font-bold" style={{ color: '#C9A84C' }}>68</span>
              <span className="text-xs ml-1" style={{ color: 'hsl(220,10%,50%)' }}>Transformation Score</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tracks ───────────────────────────────────────────── */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'hsl(45,30%,92%)' }}>Choose Your Identity Track</h2>
        <p className="text-sm text-center mb-6" style={{ color: 'hsl(220,10%,50%)' }}>9 tracks. Each targets a different identity shift.</p>
        <div className="flex flex-wrap gap-2 justify-center max-w-sm mx-auto">
          {[
            'Confidence', 'Calm & Focus', 'Discipline', 'Self-Worth',
            'Leadership', 'Resilience', 'Abundance', 'Relationships', 'Health',
          ].map(t => (
            <span key={t} className="px-3 py-1.5 rounded-xl text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'hsl(45,30%,82%)' }}>
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section className="px-6 py-10" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'hsl(45,30%,92%)' }}>Simple Pricing</h2>
        <p className="text-sm text-center mb-8" style={{ color: 'hsl(220,10%,50%)' }}>One-time payment. No subscription. 21 days.</p>
        <div className="space-y-4 max-w-sm mx-auto">
          {[
            {
              name: 'Standard', price: '₹999', tag: '',
              features: ['9 identity tracks', '21-day personalised affirmations', 'AI Coach (20 msgs/day)', 'Progress dashboard', '9 Indian languages'],
            },
            {
              name: 'Premium', price: '₹1,999', tag: 'Most Popular',
              features: ['Everything in Standard', 'Unlimited AI coaching', 'Voice personalisation', 'WhatsApp nudges', 'Priority support', 'Progress infographic cards'],
            },
          ].map(plan => (
            <div key={plan.name} className="rounded-2xl p-5 relative"
              style={{
                background: plan.tag ? 'linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.04))' : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${plan.tag ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.07)'}`,
              }}>
              {plan.tag && (
                <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(201,168,76,0.2)', color: '#C9A84C' }}>
                  {plan.tag}
                </span>
              )}
              <p className="font-bold text-base mb-0.5" style={{ color: 'hsl(45,30%,92%)' }}>{plan.name}</p>
              <p className="text-3xl font-bold mb-4" style={{ color: '#C9A84C' }}>{plan.price}</p>
              <ul className="space-y-1.5 mb-5">
                {plan.features.map(f => (
                  <li key={f} className="text-xs flex gap-2" style={{ color: 'hsl(220,10%,65%)' }}>
                    <span style={{ color: '#C9A84C' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth"
                className="block w-full text-center py-3 rounded-xl font-semibold text-sm"
                style={{
                  background: plan.tag ? 'linear-gradient(135deg, #C9A84C, #E8C97A)' : 'rgba(255,255,255,0.06)',
                  color: plan.tag ? 'hsl(222,20%,8%)' : 'hsl(45,30%,85%)',
                  border: plan.tag ? 'none' : '1px solid rgba(255,255,255,0.1)',
                }}>
                Get Started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="px-6 py-14 text-center"
        style={{ background: 'linear-gradient(160deg, hsl(270,25%,10%) 0%, hsl(222,20%,10%) 100%)' }}>
        <p className="text-3xl font-bold mb-3" style={{ lineHeight: 1.2 }}>
          Your identity is not<br />
          <span style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            fixed.
          </span>
        </p>
        <p className="text-sm mb-8 max-w-xs mx-auto" style={{ color: 'hsl(220,10%,55%)' }}>
          21 days from now, you could be living from a different story about yourself. That starts today.
        </p>
        <Link href="/auth"
          className="inline-block px-10 py-4 rounded-2xl font-bold text-base"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)' }}>
          Begin My Transformation
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="px-6 py-8 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span style={{ color: '#C9A84C' }}>✦</span>
          <span className="font-bold" style={{ color: 'hsl(45,30%,80%)' }}>AuraLoop</span>
        </div>
        <p className="text-xs mb-4" style={{ color: 'hsl(220,10%,40%)' }}>
          AuraLoop is for personal growth and self-development. It is not a substitute for professional mental health care. Users must be 18 or above.
        </p>
        <div className="flex justify-center gap-6 text-xs" style={{ color: 'hsl(220,10%,40%)' }}>
          <a href="mailto:support@auraloop.in" className="hover:text-amber-400 transition-colors">Support</a>
          <Link href="/auth" className="hover:text-amber-400 transition-colors">Login</Link>
        </div>
      </footer>
    </div>
  )
}
