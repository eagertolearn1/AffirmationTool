/**
 * User Routes — Profile, settings, DPDPA compliance (export + delete)
 */
const express = require('express');
const { z }   = require('zod');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../utils/errors');
const logger  = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// GET /api/user/profile
// ─────────────────────────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const { rows: [u] } = await db.query(
      `SELECT id, name, email, whatsapp_number, whatsapp_opted_in,
              subscription_tier, created_at
       FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ user: u });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/user/profile
// Update name, whatsapp_number, whatsapp_opted_in
// ─────────────────────────────────────────────────────────────
router.patch('/profile', async (req, res, next) => {
  try {
    const schema = z.object({
      name:               z.string().min(1).max(100).optional(),
      whatsapp_number:    z.string().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal('')),
      whatsapp_opted_in:  z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.errors);

    const { name, whatsapp_number, whatsapp_opted_in } = parsed.data;

    // Build dynamic SET clause
    const updates = [];
    const values  = [];
    if (name !== undefined)              { updates.push(`name = $${values.push(name)}`); }
    if (whatsapp_number !== undefined)   { updates.push(`whatsapp_number = $${values.push(whatsapp_number)}`); }
    if (whatsapp_opted_in !== undefined) {
      updates.push(`whatsapp_opted_in = $${values.push(whatsapp_opted_in)}`);
      // Log consent change
      await db.query(
        `INSERT INTO consent_log (user_id, consent_type, consented)
         VALUES ($1, 'whatsapp', $2)`,
        [req.user.userId, whatsapp_opted_in]
      );
    }

    if (!updates.length) return res.json({ message: 'Nothing to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.user.userId);

    const { rows: [u] } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING name, email, whatsapp_number, whatsapp_opted_in`,
      values
    );

    logger.info({ userId: req.user.userId }, 'Profile updated');
    res.json({ user: u });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/user/data-export
// DPDPA 2023 — full data export in JSON
// ─────────────────────────────────────────────────────────────
router.get('/data-export', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const [{ rows: [user] }, { rows: journeys }, { rows: payments }, { rows: consentLog }] = await Promise.all([
      db.query(
        'SELECT id, name, email, whatsapp_number, whatsapp_opted_in, subscription_tier, created_at FROM users WHERE id = $1',
        [userId]
      ),
      db.query(
        `SELECT j.id, j.track, j.status, j.current_affirmation_day, j.current_calendar_day,
                j.transformation_score, j.created_at,
                json_agg(json_build_object(
                  'day', ds.affirmation_day_number,
                  'state', ds.state,
                  'date', ds.calendar_date,
                  'doubt_score', ci.doubt_score,
                  'believability_score', ci.believability_score,
                  'action_completed', ci.action_completed
                ) ORDER BY ds.affirmation_day_number) FILTER (WHERE ds.id IS NOT NULL) AS sessions
         FROM journeys j
         LEFT JOIN daily_sessions ds ON ds.journey_id = j.id
         LEFT JOIN check_ins ci ON ci.daily_session_id = ds.id
         WHERE j.user_id = $1
         GROUP BY j.id`,
        [userId]
      ),
      db.query(
        'SELECT payment_type, tier, amount_paise, status, updated_at FROM payments WHERE user_id = $1',
        [userId]
      ),
      db.query(
        'SELECT consent_type, consented, created_at FROM consent_log WHERE user_id = $1 ORDER BY created_at',
        [userId]
      ),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user,
      journeys,
      payments,
      consent_log: consentLog,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="my-affirmation-data.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
    logger.info({ userId }, 'Data export completed');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/user/account
// DPDPA 2023 — right to erasure
// Soft-delete: anonymizes PII, sets deleted_at
// ─────────────────────────────────────────────────────────────
router.delete('/account', async (req, res, next) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE') {
      throw new ValidationError('Send { "confirm": "DELETE" } to confirm account deletion');
    }

    await db.transaction(async (client) => {
      const anonymizedEmail = `deleted_${req.user.userId}@deleted.invalid`;

      // Anonymize PII
      await client.query(
        `UPDATE users
         SET name = 'Deleted User', email = $1, whatsapp_number = NULL,
             whatsapp_opted_in = false, is_deleted = true,
             delete_requested_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [anonymizedEmail, req.user.userId]
      );

      // Revoke all active refresh tokens
      await client.query(
        'DELETE FROM refresh_tokens WHERE user_id = $1',
        [req.user.userId]
      );

      // Anonymize check-in evidence text (free-form user content)
      await client.query(
        `UPDATE check_ins SET evidence_text = '[deleted]'
         WHERE daily_session_id IN (
           SELECT ds.id FROM daily_sessions ds
           JOIN journeys j ON j.id = ds.journey_id
           WHERE j.user_id = $1
         )`,
        [req.user.userId]
      );

      // Log the deletion
      await client.query(
        `INSERT INTO consent_log (user_id, consent_type, consented)
         VALUES ($1, 'account_deletion', false)`,
        [req.user.userId]
      );
    });

    logger.info({ userId: req.user.userId }, 'Account deleted (anonymized)');
    res.json({ message: 'Account deleted. Your personal data has been removed.' });
  } catch (err) { next(err); }
});

module.exports = router;
