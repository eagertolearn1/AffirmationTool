-- =============================================================
-- AI-Powered Identity Change Platform — PostgreSQL Schema v1.0
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE life_track AS ENUM (
  'wealth', 'health', 'career', 'confidence',
  'relationships', 'peace', 'fitness'
);

CREATE TYPE language_code AS ENUM (
  'hi', 'en', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml'
);

CREATE TYPE music_style AS ENUM (
  'calm', 'uplifting', 'meditative', 'energetic'
);

CREATE TYPE journey_status AS ENUM (
  'onboarding', 'generating', 'active', 'completed', 'renewed'
);

CREATE TYPE voice_type AS ENUM (
  'ai_generated', 'cloned'
);

CREATE TYPE user_tier AS ENUM (
  'standard', 'premium'
);

CREATE TYPE generation_status AS ENUM (
  'pending', 'generating', 'ready', 'failed'
);

CREATE TYPE session_state AS ENUM (
  'locked', 'morning_unlocked', 'evening_unlocked',
  'checkin_unlocked', 'completed', 'expired'
);

CREATE TYPE action_completed AS ENUM (
  'yes', 'partially', 'no'
);

CREATE TYPE payment_type AS ENUM (
  'new_journey', 'renewal', 'coaching_credits'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'completed', 'failed', 'refunded'
);

CREATE TYPE job_type AS ENUM (
  'affirmation_generation', 'audio_generation',
  'infographic_generation', 'preview_generation', 'progress_card',
  'voice_clone'
);

CREATE TYPE job_status AS ENUM (
  'queued', 'processing', 'completed', 'failed'
);

CREATE TYPE badge_type AS ENUM (
  'journey_completer', 'perfect_consistency',
  'strong_momentum', 'comeback_champion', 'action_taker'
);

CREATE TYPE crisis_context AS ENUM (
  'onboarding', 'checkin', 'coaching'
);

-- =============================================================
-- USERS
-- =============================================================

CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(100) NOT NULL,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  whatsapp_number       VARCHAR(20),
  whatsapp_opted_in     BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_opted_in     BOOLEAN NOT NULL DEFAULT FALSE,
  age_confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  push_token            TEXT,                          -- Firebase FCM token
  subscription_tier     VARCHAR(20) NOT NULL DEFAULT 'standard', -- 'standard' | 'premium'
  is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  delete_requested_at   TIMESTAMP,                     -- DPDPA: 30-day grace
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_whatsapp ON users(whatsapp_number);

-- =============================================================
-- OTP AUTH
-- =============================================================

CREATE TABLE auth_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  otp_hash    VARCHAR(255) NOT NULL,           -- bcrypt hash of OTP
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_otps_email ON auth_otps(email);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- =============================================================
-- JOURNEYS
-- =============================================================

CREATE TABLE journeys (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track                     life_track,          -- set in onboarding step 2
  language                  language_code,       -- set in onboarding step 7
  music_style               music_style,         -- set in onboarding step 7
  tier                      user_tier NOT NULL DEFAULT 'standard',
  voice_type                voice_type NOT NULL DEFAULT 'ai_generated',
  status                    journey_status NOT NULL DEFAULT 'onboarding',

  -- Onboarding content (filled progressively during onboarding)
  problem_statement         TEXT,
  goal_statement            TEXT,
  inner_voice_belief        TEXT,           -- AI surfaced
  identity_shift_needed     TEXT,           -- AI surfaced
  core_belief_to_change     TEXT,           -- AI surfaced
  calibration_data          JSONB,          -- stores Day 1/7/14/21 preview + user responses
  onboarding_completed_at   TIMESTAMP,

  -- Premium voice cloning
  voice_sample_url          TEXT,           -- deleted after cloning
  voice_clone_id            TEXT,           -- ElevenLabs voice ID

  -- Journey progress (derived but cached for performance)
  current_affirmation_day   INT NOT NULL DEFAULT 0,
  current_calendar_day      INT NOT NULL DEFAULT 0,
  transformation_score      NUMERIC(5,2),

  -- Timestamps
  calendar_started_at       TIMESTAMP,     -- set when payment confirmed
  completed_at              TIMESTAMP,
  parent_journey_id         UUID REFERENCES journeys(id),  -- for renewals

  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journeys_user ON journeys(user_id);
CREATE INDEX idx_journeys_status ON journeys(status);

-- =============================================================
-- AFFIRMATION DAYS (21 rows per journey)
-- =============================================================

CREATE TABLE affirmation_days (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id            UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  day_number            INT NOT NULL CHECK (day_number BETWEEN 1 AND 21),

  -- Generated content
  doubt                 TEXT,
  reframe               TEXT,
  truth_statement       TEXT,
  action_prompt         TEXT,

  -- Media URLs (Cloudflare R2 paths — not full URLs, signed at request time)
  morning_audio_path    TEXT,
  evening_audio_path    TEXT,
  infographic_path      TEXT,

  -- Phase 2
  morning_video_path    TEXT,
  evening_video_path    TEXT,

  -- Generation tracking
  content_status        generation_status NOT NULL DEFAULT 'pending',
  audio_status          generation_status NOT NULL DEFAULT 'pending',
  infographic_status    generation_status NOT NULL DEFAULT 'pending',

  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(journey_id, day_number)
);

CREATE INDEX idx_affirmation_days_journey ON affirmation_days(journey_id);

-- =============================================================
-- DAILY SESSIONS (one per affirmation day per user)
-- =============================================================

CREATE TABLE daily_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id                UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  affirmation_day_number    INT NOT NULL,
  calendar_date             DATE NOT NULL,                   -- actual date the session opened
  state                     session_state NOT NULL DEFAULT 'locked',

  -- Listening events
  morning_started_at        TIMESTAMP,
  morning_completed_at      TIMESTAMP,                       -- reached 80% completion
  evening_started_at        TIMESTAMP,
  evening_completed_at      TIMESTAMP,

  -- Auto-unlock tracking
  auto_unlocked_at          TIMESTAMP,                       -- set if 24hr rule triggered

  -- Completion
  checkin_completed_at      TIMESTAMP,
  next_day_unlocked_at      TIMESTAMP,
  progress_card_url         TEXT,

  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(journey_id, affirmation_day_number)
);

CREATE INDEX idx_daily_sessions_journey ON daily_sessions(journey_id);
CREATE INDEX idx_daily_sessions_state ON daily_sessions(state);
CREATE INDEX idx_daily_sessions_date ON daily_sessions(calendar_date);

-- =============================================================
-- CHECK-INS
-- =============================================================

CREATE TABLE check_ins (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_session_id          UUID NOT NULL REFERENCES daily_sessions(id) ON DELETE CASCADE,
  journey_id                UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  affirmation_day_number    INT NOT NULL,
  is_milestone_day          BOOLEAN NOT NULL DEFAULT FALSE,  -- Days 1,7,14,21

  -- Always present
  believability_score       INT CHECK (believability_score BETWEEN 1 AND 10),

  -- Milestone day only (nullable on non-milestone days)
  doubt_score               INT CHECK (doubt_score BETWEEN 1 AND 10),
  resistance_score          INT CHECK (resistance_score BETWEEN 1 AND 10),
  identity_score            INT CHECK (identity_score BETWEEN 1 AND 10),
  action_completed          action_completed,
  evidence_text             TEXT,                            -- optional free text

  -- Rotating question (non-milestone days)
  rotating_question_key     VARCHAR(50),                     -- e.g. 'resistance', 'identity'
  rotating_question_score   INT CHECK (rotating_question_score BETWEEN 1 AND 10),

  -- Transformation score snapshot at this check-in
  transformation_score      NUMERIC(5,2),

  created_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_check_ins_journey ON check_ins(journey_id);
CREATE INDEX idx_check_ins_session ON check_ins(daily_session_id);

-- =============================================================
-- AI COACHING MESSAGES
-- =============================================================

CREATE TABLE coaching_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id            UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content               TEXT NOT NULL,
  coaching_date         DATE NOT NULL DEFAULT CURRENT_DATE,   -- for daily limit counting
  source                VARCHAR(20) NOT NULL DEFAULT 'app',   -- 'app' | 'whatsapp' | 'telegram'
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coaching_messages_journey ON coaching_messages(journey_id);
CREATE INDEX idx_coaching_messages_date ON coaching_messages(journey_id, coaching_date);

-- =============================================================
-- COACHING CREDITS
-- =============================================================

CREATE TABLE coaching_credits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_purchased     INT NOT NULL DEFAULT 0,
  credits_used          INT NOT NULL DEFAULT 0,
  credits_remaining     INT GENERATED ALWAYS AS (credits_purchased - credits_used) STORED,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_coaching_credits_user ON coaching_credits(user_id);

-- =============================================================
-- PAYMENTS
-- =============================================================

CREATE TABLE payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id                UUID REFERENCES journeys(id),
  razorpay_order_id         VARCHAR(100) UNIQUE,
  razorpay_payment_id       VARCHAR(100) UNIQUE,
  amount_paise              INT NOT NULL,                    -- amount in paise
  tier                      user_tier,
  payment_type              payment_type NOT NULL,
  status                    payment_status NOT NULL DEFAULT 'pending',
  renewal_discount_applied  BOOLEAN NOT NULL DEFAULT FALSE,
  video_discount_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_journey ON payments(journey_id);
CREATE INDEX idx_payments_razorpay_order ON payments(razorpay_order_id);

-- =============================================================
-- ACHIEVEMENTS
-- =============================================================

CREATE TABLE achievements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id    UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  badge_type    badge_type NOT NULL,
  card_path     TEXT,                                         -- R2 path to badge image
  earned_at     TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(journey_id, badge_type)
);

CREATE INDEX idx_achievements_user ON achievements(user_id);

-- =============================================================
-- CONTENT GENERATION JOBS
-- =============================================================

CREATE TABLE content_generation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  job_type        job_type NOT NULL,
  day_number      INT,                                        -- NULL for full-journey jobs
  status          job_status NOT NULL DEFAULT 'queued',
  attempts        INT NOT NULL DEFAULT 0,
  error_message   TEXT,
  bull_job_id     VARCHAR(100),                               -- BullMQ job ID
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMP
);

CREATE INDEX idx_gen_jobs_journey ON content_generation_jobs(journey_id);
CREATE INDEX idx_gen_jobs_status ON content_generation_jobs(status);

-- =============================================================
-- CRISIS EVENTS (anonymized safety log)
-- =============================================================

CREATE TABLE crisis_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id          UUID REFERENCES journeys(id),
  trigger_context     crisis_context NOT NULL,
  crisis_type         VARCHAR(50),                            -- 'self_harm', 'abuse', etc.
  resources_shown     JSONB,                                  -- helplines shown to user
  reviewed            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Note: raw user text is NEVER stored here — only anonymized metadata

CREATE INDEX idx_crisis_events_user ON crisis_events(user_id);
CREATE INDEX idx_crisis_events_reviewed ON crisis_events(reviewed);

-- =============================================================
-- CONSENT LOG (DPDPA compliance)
-- =============================================================

CREATE TABLE consent_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type    VARCHAR(50) NOT NULL,   -- 'whatsapp', 'voice_clone', 'testimonial', 'terms'
  consented       BOOLEAN NOT NULL,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consent_log_user ON consent_log(user_id);

-- =============================================================
-- NOTIFICATIONS LOG
-- =============================================================

CREATE TABLE notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id      UUID REFERENCES journeys(id),
  channel         VARCHAR(20) NOT NULL,   -- 'whatsapp', 'push', 'telegram'
  template_name   VARCHAR(100),
  status          VARCHAR(20),            -- 'sent', 'delivered', 'failed', 'opted_out'
  sent_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user ON notification_log(user_id);

-- =============================================================
-- UPDATED_AT TRIGGER (applies to all tables with updated_at)
-- =============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_journeys_updated_at
  BEFORE UPDATE ON journeys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_affirmation_days_updated_at
  BEFORE UPDATE ON affirmation_days FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_daily_sessions_updated_at
  BEFORE UPDATE ON daily_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EX