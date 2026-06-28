/**
 * Central route registry
 * All API routes mounted here and attached to Express at /api in app.js
 */
const express       = require('express');
const authRoutes     = require('./auth');
const onboardingRoutes = require('./onboarding');
const journeyRoutes  = require('./journey');
const coachingRoutes = require('./coaching');
const paymentRoutes  = require('./payment');
const progressRoutes = require('./progress');
const achievementRoutes = require('./achievements');
const userRoutes     = require('./user');
const adminRoutes    = require('./admin');
const webhookRoutes  = require('./webhooks');

const router = express.Router();

router.use('/auth',         authRoutes);
router.use('/onboarding',   onboardingRoutes);
router.use('/journey',      journeyRoutes);
router.use('/coaching',     coachingRoutes);
router.use('/payment',      paymentRoutes);
router.use('/progress',     progressRoutes);
router.use('/achievements', achievementRoutes);
router.use('/user',         userRoutes);
router.use('/admin',        adminRoutes);
router.use('/webhooks',     webhookRoutes);

module.exports = router;
