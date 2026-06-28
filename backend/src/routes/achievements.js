/**
 * Achievements Routes
 * Fetch earned badges and trigger achievement evaluation.
 */
const express = require('express');
const db      = require('../db');
const storage = require('../services/storage');
const scoring = require('../services/scoring');
const bannerbear = require('../services/bannerbear');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

const BADGE_METADATA = {
  journey_completer:  { label: 'Journey Completer',  icon: '🏆', description: 'Completed all 21 affirmation days' },
  perfect_consistency:{ label: 'Perfect Consistency', icon: '⚡', description: 'Completed 21 days in exactly 21 calendar days — zero gaps' },
  strong_momentum:    { label: 'Strong Momentum',     icon: '🚀', description: 'Completed Days 1–14 without a single missed day' },
  comeback_champion:  { label: 'Comeback Champion',   icon: '💪', description: 'Returned after missing days and finished all 21' },
  action_taker:       { label: 'Action Taker',        icon: '✅', description: '80%+ action completion across all milestone check-ins' },
};

// ─────────────────────────────────────────────────────────────
// GET /api/achievements/:journey_id
// All badges (earned + locked) for this journey
// ─────────────────────────────────────────────────────────────
router.get('/:journey_id', async (req, res, next) => {
  try {
    await getJourneyForUser(req.params.journey_id, req.user.userId);

    const { rows: earned } = await db.query(
      `SELECT badge_type, earned_at, card_path
       FROM achievements
       WHERE journey_id = $1
       ORDER BY earned_at`,
      [req.params.journey_id]
    );

    const earnedSet = new Set(earned.map(b => b.badge_type));

    // Attach signed URLs for badge card images
    const earnedWithUrls = await Promise.all(earned.map(async (b) => {
      const meta = BADGE_METADATA[b.badge_type] || {};
      return {
        badge_type:  b.badge_type,
        label:       meta.label,
        icon:        meta.icon,
        description: meta.description,
        earned_at:   b.earned_at,
        card_url:    b.card_path ? await storage.getSignedUrl(b.card_path) : null,
      };
    }));

    // Build locked badges
    const locked = Object.entries(BADGE_METADATA)
      .filter(([type]) => !earnedSet.has(type))
      .map(([type, meta]) => ({ badge_type: type, ...meta, earned: false }));

    res.json({ earned: earnedWithUrls, locked });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/achievements/:journey_id/evaluate
// Trigger achievement evaluation (called after day completion)
// Returns any newly earned badges
// ─────────────────────────────────────────────────────────────
router.post('/:journey_id/evaluate', async (req, res, next) => {
  try {
    const journey = await getJourneyForUser(req.params.journey_id, req.user.userId);
    const newBadges = await scoring.evaluateAchievements(journey.id);

    if (newBadges.length > 0) {
      // Render badge cards asynchronously
      renderBadgeCardsAsync(journey, newBadges).catch(err =>
        require('../utils/logger').error({ err }, 'Badge card rendering failed')
      );
    }

    res.json({ new_badges: newBadges });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function getJourneyForUser(journeyId, userId) {
  const { rows: [j] } = await db.query(
    'SELECT * FROM journeys WHERE id = $1 AND user_id = $2',
    [journeyId, userId]
  );
  if (!j) throw new NotFoundError('Journey not found');
  return j;
}

async function renderBadgeCardsAsync(journey, badgeTypes) {
  const { rows: [user] } = await db.query(
    'SELECT name FROM users WHERE id = $1',
    [journey.user_id]
  );

  for (const badge_type of badgeTypes) {
    try {
      // generateBadgeCard returns an image URL
      const axios = require('axios');
      const imageUrl = await bannerbear.generateBadgeCard({
        journey_id:    journey.id,
        user_name:     user.name,
        badge_type,
        track:         journey.track,
      });
      // Download and upload to R2
      const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
      const cardPath = storage.assetPath(journey.id, 0, `badge_${badge_type}.png`);
      await storage.uploadFile(cardPath, Buffer.from(imgResponse.data), 'image/png');
      await db.query(
        'UPDATE achievements SET card_path = $1 WHERE journey_id = $2 AND badge_type = $3',
        [cardPath, journey.id, badge_type]
      );
    } catch (err) {
      require('../utils/logger').warn({ err, badge_type }, 'Badge card render failed');
    }
  }
}

module.exports = router;
