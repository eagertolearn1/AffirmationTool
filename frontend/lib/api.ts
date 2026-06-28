import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send refresh cookie
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token from store on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
        localStorage.setItem('access_token', data.accessToken)
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        localStorage.removeItem('access_token')
        window.location.href = '/auth'
      }
    }
    return Promise.reject(error)
  }
)

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  requestOtp:  (email: string)                    => api.post('/auth/login', { email }),
  verifyOtp:   (email: string, otp: string)       => api.post('/auth/verify-otp', { email, otp }),
  signup:      (email: string, name: string)      => api.post('/auth/signup', { email, name, age_confirmed: true, whatsapp_opted_in: false }),
  signupFull:  (email: string, name: string, phone: string, whatsappOptIn: boolean) =>
    api.post('/auth/signup', { email, name, age_confirmed: true, whatsapp_opted_in: whatsappOptIn, whatsapp_number: phone || undefined }),
  refresh:     ()                                  => api.post('/auth/refresh'),
  logout:      ()                                  => api.post('/auth/logout'),
}

// ── Journey ──────────────────────────────────────────────────
export const journey = {
  create:           ()                             => api.post('/journey/create'),
  get:              (id: string)                   => api.get(`/journey/${id}`),
  getCurrent:       ()                             => api.get('/journey/current'),
  getDay:           (id: string, day: number)      => api.get(`/journey/${id}/day/${day}`),
  morningComplete:  (id: string, day: number)      => api.post(`/journey/${id}/day/${day}/morning-complete`),
  eveningComplete:  (id: string, day: number)      => api.post(`/journey/${id}/day/${day}/evening-complete`),
  submitCheckin:      (id: string, day: number, body: object) => api.post(`/journey/${id}/day/${day}/checkin`, body),
  reportAffirmation:  (id: string, day: number)              => api.post(`/journey/${id}/day/${day}/report`),
}

// ── Onboarding ───────────────────────────────────────────────
export const onboarding = {
  start:               ()                           => api.post('/onboarding/start'),
  saveTrack:           (id: string, body: object)   => api.patch(`/onboarding/${id}/track`, body),
  saveAnswers:         (id: string, body: object)   => api.patch(`/onboarding/${id}/answers`, body),
  surfaceBeliefs:      (id: string)                 => api.post(`/onboarding/${id}/surface-beliefs`),
  confirmBeliefs:      (id: string, body: object)   => api.patch(`/onboarding/${id}/confirm-beliefs`, body),
  calibrate:           (id: string)                 => api.post(`/onboarding/${id}/calibrate`),
  calibrationFeedback: (id: string, body: object)   => api.patch(`/onboarding/${id}/calibration-feedback`, body),
  savePreferences:     (id: string, body: object)   => api.patch(`/onboarding/${id}/preferences`, body),
  generatePreview:     (id: string)                 => api.post(`/onboarding/${id}/generate-preview`),
  previewStatus:       (id: string)                 => api.get(`/onboarding/${id}/preview-status`),
}

// ── Coaching ─────────────────────────────────────────────────
export const coaching = {
  sendMessage:  (journey_id: string, message: string) => api.post('/coaching/message', { journey_id, message }),
  getHistory:   (journey_id: string)                   => api.get(`/coaching/${journey_id}/history`),
  getStatus:    (journey_id: string)                   => api.get(`/coaching/${journey_id}/status`),
}

// ── Progress ─────────────────────────────────────────────────
export const progress = {
  dashboard:    (journey_id: string) => api.get(`/progress/${journey_id}/dashboard`),
  score:        (journey_id: string) => api.get(`/progress/${journey_id}/score`),
  sessions:     (journey_id: string) => api.get(`/progress/${journey_id}/sessions`),
}

// ── Achievements ─────────────────────────────────────────────
export const achievements = {
  get:      (journey_id: string) => api.get(`/achievements/${journey_id}`),
  evaluate: (journey_id: string) => api.post(`/achievements/${journey_id}/evaluate`),
}

// ── Payment ──────────────────────────────────────────────────
export const payment = {
  createOrder:  (body: object) => api.post('/payment/create-order', body),
  verify:       (body: object) => api.post('/payment/verify', body),
  history:      ()             => api.get('/payment/history'),
}

// ── User ─────────────────────────────────────────────────────
export const user = {
  getProfile:    ()             => api.get('/user/profile'),
  updateProfile: (body: object) => api.patch('/user/profile', body),
  exportData:    ()             => api.get('/user/data-export'),
  deleteAccount: ()             => api.delete('/user/account', { data: { confirm: 'DELETE' } }),
}

export default api
