# System Design — AI-Powered Identity Change Platform
*Version 1.0 — Based on locked requirements (ProductDocument_v4)*

---

## 1. Architecture Overview

The platform is composed of six layers that work together:

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                        │
│         Next.js PWA (Web + Mobile installable)           │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / REST
┌────────────────────────▼────────────────────────────────┐
│                      API LAYER                           │
│              Node.js + Express (REST API)                │
└──────┬─────────────────┬──────────────────┬─────────────┘
       │                 │                  │
┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼──────┐
│  PostgreSQL  │  │  Redis +      │  │  Cloudflare  │
│  (Primary   │  │  BullMQ       │  │  R2 / S3     │
│   Database) │  │  (Job Queue)  │  │  (Media)     │
└─────────────┘  └───────┬───────┘  └─────────────┘
                         │ Workers
┌────────────────────────▼────────────────────────────────┐
│                  CONTENT GENERATION WORKERS              │
│   Affirmation Gen │ TTS Audio │ Infographic │ Cards      │
│   (GPT-4o)        │ (ElevenLabs/Sarvam) │ (Bannerbear)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  AUTOMATION LAYER (n8n)                  │
│  Morning/Evening delivery · Re-engagement · Renewals    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                       │
│  Razorpay · ElevenLabs · Sarvam AI · Bannerbear ·       │
│  WhatsApp Business API · Telegram Bot · Firebase FCM    │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Component Map

### 2.1 Frontend — Next.js PWA

**Framework:** Next.js 14 (App Router), deployed as a Progressive Web App.

Installs on Android and iOS home screen without an app store. Works offline for already-downloaded content (service worker caches audio files and infographics for the current day).

**Key pages / routes:**

| Route | Purpose |
|---|---|
| `/` | Landing page with sample audio and infographic |
| `/signup` | Registration with explicit WhatsApp opt-in |
| `/onboarding` | 5-step onboarding flow (track → questions → beliefs → calibrate → preferences) |
| `/preview` | Day 1 personalized preview + payment trigger |
| `/payment` | Razorpay checkout |
| `/journey` | Daily journey hub (current affirmation day) |
| `/journey/[day]` | Individual day view — morning, evening, check-in |
| `/coaching` | AI coaching conversation interface |
| `/progress` | Transformation Score dashboard |
| `/achievements` | Badge collection |
| `/settings` | Language, music, notifications, WhatsApp opt-in/out, data deletion |
| `/about` | Scientific credibility framework + disclaimer |

**State management:** Zustand (lightweight, works well with Next.js App Router).

**Push notifications:** Firebase FCM integrated via service worker.

**Audio player:** Custom HTML5 audio player with synchronized text highlighting. The Truth statement text scrolls and highlights word-by-word as audio plays.

---

### 2.2 Backend — Node.js + Express

Single REST API server. Stateless — horizontally scalable.

**Key responsibilities:**
- Authentication (JWT + refresh tokens)
- Onboarding session management
- Razorpay payment flow
- Journey state management (counters, unlock logic)
- AI coaching (daily limit enforcement)
- Transformation Score calculation
- Content delivery (signed URLs for media)
- Crisis detection (runs on every user text input)
- Business metrics aggregation

**Auth approach:** Email OTP for sign-up and login (no passwords). JWT access token (15-min TTL) + refresh token (30-day TTL) stored in httpOnly cookies.

---

### 2.3 Database — PostgreSQL

Primary source of truth for all structured data. Full schema in `schema.sql`.

**Key design decisions:**
- UUIDs as primary keys (safe for future multi-tenant/B2B)
- JSONB columns for flexible AI-generated content calibration data
- Separate `daily_sessions` and `check_ins` tables — sessions track listening events, check-ins track reflection data
- `crisis_events` table stores anonymized crisis signal records for safety review (never the raw user text)
- `content_generation_jobs` table enables retry logic and status tracking for async jobs

---

### 2.4 Job Queue — BullMQ + Redis

All content generation is asynchronous. After payment is confirmed, the backend enqueues a content generation job and returns immediately. The user sees a "Generating your journey…" screen.

**Queues:**

| Queue | Workers | Purpose |
|---|---|---|
| `affirmation-generation` | 3 | GPT-4o generates 21 days of Doubt/Reframe/Truth/Action |
| `audio-generation` | 5 | ElevenLabs / Sarvam TTS for each of 42 audio files |
| `infographic-generation` | 3 | Bannerbear renders 21 infographic cards |
| `preview-generation` | 5 | Day 1 preview (high priority — user is waiting) |
| `progress-card` | 3 | Bannerbear renders completion card on day finish |

**Priority:** Preview generation is highest priority — runs before the user is redirected to the payment page.

**Retry:** Up to 3 attempts per job with exponential backoff. Failures alert via internal webhook to admin.

---

### 2.5 Media Storage — Cloudflare R2

All generated media stored in Cloudflare R2 (S3-compatible, no egress fees).

**Bucket structure:**
```
/journeys/{journey_id}/
  day-{01..21}/
    morning.mp3
    evening.mp3
    infographic.jpg
  preview/
    day1-preview.mp3
    day1-infographic.jpg
  progress-cards/
    day-{01..21}-card.jpg
  voice-sample/
    raw.wav  (Premium — deleted after cloning)
```

**Access control:** Backend generates short-lived signed URLs (1-hour TTL) for each media request. No public URLs. Users cannot enumerate other users' content.

---

### 2.6 Automation — n8n

Five self-contained workflows handle all scheduled and event-driven communication. Full workflow JSON in `n8n_workflows/`.

| Workflow | Trigger | Purpose |
|---|---|---|
| `morning-delivery` | Cron 6:00–9:00 AM (per user preference) | WhatsApp + FCM morning reminder |
| `evening-delivery` | Cron 7:00–9:00 PM (per user preference) | WhatsApp + FCM evening reminder |
| `content-pipeline` | Webhook (POST /webhooks/payment-confirmed) | Triggers BullMQ content generation jobs |
| `day-completion` | Webhook (POST /webhooks/day-complete) | Generates progress card, sends WhatsApp congratulations |
| `re-engagement` | Cron daily 10:00 AM | Sends one nudge to users inactive 48+ hours |
| `renewal-flow` | Webhook (POST /webhooks/journey-complete) | Day 21 congratulations + renewal prompt |

---

### 2.7 External Service Integrations

| Service | Purpose | Notes |
|---|---|---|
| **OpenAI GPT-4o** | Onboarding AI, affirmation generation, coaching, crisis detection, content moderation | Crisis detection runs on every user text input via system prompt layer |
| **ElevenLabs** | TTS Hindi/English, voice cloning (Premium) | Voice cloning requires user recording a 1–2 min neutral voice sample |
| **Sarvam AI** | TTS for all other Indian languages | REST API, same queue as ElevenLabs |
| **Bannerbear** | Infographic rendering, progress card rendering | Template-based; variables injected per-user |
| **Razorpay** | Payments | Webhook for payment confirmation; verify signature server-side |
| **WhatsApp Business API** | Delivery via Interakt/WATI/360dialog | Template messages for scheduled delivery; session messages for conversational |
| **Telegram Bot API** | Optional coaching bot + community channel | User explicitly opts in to both |
| **Firebase FCM** | Push notifications | In-app push via PWA service worker |
| **iDenfy / manual** | Age verification (future consideration) | Age gate at signup is self-declaration at launch |

---

## 3. Content Generation Pipeline — Detailed Flow

```
Payment Confirmed
       │
       ▼
1. Enqueue PREVIEW job (high priority)
       │
       ▼
2. GPT-4o generates Day 1 Doubt/Reframe/Truth/Action
       │
       ▼
3. ElevenLabs/Sarvam generates Day 1 morning preview audio (15–20 sec clip)
       │
       ▼
4. Bannerbear renders Day 1 infographic
       │
       ▼
5. Preview ready → Notify frontend → Show user their personalized Day 1
       │
       ▼  (continues in background)
6. GPT-4o generates Days 2–21 affirmation content (batch)
       │
       ▼
7. Audio generation workers process all 42 audio files (21 days × 2)
   (parallelized — up to 5 concurrent audio generation jobs)
       │
       ▼
8. Infographic workers render Days 2–21 (21 infographics)
       │
       ▼
9. All jobs complete → Update journey status to ACTIVE
       │
       ▼
10. Push notification + WhatsApp: "Your 21-day journey is ready. Begin now."
```

**Total estimated generation time:** 8–15 minutes after payment for full 21-day content. Day 1 preview ready in ~60–90 seconds.

---

## 4. Daily Journey State Machine

Each `daily_session` record moves through these states:

```
LOCKED
  │ (previous day completed OR 24hr auto-unlock)
  ▼
MORNING_UNLOCKED
  │ (user plays morning audio to ≥80% completion)
  ▼
EVENING_UNLOCKED
  │ (user plays evening audio to ≥80% completion)
  ▼
CHECKIN_UNLOCKED
  │ (user submits check-in)
  ▼
COMPLETED
  │ (triggers: next day unlock + progress card + WhatsApp congratulations)
```

**Auto-unlock rule:** If a day is in `MORNING_UNLOCKED`, `EVENING_UNLOCKED`, or `CHECKIN_UNLOCKED` state and 24 hours have elapsed since the session was created, the next day is unlocked regardless. The incomplete day is marked `EXPIRED`. Transformation Score calculation treats expired days as 0% for that day's consistency contribution.

---

## 5. Transformation Score Algorithm

Calculated on every check-in submission and on session expiry.

```
Score = (
  (consistency_rate × 0.35) +
  (believability_trend × 0.25) +
  (doubt_reduction_trend × 0.25) +
  (action_completion_rate × 0.15)
) × 100
```

**Definitions:**
- `consistency_rate` = completed affirmation days / calendar days elapsed (0–1)
- `believability_trend` = current believability score / Day 1 believability score (capped at 1.0)
- `doubt_reduction_trend` = (10 - current doubt score) / (10 - Day 1 doubt score) (capped at 1.0)
- `action_completion_rate` = (yes × 1 + partially × 0.5 + no × 0) / total milestone check-ins

Score is stored per check-in, enabling the trend chart on the dashboard.

---

## 6. AI Coaching — Limit Enforcement

The daily limit is enforced at the API layer, not the frontend.

```
POST /api/coaching/:journey_id/message

1. Count today's messages from ai_coaching_messages where
   journey_id = :journey_id AND role = 'user'
   AND DATE(created_at) = TODAY

2. Get user tier from journeys → payments

3. If count >= limit (5 standard / 20 premium):
   Check coaching_credits table for available credits
   If credits available: deduct 1 credit, proceed
   If no credits: return 429 { error: 'DAILY_LIMIT_REACHED', resets_at: tomorrow_midnight }

4. If under limit: proceed to GPT-4o with system prompt including:
   - user's problem statement
   - identity statement
   - current affirmation day content
   - last 10 messages for context
   - crisis detection instruction (mandatory)
```

---

## 7. Crisis Detection — Implementation

Runs on every text input from the user (onboarding free-text, check-in evidence text, coaching messages).

**Implementation:** System-level instruction injected into every GPT-4o call that processes user text:

```
SYSTEM INSTRUCTION (non-overridable):
Before generating any response, analyze the user's input for crisis signals:
- Suicidal ideation or self-harm intent
- Severe distress, abuse, or immediate danger
- Mentions of harming others

If ANY crisis signal is detected:
1. Do NOT generate the normal response
2. Return JSON: { "crisis_detected": true, "crisis_type": "<type>" }
3. Do not mention the content of the signal

The backend handles all crisis routing — you only detect and flag.
```

**Backend crisis handler:**
```
If crisis_detected = true:
1. Log anonymized event to crisis_events table
2. Pause normal product flow
3. Return warm acknowledgement message to user
4. Include helpline numbers: iCall (9152987821), Vandrevala (1860-2662-345)
5. Do NOT deliver the day's affirmation
6. Flag session for human review queue
```

---

## 8. WhatsApp Integration — Message Types

WhatsApp Business API distinguishes two message categories:

**Template messages** (outbound, any time):
Used for scheduled reminders, day completion congratulations, re-engagement nudges, renewal prompts. Templates must be pre-approved by WhatsApp/Meta. Required variables marked with `{{1}}` syntax.

Templates needed (pre-approve before launch):
- `morning_reminder` — "Good morning {{1}}! Your Day {{2}} affirmation is ready. {{3}}"
- `evening_reminder` — "Time for your evening session, {{1}}. {{2}}"
- `day_complete` — "Day {{1}} complete! 🎉 Your Transformation Score is now {{2}}."
- `milestone_7` — "One week in, {{1}}. Your score has moved from {{2}} to {{3}}."
- `milestone_14`, `milestone_21` — similar
- `re_engagement` — "Missing you, {{1}}. Your journey is paused at Day {{2}}. Resume anytime: {{3}}"
- `renewal_prompt` — "You've completed your 21-day journey, {{1}}. Ready for the next one? {{2}}"

**Session messages** (replies to user-initiated messages):
Used when user messages the WhatsApp number directly. n8n webhook receives the inbound message and routes to the AI coaching engine via the backend API.

---

## 9. Security Considerations

**Authentication:**
- Email OTP only — no passwords to steal or forget
- JWT in httpOnly cookies — XSS cannot steal tokens
- CSRF protection on all state-changing endpoints

**Data security:**
- All user text (problem statements, check-ins, coaching) encrypted at rest (PostgreSQL transparent data encryption)
- Media files in R2 — only accessible via signed URLs with 1-hour TTL
- Voice samples deleted from R2 immediately after ElevenLabs voice clone is created

**API security:**
- Rate limiting on all endpoints (express-rate-limit)
- Razorpay webhook signature verification before processing any payment event
- WhatsApp webhook verification token

**DPDPA compliance:**
- `/api/user/data-export` — returns all user data as JSON
- `/api/user/delete` — soft delete with 30-day grace period, then hard delete
- Explicit consent records stored in database with timestamp

---

## 10. Infrastructure

**Recommended deployment stack:**

| Component | Service | Notes |
|---|---|---|
| Frontend (Next.js) | Vercel | Zero-config deployment, edge CDN |
| Backend API | Railway or Render | Managed Node.js hosting |
| PostgreSQL | Supabase or Railway | Managed Postgres with connection pooling |
| Redis | Upstash | Serverless Redis, BullMQ compatible |
| n8n | n8n Cloud or self-hosted on Railway | Self-hosted recommended for cost at scale |
| Media storage | Cloudflare R2 | No egress fees |
| CDN | Cloudflare | Fronts both frontend and media |

**Environment variables (minimum set):**
```
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
OPENAI_API_KEY
ELEVENLABS_API_KEY
SARVAM_API_KEY
BANNERBEAR_API_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
WHATSAPP_API_TOKEN
WHATSAPP_PHONE_NUMBER_ID
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY
CLOUDFLARE_R2_SECRET_KEY
CLOUDFLARE_R2_BUCKET
FIREBASE_SERVICE_ACCOUNT_JSON
N8N_WEBHOOK_SECRET
```

---

## 11. Phase 2 Additions (Video)

Phase 2 requires the following additions to the existing architecture:

1. **Shotstack API** — video composition service. New worker in BullMQ: `video-composition`. Combines background video + audio + text overlay per day.

2. **Pre-built video library** — 168 background videos stored in R2 (7 tracks × 4 stages × 3 variations × 2 moods). Generated once using RunwayML or Kling AI. One-time cost.

3. **Video storage** — Add `/journeys/{journey_id}/day-{01..21}/morning.mp4` and `evening.mp4` to the R2 bucket structure.

4. **Frontend** — Replace audio player + static background with a video player component. Synchronized text overlay becomes part of the video rather than HTML overlay.

5. **Database** — Add `morning_video_url` and `evening_video_url` columns to `affirmation_days` table.

No changes to the auth, payment, coaching, scoring, or n8n layers.

---

*Next artifacts: schema.sql · api-routes scaffold · n8n workflow JSONs*
