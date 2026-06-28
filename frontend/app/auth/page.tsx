'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

type Step = 'email' | 'otp' | 'name'

export default function AuthPage() {
  const router = useRouter()
  const { setUser, user, _hasHydrated } = useAuthStore()

  // If already logged in, go home
  useEffect(() => {
    if (_hasHydrated && user) router.replace('/')
  }, [user, _hasHydrated, router])

  const [step, setStep]             = useState<Step>('email')
  const [email, setEmail]           = useState('')
  const [name, setName]             = useState('')
  const [phone, setPhone]           = useState('')
  const [whatsappOptIn, setWhatsappOptIn] = useState(false) // MUST default to false (regulatory)
  const [ageConfirmed, setAgeConfirmed]   = useState(false)
  const [otp, setOtp]               = useState('')
  const [isNew, setIsNew]           = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleEmail() {
    if (!email.includes('@')) { setError('Enter a valid email'); return }
    setLoading(true); setError('')
    try {
      await auth.requestOtp(email)
      setStep('otp')
    } catch (e: any) {
      if (e.response?.status === 404) {
        // New user — collect name first
        setIsNew(true)
        setStep('name')
      } else {
        setError(e.response?.data?.message || 'Something went wrong')
      }
    } finally { setLoading(false) }
  }

  async function handleSignup() {
    if (!name.trim()) { setError('Enter your name'); return }
    if (!ageConfirmed) { setError('Please confirm you are 18 or older to continue'); return }
    if (whatsappOptIn && phone && !/^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ''))) {
      setError('Enter a valid phone number (e.g. +91 98765 43210)'); return
    }
    setLoading(true); setError('')
    try {
      await auth.signupFull(email, name, whatsappOptIn ? phone : '', whatsappOptIn)
      setStep('otp')
    } catch (e: any) {
      setError(e.response?.data?.message || 'Signup failed')
    } finally { setLoading(false) }
  }

  async function handleOtp() {
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return }
    setLoading(true); setError('')
    try {
      const { data } = await auth.verifyOtp(email, otp)
      localStorage.setItem('access_token', data.accessToken)
      setUser(data.user)
      router.push('/')
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid OTP')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'linear-gradient(160deg, hsl(222,20%,8%) 60%, hsl(270,30%,12%) 100%)' }}>
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)' }}>
          <span className="text-2xl">✦</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AuraLoop
        </h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(220,10%,55%)' }}>21-Day Identity Transformation</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {step === 'email' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Welcome back</h2>
            <p style={{ color: 'hsl(220,10%,55%)', fontSize: '0.875rem' }}>Enter your email to continue</p>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEmail()}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-1"
              style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,20%)', color: 'hsl(45,30%,92%)', '--tw-ring-color': '#C9A84C' } as any}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleEmail} disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Sending…' : 'Continue →'}
            </button>
          </div>
        )}

        {step === 'name' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Create your account</h2>
            <p style={{ color: 'hsl(220,10%,55%)', fontSize: '0.875rem' }}>Tell us a little about you</p>

            {/* Name */}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'hsl(220,10%,55%)' }}>Your name</label>
              <input
                type="text"
                placeholder="e.g. Aditya"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,20%)', color: 'hsl(45,30%,92%)' }}
              />
            </div>

            {/* Age gate — required */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={e => setAgeConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-yellow-400 flex-shrink-0"
                />
                <span className="text-sm" style={{ color: 'hsl(45,30%,85%)' }}>
                  I confirm I am 18 years or older
                </span>
              </label>
            </div>

            {/* WhatsApp opt-in */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)' }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappOptIn}
                  onChange={e => setWhatsappOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-green-400 flex-shrink-0"
                />
                <span className="text-sm" style={{ color: 'hsl(45,30%,85%)' }}>
                  Send me daily reminders and affirmation nudges on WhatsApp
                </span>
              </label>

              {whatsappOptIn && (
                <div className="mt-3">
                  <label className="block text-xs mb-1" style={{ color: 'hsl(220,10%,55%)' }}>WhatsApp number (with country code)</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,22%)', color: 'hsl(45,30%,92%)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'hsl(220,10%,45%)' }}>
                    You can opt out any time from your profile. Msgs via WhatsApp Business.
                  </p>
                </div>
              )}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleSignup} disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creating…' : 'Send OTP →'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Check your email</h2>
            <p style={{ color: 'hsl(220,10%,55%)', fontSize: '0.875rem' }}>
              We sent a 6-digit code to <strong style={{ color: 'hsl(45,30%,92%)' }}>{email}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleOtp()}
              className="w-full rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest outline-none"
              style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,20%)', color: 'hsl(45,30%,92%)' }}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleOtp} disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Verifying…' : 'Verify & Enter →'}
            </button>
            <button onClick={() => { setStep('email'); setOtp(''); setError('') }}
              className="w-full text-sm py-2"
              style={{ color: 'hsl(220,10%,55%)' }}>
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-center text-xs mt-6 px-4" style={{ color: 'hsl(220,10%,38%)' }}>
        AuraLoop is for personal growth and self-development. It is not a substitute for professional mental health care. Users must be 18 or above.
      </p>
    </div>
  )
}
