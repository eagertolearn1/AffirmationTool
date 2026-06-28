'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useAuthStore } from '@/lib/store'
import { onboarding as onboardingApi, payment as paymentApi } from '@/lib/api'

// ── Enums matching backend validators ────────────────────────
const TRACKS = [
  { id: 'confidence',    label: 'Confidence',    desc: 'Build unshakeable self-belief',    emoji: '💫' },
  { id: 'wealth',        label: 'Wealth',        desc: 'Attract abundance & prosperity',   emoji: '✨' },
  { id: 'career',        label: 'Career',        desc: 'Unlock professional breakthroughs', emoji: '🚀' },
  { id: 'relationships', label: 'Relationships', desc: 'Deepen meaningful connections',    emoji: '❤️' },
  { id: 'health',        label: 'Health',        desc: 'Transform body & energy',          emoji: '🌿' },
  { id: 'peace',         label: 'Peace',         desc: 'Find calm in life\'s chaos',       emoji: '🕊️' },
  { id: 'fitness',       label: 'Fitness',       desc: 'Build strength & discipline',      emoji: '⚡' },
]

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'mr', label: 'Marathi' },
  { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' },
  { id: 'bn', label: 'Bengali' },
  { id: 'gu', label: 'Gujarati' },
  { id: 'kn', label: 'Kannada' },
  { id: 'ml', label: 'Malayalam' },
]

const MUSIC_STYLES = [
  { id: 'calm',       label: 'Calm',       desc: 'Soft, soothing tones',       emoji: '🌊' },
  { id: 'uplifting',  label: 'Uplifting',  desc: 'Energising & motivating',    emoji: '☀️' },
  { id: 'meditative', label: 'Meditative', desc: 'Deep focus & introspection', emoji: '🧘' },
  { id: 'energetic',  label: 'Energetic',  desc: 'High-vibe & powerful',       emoji: '⚡' },
]

const PLANS = [
  { id: 'standard', label: 'Standard', price: '₹999',   tag: '',            color: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)' },
  { id: 'premium',  label: 'Premium',  price: '₹1,999', tag: 'Most Popular', color: 'rgba(201,168,76,0.08)', border: 'rgba(201,168,76,0.4)' },
]

type Step = 'track' | 'story' | 'beliefs' | 'calibration' | 'preferences' | 'payment'
const STEP_ORDER: Step[] = ['track', 'story', 'beliefs', 'calibration', 'preferences', 'payment']

interface Beliefs { inner_voice_belief: string; identity_shift_needed: string; core_belief_to_change: string }

// ── Input styles ──────────────────────────────────────────────
const inputStyle = { background: 'hsl(222,15%,14%)', border: '1px solid hsl(222,15%,22%)', color: 'hsl(45,30%,92%)' }
const textareaClass = 'w-full rounded-xl px-4 py-3 text-sm outline-none resize-none focus:ring-1 focus:ring-amber-500/50'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, _hasHydrated, setActiveJourney } = useAuthStore()

  const [step, setStep]           = useState<Step>('track')
  const [journeyId, setJourneyId] = useState<string | null>(null)
  const [starting, setStarting]   = useState(true)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [rzpReady, setRzpReady]   = useState(false)

  // Form fields
  const [track, setTrack]         = useState('')
  const [problem, setProblem]     = useState('')
  const [goal, setGoal]           = useState('')
  const [beliefs, setBeliefs]     = useState<Beliefs>({
    inner_voice_belief: '',
    identity_shift_needed: '',
    core_belief_to_change: '',
  })
  const [calibPreview, setCalibPreview] = useState<any>(null)
  const [calFeedback, setCalFeedback]   = useState({ day1_believable: 'yes', day21_feel: 'yes' })
  const [language, setLanguage]         = useState('en')
  const [musicStyle, setMusicStyle]     = useState('calm')
  const [crisis, setCrisis]             = useState<any>(null)

  // Conversion moment — preview audio + infographic before payment
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData]       = useState<any>(null)
  const [previewAudioPlaying, setPreviewAudioPlaying] = useState(false)
  const [previewAudioRef]                   = useState<{ el: HTMLAudioElement | null }>({ el: null })

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    startFlow()
  }, [_hasHydrated, user]) // eslint-disable-line

  async function startFlow() {
    try {
      const { data } = await onboardingApi.start()
      setJourneyId(data.journey_id)
      if (data.resumed) {
        const j = data.journey
        if (j.track)             setTrack(j.track)
        if (j.problem_statement) setProblem(j.problem_statement)
        if (j.goal_statement)    setGoal(j.goal_statement)
        if (j.inner_voice_belief) {
          setBeliefs({
            inner_voice_belief:    j.inner_voice_belief    || '',
            identity_shift_needed: j.identity_shift_needed || '',
            core_belief_to_change: j.core_belief_to_change || '',
          })
        }
        const resume: Record<number, Step> = { 1: 'track', 2: 'story', 3: 'beliefs', 4: 'calibration', 5: 'preferences' }
        setStep(resume[data.step_reached] || 'track')
      }
    } catch {
      setError('Could not start onboarding. Please refresh.')
    } finally {
      setStarting(false)
    }
  }

  // ── Step handlers ─────────────────────────────────────────
  async function handleTrack() {
    if (!track || !journeyId) return
    setLoading(true); setError('')
    try {
      await onboardingApi.saveTrack(journeyId, { track })
      setStep('story')
    } catch (e: any) { setError(e.response?.data?.message || 'Error saving track') }
    finally { setLoading(false) }
  }

  async function handleStory() {
    if (problem.trim().length < 10 || goal.trim().length < 10 || !journeyId) {
      setError('Please write at least 10 characters in each field')
      return
    }
    setLoading(true); setError('')
    try {
      const { data: ans } = await onboardingApi.saveAnswers(journeyId, {
        problem_statement: problem,
        goal_statement:    goal,
      })
      if (ans.crisis) { setCrisis(ans); setLoading(false); return }

      // AI surface beliefs
      const { data: beliefsData } = await onboardingApi.surfaceBeliefs(journeyId)
      if (beliefsData.beliefs) {
        setBeliefs({
          inner_voice_belief:    beliefsData.beliefs.inner_voice_belief    || '',
          identity_shift_needed: beliefsData.beliefs.identity_shift_needed || '',
          core_belief_to_change: beliefsData.beliefs.core_belief_to_change || '',
        })
      }
      setStep('beliefs')
    } catch (e: any) { setError(e.response?.data?.message || 'Error — please try again') }
    finally { setLoading(false) }
  }

  async function handleBeliefs() {
    if (!journeyId) return
    if (!beliefs.inner_voice_belief.trim() || !beliefs.identity_shift_needed.trim() || !beliefs.core_belief_to_change.trim()) {
      setError('All three belief fields are required')
      return
    }
    setLoading(true); setError('')
    try {
      const { data: conf } = await onboardingApi.confirmBeliefs(journeyId, beliefs)
      if (conf.crisis) { setCrisis(conf); setLoading(false); return }

      // Calibration preview
      const { data: cal } = await onboardingApi.calibrate(journeyId)
      setCalibPreview(cal.preview)
      setStep('calibration')
    } catch (e: any) { setError(e.response?.data?.message || 'Error') }
    finally { setLoading(false) }
  }

  async function handleCalibration() {
    if (!journeyId) return
    setLoading(true); setError('')
    try {
      const { data } = await onboardingApi.calibrationFeedback(journeyId, calFeedback)
      if (data.preview) setCalibPreview(data.preview)
      setStep('preferences')
    } catch (e: any) { setError(e.response?.data?.message || 'Error') }
    finally { setLoading(false) }
  }

  async function handlePreferences() {
    if (!journeyId) return
    setLoading(true); setError('')
    try {
      await onboardingApi.savePreferences(journeyId, { language, music_style: musicStyle })
      setStep('payment')
      // Kick off preview generation in background — don't block step transition
      triggerPreviewGeneration(journeyId)
    } catch (e: any) { setError(e.response?.data?.message || 'Error saving preferences') }
    finally { setLoading(false) }
  }

  async function triggerPreviewGeneration(jid: string) {
    setPreviewLoading(true)
    try {
      await onboardingApi.generatePreview(jid)
      // Poll for up to 90 seconds
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000))
        try {
          const { data } = await onboardingApi.previewStatus(jid)
          if (data.status === 'completed') {
            setPreviewData(data)
            setPreviewLoading(false)
            return
          }
          if (data.status === 'failed') break
        } catch {}
      }
    } catch {}
    setPreviewLoading(false) // timed out or failed — user can still pay
  }

  function togglePreviewAudio() {
    if (!previewData?.preview_audio_url) return
    if (!previewAudioRef.el) {
      previewAudioRef.el = new Audio(previewData.preview_audio_url)
      previewAudioRef.el.onended = () => setPreviewAudioPlaying(false)
    }
    if (previewAudioPlaying) {
      previewAudioRef.el.pause()
      setPreviewAudioPlaying(false)
    } else {
      previewAudioRef.el.play()
      setPreviewAudioPlaying(true)
    }
  }

  async function handlePayment(planId: string) {
    if (!journeyId || !rzpReady) return
    setLoading(true); setError('')
    try {
      const { data: order } = await paymentApi.createOrder({ plan_id: planId, journey_id: journeyId })
      const options = {
        key:         order.key_id,
        amount:      order.amount,
        currency:    order.currency,
        name:        'AuraLoop',
        description: order.description,
        order_id:    order.order_id,
        prefill:     { email: user?.email || '', name: user?.name || '' },
        theme:       { color: '#C9A84C' },
        handler: async (response: any) => {
          try {
            await paymentApi.verify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              plan_id:             planId,
              journey_id:          journeyId,
            })
            // Full content generation already kicked off during preview (step 5→6 transition)
            // Set active journey and navigate
            setActiveJourney({
              id:                     journeyId,
              track,
              status:                 'active',
              current_affirmation_day: 1,
              current_calendar_day:   1,
              transformation_score:   null,
            })
            router.replace('/journey')
          } catch {
            setError('Payment received but setup failed. Please contact support.')
          }
        },
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', () => { setError('Payment failed. Please try again.'); setLoading(false) })
      rzp.open()
    } catch (e: any) { setError(e.response?.data?.message || 'Payment setup failed') }
    finally { setLoading(false) }
  }

  // ── Crisis banner ─────────────────────────────────────────
  if (crisis) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'hsl(222,20%,8%)' }}>
      <div className="max-w-sm w-full rounded-2xl p-6" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
        <p className="text-2xl mb-3">🆘</p>
        <p className="font-semibold text-red-400 mb-4">{crisis.message}</p>
        {crisis.resources?.map((r: any) => (
          <div key={r.name} className="mb-2 text-sm" style={{ color: 'hsl(45,30%,85%)' }}>
            <strong>{r.name}</strong> — {r.number || r.contact}
          </div>
        ))}
        <button onClick={() => setCrisis(null)} className="mt-4 w-full py-2 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'hsl(45,30%,80%)' }}>
          I'm okay, continue
        </button>
      </div>
    </div>
  )

  if (starting) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222,20%,8%)' }}>
      <div className="text-center space-y-4">
        <div className="w-10 h-10 mx-auto rounded-full animate-spin"
          style={{ border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
        <p style={{ color: 'hsl(220,10%,55%)' }}>Preparing your journey…</p>
      </div>
    </div>
  )

  const stepIndex   = STEP_ORDER.indexOf(step)
  const progressPct = ((stepIndex + 1) / STEP_ORDER.length) * 100

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onReady={() => setRzpReady(true)} />
      <div className="min-h-screen pb-10" style={{ background: 'linear-gradient(160deg, hsl(222,20%,8%) 60%, hsl(270,25%,11%) 100%)' }}>

        {/* Progress bar */}
        <div className="h-1" style={{ background: 'hsl(222,15%,14%)' }}>
          <div className="h-1 transition-all duration-500"
            style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #C9A84C, #E8C97A)' }} />
        </div>

        {/* Header */}
        <div className="px-6 pt-10 pb-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)' }}>
            <span className="text-xl">✦</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AuraLoop
          </h1>
          <p className="text-xs mt-1 uppercase tracking-widest" style={{ color: 'hsl(220,10%,45%)' }}>
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </p>
        </div>

        <div className="px-6 max-w-lg mx-auto space-y-5">

          {/* ── Step 1: Track ─────────────────────────────── */}
          {step === 'track' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>What do you want to transform?</h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Choose the area of your life to focus on</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TRACKS.map(t => (
                  <button key={t.id} onClick={() => setTrack(t.id)}
                    className="rounded-2xl p-4 text-left transition-all"
                    style={{
                      background: track === t.id ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                      border:     track === t.id ? '1.5px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.07)',
                    }}>
                    <span className="text-2xl block mb-2">{t.emoji}</span>
                    <p className="font-semibold text-sm" style={{ color: track === t.id ? '#C9A84C' : 'hsl(45,30%,90%)' }}>{t.label}</p>
                    <p className="text-xs mt-0.5 leading-tight" style={{ color: 'hsl(220,10%,50%)' }}>{t.desc}</p>
                  </button>
                ))}
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button onClick={handleTrack} disabled={!track || loading}
                className="w-full py-4 rounded-xl font-semibold transition-opacity"
                style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: !track || loading ? 0.5 : 1 }}>
                {loading ? 'Saving…' : 'Continue →'}
              </button>
            </div>
          )}

          {/* ── Step 2: Story ─────────────────────────────── */}
          {step === 'story' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Tell me your story</h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Be honest — this shapes your entire 21-day journey</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest font-medium" style={{ color: '#C9A84C' }}>What's holding you back?</label>
                <textarea rows={4} className={textareaClass} style={inputStyle}
                  placeholder="Describe the problem, struggle, or pattern you want to change…"
                  value={problem} onChange={e => setProblem(e.target.value)} />
                <p className="text-xs text-right" style={{ color: 'hsl(220,10%,40%)' }}>{problem.length}/2000</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest font-medium" style={{ color: '#C9A84C' }}>What do you want instead?</label>
                <textarea rows={4} className={textareaClass} style={inputStyle}
                  placeholder="Describe who you want to become and how you want to feel…"
                  value={goal} onChange={e => setGoal(e.target.value)} />
                <p className="text-xs text-right" style={{ color: 'hsl(220,10%,40%)' }}>{goal.length}/2000</p>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              {loading && (
                <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                  <div className="w-5 h-5 rounded-full animate-spin flex-shrink-0"
                    style={{ border: '2px solid rgba(201,168,76,0.3)', borderTopColor: '#C9A84C' }} />
                  <p className="text-sm" style={{ color: 'hsl(45,30%,80%)' }}>AI is analysing your story and surfacing beliefs…</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep('track')} className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'hsl(220,10%,55%)' }}>← Back</button>
                <button onClick={handleStory} disabled={loading}
                  className="flex-[2] py-3 rounded-xl font-semibold text-sm transition-opacity"
                  style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Analysing…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Beliefs ───────────────────────────── */}
          {step === 'beliefs' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Your core beliefs</h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Our AI surfaced these from your story. Edit if needed — these become the foundation of your affirmations</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest font-medium" style={{ color: '#C9A84C' }}>Your inner critic says…</label>
                <textarea rows={2} className={textareaClass} style={inputStyle}
                  placeholder="The negative self-talk that holds you back…"
                  value={beliefs.inner_voice_belief}
                  onChange={e => setBeliefs({ ...beliefs, inner_voice_belief: e.target.value })} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest font-medium" style={{ color: '#C9A84C' }}>The identity shift needed…</label>
                <textarea rows={2} className={textareaClass} style={inputStyle}
                  placeholder="Who do you need to become to achieve your goal?"
                  value={beliefs.identity_shift_needed}
                  onChange={e => setBeliefs({ ...beliefs, identity_shift_needed: e.target.value })} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest font-medium" style={{ color: '#C9A84C' }}>The core belief to rewire…</label>
                <textarea rows={2} className={textareaClass} style={inputStyle}
                  placeholder="The root belief that, if changed, would transform everything…"
                  value={beliefs.core_belief_to_change}
                  onChange={e => setBeliefs({ ...beliefs, core_belief_to_change: e.target.value })} />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              {loading && (
                <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                  <div className="w-5 h-5 rounded-full animate-spin flex-shrink-0"
                    style={{ border: '2px solid rgba(201,168,76,0.3)', borderTopColor: '#C9A84C' }} />
                  <p className="text-sm" style={{ color: 'hsl(45,30%,80%)' }}>Generating your personalised calibration preview…</p>
                </div>
              )}

              <p className="text-xs text-center" style={{ color: 'hsl(220,10%,40%)' }}>
                Not sure? <button onClick={handleBeliefs} className="underline" style={{ color: '#C9A84C' }}>Skip for now</button> — you can refine these later
              </p>

              <div className="flex gap-3">
                <button onClick={() => setStep('story')} className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'hsl(220,10%,55%)' }}>← Back</button>
                <button onClick={handleBeliefs} disabled={loading}
                  className="flex-[2] py-3 rounded-xl font-semibold text-sm"
                  style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Processing…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Calibration ───────────────────────── */}
          {step === 'calibration' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Your journey preview</h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Here's a glimpse of your first truth statement and where Day 21 leads</p>
              </div>

              {calibPreview && (
                <div className="space-y-3">
                  {/* Day 1 */}
                  {calibPreview.day1_truth && (
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.2)', color: '#C9A84C' }}>Day 1</span>
                        <span className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Where you begin</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'hsl(45,30%,90%)' }}>{calibPreview.day1_truth}</p>
                    </div>
                  )}
                  {/* Day 7 */}
                  {calibPreview.day7_truth && (
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>Day 7</span>
                        <span className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Building momentum</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'hsl(45,30%,90%)' }}>{calibPreview.day7_truth}</p>
                    </div>
                  )}
                  {/* Day 14 */}
                  {calibPreview.day14_truth && (
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}>Day 14</span>
                        <span className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Deepening identity</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'hsl(45,30%,90%)' }}>{calibPreview.day14_truth}</p>
                    </div>
                  )}
                  {/* Day 21 */}
                  {calibPreview.day21_vision && (
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(107,33,168,0.08)', border: '1px solid rgba(147,51,234,0.2)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(147,51,234,0.15)', color: '#A78BFA' }}>Day 21</span>
                        <span className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>Your new identity</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'hsl(45,30%,90%)' }}>{calibPreview.day21_vision}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-sm font-medium" style={{ color: 'hsl(45,30%,85%)' }}>Does this feel right?</p>

                <div>
                  <p className="text-xs mb-2" style={{ color: 'hsl(220,10%,55%)' }}>Day 1 affirmation feels…</p>
                  <div className="flex gap-2">
                    {[
                      { val: 'yes', label: 'Just right' },
                      { val: 'slightly_too_big', label: 'Slightly big' },
                      { val: 'way_too_big', label: 'Way too big' },
                    ].map(o => (
                      <button key={o.val} onClick={() => setCalFeedback({ ...calFeedback, day1_believable: o.val })}
                        className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                        style={{
                          background: calFeedback.day1_believable === o.val ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                          border:     calFeedback.day1_believable === o.val ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.08)',
                          color:      calFeedback.day1_believable === o.val ? '#C9A84C' : 'hsl(220,10%,55%)',
                        }}>{o.label}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs mb-2" style={{ color: 'hsl(220,10%,55%)' }}>Day 21 vision feels…</p>
                  <div className="flex gap-2">
                    {[
                      { val: 'yes', label: 'Just right' },
                      { val: 'too_small', label: 'Too small' },
                      { val: 'too_big', label: 'Too big' },
                    ].map(o => (
                      <button key={o.val} onClick={() => setCalFeedback({ ...calFeedback, day21_feel: o.val })}
                        className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                        style={{
                          background: calFeedback.day21_feel === o.val ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                          border:     calFeedback.day21_feel === o.val ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.08)',
                          color:      calFeedback.day21_feel === o.val ? '#C9A84C' : 'hsl(220,10%,55%)',
                        }}>{o.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep('beliefs')} className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'hsl(220,10%,55%)' }}>← Back</button>
                <button onClick={handleCalibration} disabled={loading}
                  className="flex-[2] py-3 rounded-xl font-semibold text-sm"
                  style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Saving…' : 'This looks good →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Preferences ───────────────────────── */}
          {step === 'preferences' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Personalise your experience</h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Choose your affirmation language and background music style</p>
              </div>

              {/* Language */}
              <div>
                <p className="text-xs uppercase tracking-widest font-medium mb-3" style={{ color: '#C9A84C' }}>Language</p>
                <div className="grid grid-cols-4 gap-2">
                  {LANGUAGES.map(l => (
                    <button key={l.id} onClick={() => setLanguage(l.id)}
                      className="py-2.5 rounded-xl text-xs font-medium transition-all"
                      style={{
                        background: language === l.id ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                        border:     language === l.id ? '1.5px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.07)',
                        color:      language === l.id ? '#C9A84C' : 'hsl(220,10%,55%)',
                      }}>{l.label}</button>
                  ))}
                </div>
              </div>

              {/* Music style */}
              <div>
                <p className="text-xs uppercase tracking-widest font-medium mb-3" style={{ color: '#C9A84C' }}>Background Music</p>
                <div className="grid grid-cols-2 gap-3">
                  {MUSIC_STYLES.map(m => (
                    <button key={m.id} onClick={() => setMusicStyle(m.id)}
                      className="rounded-2xl p-4 text-left transition-all"
                      style={{
                        background: musicStyle === m.id ? 'rgba(201,168,76,0.10)' : 'rgba(255,255,255,0.04)',
                        border:     musicStyle === m.id ? '1.5px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.07)',
                      }}>
                      <span className="text-xl block mb-1">{m.emoji}</span>
                      <p className="text-sm font-semibold" style={{ color: musicStyle === m.id ? '#C9A84C' : 'hsl(45,30%,90%)' }}>{m.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,50%)' }}>{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep('calibration')} className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'hsl(220,10%,55%)' }}>← Back</button>
                <button onClick={handlePreferences} disabled={loading}
                  className="flex-[2] py-3 rounded-xl font-semibold text-sm"
                  style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Saving…' : 'Choose Plan →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 6: Payment ───────────────────────────── */}
          {step === 'payment' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>Your Day 1 is ready</h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,50%)' }}>Here's a preview of what your journey begins with</p>
              </div>

              {/* ── Conversion moment: Day 1 preview ─────── */}
              {previewLoading && !previewData && (
                <div className="rounded-2xl p-6 flex items-center gap-4" style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)' }}>
                  <div className="w-8 h-8 rounded-full animate-spin flex-shrink-0"
                    style={{ border: '2px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'hsl(45,30%,90%)' }}>Crafting your Day 1 affirmation…</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,50%)' }}>AI is personalising your first audio and infographic</p>
                  </div>
                </div>
              )}

              {previewData && (
                <div className="space-y-3">
                  {/* Infographic card */}
                  {previewData.infographic_url && (
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(201,168,76,0.2)' }}>
                      <img src={previewData.infographic_url} alt="Day 1 Affirmation Card"
                        className="w-full" style={{ display: 'block' }} />
                    </div>
                  )}

                  {/* Truth statement (shown if infographic failed) */}
                  {!previewData.infographic_url && previewData.truth_statement && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)' }}>
                      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#C9A84C' }}>Your Day 1 Truth</p>
                      <p className="text-sm leading-relaxed font-medium" style={{ color: 'hsl(45,30%,92%)' }}>{previewData.truth_statement}</p>
                    </div>
                  )}

                  {/* Audio preview player */}
                  {previewData.preview_audio_url && (
                    <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button onClick={togglePreviewAudio}
                        className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center transition-all active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)' }}>
                        <span className="text-lg text-black">{previewAudioPlaying ? '⏸' : '▶'}</span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'hsl(45,30%,90%)' }}>15-second preview</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(220,10%,50%)' }}>Your personalised morning affirmation</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(201,168,76,0.1)', color: '#C9A84C' }}>
                        {previewAudioPlaying ? 'Playing…' : 'Tap to hear'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

              <div>
                <p className="text-base font-semibold mb-1" style={{ color: 'hsl(45,30%,92%)' }}>Unlock your full 21-day journey</p>
                <p className="text-sm" style={{ color: 'hsl(220,10%,50%)' }}>One-time payment · Lifetime access · 42 personalised audio files</p>
              </div>

              {/* Plan cards */}
              <div className="space-y-3">
                {/* Standard */}
                <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-lg" style={{ color: 'hsl(45,30%,92%)' }}>Standard</p>
                      <p className="text-sm" style={{ color: 'hsl(220,10%,50%)' }}>21 days · AI coaching · Daily affirmations</p>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: 'hsl(45,30%,92%)' }}>₹999</p>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {['21 personalised affirmation days', 'Morning & evening audio', '5 AI coaching messages/day', 'Progress tracking & achievement badges'].map(f => (
                      <li key={f} className="text-sm flex items-center gap-2" style={{ color: 'hsl(220,10%,60%)' }}>
                        <span style={{ color: '#C9A84C' }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => handlePayment('standard')} disabled={loading || !rzpReady}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'hsl(45,30%,88%)', opacity: loading || !rzpReady ? 0.6 : 1 }}>
                    {loading ? 'Processing…' : 'Start Standard →'}
                  </button>
                </div>

                {/* Premium */}
                <div className="rounded-2xl p-5 relative" style={{ background: 'rgba(201,168,76,0.07)', border: '1.5px solid rgba(201,168,76,0.4)' }}>
                  <div className="absolute -top-3 left-5">
                    <span className="text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)' }}>Most Popular</span>
                  </div>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-lg" style={{ color: '#E8C97A' }}>Premium</p>
                      <p className="text-sm" style={{ color: 'hsl(220,10%,50%)' }}>Everything in Standard + more</p>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: '#E8C97A' }}>₹1,999</p>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {[
                      'Everything in Standard',
                      'Voice cloning (Hindi & English)',
                      '20 AI coaching messages/day',
                      'Priority content generation',
                    ].map(f => (
                      <li key={f} className="text-sm flex items-center gap-2" style={{ color: 'hsl(45,30%,70%)' }}>
                        <span style={{ color: '#C9A84C' }}>✦</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => handlePayment('premium')} disabled={loading || !rzpReady}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading || !rzpReady ? 0.6 : 1 }}>
                    {loading ? 'Processing…' : 'Start Premium ✦'}
                  </button>
                </div>
              </div>

              {!rzpReady && (
                <p className="text-xs text-center" style={{ color: 'hsl(220,10%,45%)' }}>Loading payment gateway…</p>
              )}

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <div className="text-center">
                <p className="text-xs" style={{ color: 'hsl(220,10%,40%)' }}>Secured by Razorpay · No recurring charges</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
