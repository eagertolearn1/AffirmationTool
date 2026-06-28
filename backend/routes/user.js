// =============================================================
// User Routes — Settings, DPDPA data rights
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/user/profile
 */
router.get('/profile', requireAuth, async (req, res) => {
  res.json({ id: '<uuid>', name: '', email: '', whatsapp_opted_in: false });
});

/**
 * PATCH /api/user/settings
 * Body: { whatsapp_opted_in?, telegram_opted_in?, push_token? }
 */
router.patch('/settings', requireAuth, async (req, res) => {
  // 1. Update user record
  // 2. If whatsapp_opted_in changed: log to consent_log
  res.json({ ok: true });
});

/**
 * GET /api/user/data-export
 * DPDPA: returns all personal data for this user as JSON.
 */
router.get('/data-export', requireAuth, async (req, res) => {
  // 1. Fetch: user record, all journeys, all check-ins, all coaching messages,
  //    all payments, all achievements, all consent logs
  // 2. Return as structured JSON
  // Rate limit: max 1 export per 24 hours
  res.json({ user: {}, journeys: [], coaching: [], payments: [] });
});

/**
 * DELETE /api/user/delete
 * DPDPA: initiates account deletion (30-day soft delete grace period).
 */
router.delete('/delete', requireAuth, async (req, res) => {
  // 1. Set user.is_deleted = true, user.delete_requested_at = NOW()
  // 2. Schedule hard delete job for 30 days from now
  // 3. Send confirmation email
  // 4. Revoke all refresh tokens
  res.json({ message: 'Account scheduled for deletion in 30 days.' });
});

module.exports = router;
