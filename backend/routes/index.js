// =============================================================
// API Routes — Identity Change Platform
// Entry point: mounts all route modules
// =============================================================

const express = require('express');
const router = express.Router();

const authRoutes       = require('./auth');
const onboardingRoutes = require('./onboarding');
const paymentRoutes    = require('./payment');
const journeyRoutes    = require('./journey');
const coachingRoutes   = require('./coaching');
const progressRoutes   = require('./progress');
const achievementRoutes = require('./achievements');
const webhookRoutes    = require('./webhooks');
const adminRoutes      = require('./admin');
const userRoutes       = require('./user');

router.use('/auth',         authRoutes);
router.use('/onboarding',   onboardingRoutes);
router.use('/payment',      paymentRoutes);
router.use('/journey',      journeyRoutes);
router.use('/coaching',     coachingRoutes);
router.use('/progress',     progressRoutes);
router.use('/achievements', achievementRoutes);
router.use('/webhooks',     webhookRoutes);
router.use('/admin',        adminRoutes);
router.use('/user',         userRoutes);

module.exports = router;
