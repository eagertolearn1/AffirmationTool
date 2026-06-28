// =============================================================
// Admin Routes — Business Metrics (internal only)
// Requires admin role middleware
// =============================================================

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/admin/metrics
 * Returns all business KPIs.
 */
router.get('/metrics', requireAuth, requireAdmin, async (req, res) => {
  // Returns:
  // {
  //   funnel: {
  //     onboarding_started,
  //     onboarding_completed,
  //     preview_generated,
  //     payments_completed,
  //     day1_activated_within_24h,
  //     day7_active,
  //     day21_completed,
  //     renewals
  //   },
  //   unit_economics: {
  //     avg_content_cost_per_journey,
  //     avg_coaching_messages_per_journey,
  //     avg_whatsapp_messages_per_journey,
  //     coaching_credits_purchased_rate
  //   },
  //   engagement: {
  //     avg_coaching_interactions,
  //     most_common_dropoff_day,
  //     checkin_completion_rate_by_day,
  //     perfect_consistency_rate,
  //     avg_calendar_days_to_complete,
  //     whatsapp_opt_in_rate,
  //     nps_day21
  //   },
  //   crisis_events: {
  //     total_last_30d,
  //     unreviewed
  //   }
  // }
  res.json({});
});

/**
 * GET /api/admin/crisis-queue
 * Returns unreviewed crisis events for human review.
 */
router.get('/crisis-queue', requireAuth, requireAdmin, async (req, res) => {
  // 1. Return crisis_events where reviewed = false, ordered by created_at DESC
  // Note: returns metadata only — no raw user text
  res.json({ events: [] });
});

/**
 * PATCH /api/admin/crisis-queue/:event_id/review
 * Marks a crisis event as reviewed.
 */
router.patch('/crisis-queue/:event_id/review', requireAuth, requireAdmin, async (req, res) => {
  // 1. Set crisis_events.reviewed = true
  res.json({ ok: true });
});

module.exports = router;
