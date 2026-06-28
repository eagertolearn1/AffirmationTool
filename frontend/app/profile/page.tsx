'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { user as userApi, auth } from '@/lib/api'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const { user, logout, _hasHydrated } = useAuthStore()
  const [profile, setProfile]           = useState<any>(null)
  const [name, setName]                 = useState('')
  const [saving, setSaving]             = useState(false)
  const [msg, setMsg]                   = useState('')
  const [whatsappOn, setWhatsappOn]     = useState(false)
  const [whatsappNum, setWhatsappNum]   = useState('')
  const [waMsg, setWaMsg]               = useState('')
  const [savingWa, setSavingWa]         = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm]     = useState('')
  const [deleting, setDeleting]               = useState(false)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/auth'); return }
    userApi.getProfile().then(({ data }) => {
      setProfile(data.user)
      setName(data.user.name)
      setWhatsappOn(data.user.whatsapp_opted_in || false)
      setWhatsappNum(data.user.whatsapp_number || '')
    })
  }, [user])

  async function handleSave() {
    setSaving(true); setMsg('')
    try {
      await userApi.updateProfile({ name })
      setMsg('Saved ✓')
    } catch { setMsg('Error saving') }
    finally { setSaving(false) }
  }

  async function handleLogout() {
    try { await auth.logout() } catch {}
    logout()
    router.replace('/auth')
  }

  async function handleSaveWhatsApp() {
    setSavingWa(true); setWaMsg('')
    try {
      await userApi.updateProfile({ whatsapp_opted_in: whatsappOn, whatsapp_number: whatsappOn ? whatsappNum : '' })
      setWaMsg('Saved ✓')
    } catch { setWaMsg('Error saving') }
    finally { setSavingWa(false) }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.toLowerCase() !== 'delete') return
    setDeleting(true)
    try {
      await userApi.deleteAccount()
      logout()
      router.replace('/auth')
    } catch { setDeleting(false); setShowDeleteModal(false) }
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: 'hsl(222,20%,8%)' }}>
      <div className="px-6 pt-12 pb-6">
        <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Profile
        </h1>
      </div>

      <div className="px-6 space-y-4">
        {/* Avatar + tier */}
        <div className="rounded-2xl p-6 flex items-center gap-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)' }}>
            {profile?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold text-lg" style={{ color: 'hsl(45,30%,92%)' }}>{profile?.name}</p>
            <p className="text-sm" style={{ color: 'hsl(220,10%,50%)' }}>{profile?.email}</p>
            <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: profile?.subscription_tier === 'premium' ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)', color: profile?.subscription_tier === 'premium' ? '#C9A84C' : 'hsl(220,10%,60%)' }}>
              {profile?.subscription_tier === 'premium' ? '✦ Premium' : 'Standard'}
            </span>
          </div>
        </div>

        {/* Edit name */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'hsl(45,30%,85%)' }}>Display Name</p>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,22%)', color: 'hsl(45,30%,92%)' }} />
          {msg && <p className="text-xs mb-2" style={{ color: msg.includes('✓') ? '#C9A84C' : '#f87171' }}>{msg}</p>}
          <button onClick={handleSave} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: 'hsl(222,20%,8%)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* WhatsApp preferences */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.15)' }}>
          <p className="text-sm font-semibold" style={{ color: 'hsl(45,30%,90%)' }}>WhatsApp Reminders</p>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm" style={{ color: 'hsl(220,10%,60%)' }}>Daily affirmation reminders</span>
            <button onClick={() => setWhatsappOn(!whatsappOn)}
              className="w-11 h-6 rounded-full transition-colors flex items-center px-0.5"
              style={{ background: whatsappOn ? 'rgba(37,211,102,0.6)' : 'rgba(255,255,255,0.12)' }}>
              <span className="w-5 h-5 rounded-full bg-white transition-transform block"
                style={{ transform: whatsappOn ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </label>
          {whatsappOn && (
            <div>
              <label className="block text-xs mb-1" style={{ color: 'hsl(220,10%,50%)' }}>WhatsApp number (with country code)</label>
              <input value={whatsappNum} onChange={e => setWhatsappNum(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'hsl(222,15%,16%)', border: '1px solid hsl(222,15%,22%)', color: 'hsl(45,30%,92%)' }} />
            </div>
          )}
          {waMsg && <p className="text-xs" style={{ color: waMsg.includes('✓') ? '#4ade80' : '#f87171' }}>{waMsg}</p>}
          <button onClick={handleSaveWhatsApp} disabled={savingWa}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', color: '#4ade80', opacity: savingWa ? 0.6 : 1 }}>
            {savingWa ? 'Saving…' : 'Save WhatsApp Settings'}
          </button>
        </div>

        {/* Links */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Payment History', href: '/payment-history' },
            { label: 'Export My Data', href: '/data-export' },
            { label: 'Contact Support', href: 'mailto:support@auraloop.in' },
          ].map((item, i) => (
            <Link key={item.href} href={item.href}
              className="flex items-center justify-between px-5 py-4 text-sm transition-colors hover:bg-white/5"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', color: 'hsl(45,30%,85%)' }}>
              {item.label}
              <span style={{ color: 'hsl(220,10%,45%)' }}>→</span>
            </Link>
          ))}
        </div>

        {/* Legal */}
        <p className="text-xs text-center px-2 leading-relaxed" style={{ color: 'hsl(220,10%,35%)' }}>
          AuraLoop is for personal growth only — not a substitute for professional mental health care. For support, contact <a href="mailto:support@auraloop.in" className="underline">support@auraloop.in</a>
        </p>

        {/* Logout */}
        <button onClick={handleLogout}
          className="w-full py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          Log Out
        </button>

        {/* Delete account */}
        <button onClick={() => setShowDeleteModal(true)}
          className="w-full py-2.5 text-xs"
          style={{ color: 'hsl(220,10%,35%)' }}>
          Delete Account
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'hsl(222,18%,12%)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <h3 className="font-bold text-lg text-red-400">Delete Account</h3>
            <p className="text-sm" style={{ color: 'hsl(45,30%,75%)' }}>
              This permanently deletes your account, journey data, and all audio files. This cannot be undone.
            </p>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'hsl(220,10%,50%)' }}>Type "delete" to confirm</label>
              <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="delete"
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: 'hsl(222,15%,16%)', border: '1px solid rgba(239,68,68,0.3)', color: 'hsl(45,30%,92%)' }} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm('') }}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'hsl(220,10%,60%)' }}>Cancel</button>
              <button onClick={handleDeleteAccount}
                disabled={deleteConfirm.toLowerCase() !== 'delete' || deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', opacity: deleteConfirm.toLowerCase() !== 'delete' || deleting ? 0.4 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="profile" />
    </div>
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
