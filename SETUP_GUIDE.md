# Affirmation Platform — First-Time Setup Guide

This guide walks you through everything needed to get the backend running and testable.
No prior experience assumed. Follow every step in order.

---

## What You'll Set Up

| Service | What it does | Cost | Time |
|---|---|---|---|
| Docker Desktop | Runs Postgres + Redis + backend locally | Free | 10 min |
| Resend | Sends OTP emails to users | Free (3,000 emails/month) | 5 min |
| OpenAI | AI affirmations + coaching + crisis detection | Pay as you go (~$5–10 for testing) | 5 min |
| Razorpay | Payments (UPI, cards) | Free to set up, test mode has no real money | 10 min |
| Cloudflare R2 | Stores audio + image files | Free (10 GB/month) | 10 min |
| Bannerbear | Generates infographic/progress cards | Free trial (40 images) | 30 min |
| Postman | Test the API without a frontend | Free | 5 min |

**Total: ~1.5–2 hours to complete everything.**

---

## PART 1 — Install Docker Desktop

Docker runs the database, Redis cache, and backend server on your laptop in containers.
You do NOT need to install Postgres or Redis separately.

**Steps:**

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Click **"Download for Mac"** (or Windows — pick your OS)
3. Open the downloaded file and drag Docker to Applications
4. Open Docker Desktop from your Applications folder
5. Wait for the whale icon in your menu bar to stop animating — means it's ready
6. Open Terminal and type:
   ```
   docker --version
   ```
   You should see something like `Docker version 25.x.x` — means it's working

---

## PART 2 — Install Make (Mac only — Windows skip this)

Make lets you run simple commands like `make up` instead of long docker commands.

**On Mac:**
```bash
xcode-select --install
```
A popup will appear — click Install. Takes 2–5 minutes.

**On Windows:**
You don't need Make. Wherever this guide says `make <something>`, use the equivalent from the table below:

| make command | Windows alternative |
|---|---|
| `make up` | `docker compose up -d --build` |
| `make down` | `docker compose down` |
| `make logs` | `docker compose logs -f` |
| `make migrate` | `docker compose exec backend node src/db/migrate.js` |
| `make health` | Open http://localhost:3001/health in browser |
| `make shell-db` | `docker compose exec postgres psql -U appuser -d identity_platform` |

---

## PART 3 — Get Your API Keys

### 3.1 Resend (Email OTPs)

1. Go to **https://resend.com** → click **Sign Up**
2. Sign up with your email (Google sign-in works)
3. After email verification, go to **API Keys** in the left sidebar
4. Click **Create API Key** → name it "Affirmation Dev" → click Create
5. **Copy the key** — it starts with `re_` — you'll only see it once
6. Save it somewhere safe (Notes app is fine for now)

> You don't need a domain for testing — Resend lets you send from `onboarding@resend.dev` in test mode.

---

### 3.2 OpenAI (AI Engine)

1. Go to **https://platform.openai.com** → click **Sign up**
2. Verify your phone number (required)
3. Go to **Billing** → **Add payment method** → add a card
4. Click **Set usage limit** → set $20 monthly limit (this prevents surprise bills)
5. Go to **API Keys** (left sidebar) → **Create new secret key**
6. Name it "Affirmation Dev" → click Create
7. **Copy the key** — starts with `sk-` — you won't see it again

> During testing you'll spend roughly $0.50–$2. GPT-4o costs about $0.01 per affirmation set.

---

### 3.3 Razorpay (Payments)

1. Go to **https://razorpay.com** → click **Sign Up**
2. Fill in your details (you'll need your PAN + business details for live mode, but test mode needs nothing)
3. After signing up, go to **Settings → API Keys**
4. Make sure you're in **TEST MODE** (toggle at top of dashboard — should say "Test Mode")
5. Click **Generate Key** → it creates a Key ID and Key Secret
6. **Copy both** — Key ID starts with `rzp_test_`

> Test mode uses fake money. You can complete payments without any real charges.
> When you go live later, you'll switch to Live Mode keys.

---

### 3.4 Cloudflare R2 (File Storage)

1. Go to **https://dash.cloudflare.com** → sign up (free)
2. In the left sidebar, click **R2 Object Storage**
3. Click **Create bucket**
   - Name: `affirmation-media`
   - Location: **APAC** (closer to India = faster)
   - Click Create
4. Now get API credentials:
   - Go to **R2 → Manage R2 API Tokens** (top right of R2 page)
   - Click **Create API Token**
   - Name: "Affirmation Dev"
   - Permissions: **Object Read & Write**
   - Specify bucket: choose `affirmation-media`
   - Click Create
5. **Copy all three values:**
   - Access Key ID
   - Secret Access Key
   - Your Account ID (shown on the R2 overview page, top right)

---

### 3.5 Bannerbear (Image Cards)

This is the most involved step — you need to design 3 card templates.

1. Go to **https://www.bannerbear.com** → sign up (free trial, 40 free renders)
2. After signing up, click **New Project** → name it "Affirmation Platform"
3. You need to create 3 templates. For each, click **New Template**:

**Template 1 — Infographic Card (daily affirmation)**
- Canvas: 1080×1080 (Instagram square)
- Add these text layers with EXACTLY these names:
  - `day_number` — e.g. "Day 1"
  - `doubt` — the inner doubt voice
  - `truth_statement` — the affirmation
  - `action_prompt` — today's action
- Design how you like (background colour, fonts, logo)
- Click **Save** → copy the **Template UID** (shown in URL and template settings)

**Template 2 — Progress Card**
- Canvas: 1080×1080
- Text layers (exact names):
  - `user_name`
  - `day_complete` — e.g. "Day 7 Complete"
  - `transformation_score` — e.g. "68/100"
  - `progress_counters` — e.g. "7 affirmation · 9 calendar"
- Save → copy Template UID

**Template 3 — Badge Card**
- Canvas: 1080×1080
- Text layers (exact names):
  - `user_name`
  - `badge_name` — e.g. "Journey Completer"
  - `track` — e.g. "Confidence"
- Save → copy Template UID

4. Get your API key: Go to **Account → API** → copy the API key (starts with `bb_pr_`)

> Tip: Start with a simple coloured background + big text. You can make it pretty later.
> Bannerbear has a template gallery — you can start from one of those and rename the text layers.

---

## PART 4 — Configure Your Environment

1. On your computer, open the `AffirmationTool` folder
2. Go into the `backend` folder
3. Find the file called `.env.docker`
4. **Make a copy** of it and name the copy `.env` (just `.env`, no other words)
5. Open `.env` in any text editor (TextEdit on Mac, Notepad on Windows)
6. Fill in every value that says `YOUR_KEY` or `CHANGE_ME`:

```
# These two — generate random strings (go to https://generate-secret.vercel.app/64 and copy)
JWT_SECRET=paste_64_char_random_string_here
JWT_REFRESH_SECRET=paste_different_64_char_random_string_here

# From Step 3.1 (Resend)
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=onboarding@resend.dev       ← keep this exactly if you don't have a domain yet

# From Step 3.2 (OpenAI)
OPENAI_API_KEY=sk-your_key_here

# From Step 3.3 (Razorpay)
RAZORPAY_KEY_ID=rzp_test_your_key
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=any_random_string_you_make_up  ← just type something random

# From Step 3.4 (Cloudflare R2)
CLOUDFLARE_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=affirmation-media

# From Step 3.5 (Bannerbear)
BANNERBEAR_API_KEY=bb_pr_your_key
BANNERBEAR_INFOGRAPHIC_TEMPLATE=your_template_uid
BANNERBEAR_PROGRESS_CARD_TEMPLATE=your_template_uid
BANNERBEAR_BADGE_TEMPLATE=your_template_uid

# Your email for admin access
ADMIN_EMAILS=your@email.com
```

**Leave these as-is** (they're already correct for Docker):
```
DATABASE_URL=postgresql://appuser:apppassword@postgres:5432/identity_platform
REDIS_URL=redis://redis:6379
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
```

**Skip these for now** (not needed for testing):
```
ELEVENLABS_API_KEY     ← audio generation, skip for now
SARVAM_API_KEY         ← audio generation, skip for now
FIREBASE_SERVICE_ACCOUNT_JSON  ← push notifications, skip for now
WHATSAPP_API_TOKEN     ← WhatsApp, skip for now
N8N_WEBHOOK_URL_*      ← n8n automation, skip for now
```

Save the file.

---

## PART 5 — Start the Backend

Open Terminal (Mac) or Command Prompt (Windows), navigate to the AffirmationTool folder:

```bash
cd path/to/AffirmationTool
```

Then run:

```bash
make up
```

This will:
- Download Postgres and Redis images (~500MB, one-time download)
- Build the backend container
- Start all 3 services

**Wait about 60 seconds**, then check if everything is running:

```bash
make health
```

You should see:
```json
{
  "status": "ok",
  "db": "2ms"
}
```

If you see that — **your backend is live at http://localhost:3001** 🎉

---

## PART 6 — Install Postman and Import the Collection

1. Go to **https://www.postman.com/downloads/** → download and install
2. Sign up for a free Postman account (or skip sign-in)
3. In Postman, click **Import** (top left)
4. Drag and drop these two files from your `AffirmationTool` folder:
   - `AffirmationPlatform.postman_collection.json`
   - `AffirmationPlatform.postman_environment.json`
5. After importing, click the **Environments** tab (eye icon, top right) → select **"Affirmation Local"**

---

## PART 7 — Run the Tests

The Postman collection is organized as a journey. Run them **in order**:

### Folder 1 — Auth
1. **Signup** — sends OTP to your email
2. Check your email inbox for the 6-digit OTP
3. **Verify OTP** — paste the OTP, you'll get an access token (auto-saved)
4. **Get Profile** — confirms you're logged in

### Folder 2 — Onboarding
Run each request in order. Each one saves the journey_id automatically.

### Folder 3 — Payment (Test Mode)
The payment flow uses Razorpay test mode — no real money.
After creating an order, use these test card details in Razorpay:
- Card: `4111 1111 1111 1111`
- Expiry: Any future date
- CVV: Any 3 digits

### Folder 4 — Journey
Morning complete → Evening complete → Check-in.

### Folder 5 — Coaching
Send a message to the AI coach.

---

## Troubleshooting

**`make up` fails immediately**
→ Make sure Docker Desktop is open and running (check menu bar icon)

**Health check returns "degraded"**
→ Database didn't start yet — wait 30 more seconds and try again

**OTP email not arriving**
→ Check spam folder. Also verify RESEND_API_KEY is correct in .env

**"Invalid API key" errors in logs**
→ Run `make logs-backend` to see which key is failing, recheck .env

**Content generation stuck**
→ This is normal without ElevenLabs/Sarvam keys — audio won't generate.
The affirmation text will still be created (OpenAI only).

---

## Useful Commands

```bash
make logs-backend    # see backend logs in real time
make shell-db        # open database to inspect tables
make restart         # restart backend after changing .env
make down            # stop everything
```

To inspect the database directly:
```sql
-- After running: make shell-db
SELECT * FROM users;
SELECT * FROM journeys;
SELECT * FROM affirmation_days LIMIT 5;
```

---

## What to Skip for the Pilot

These features need additional setup and can come after your first pilot users:

- **Audio generation** — needs ElevenLabs + Sarvam (add after pilot)
- **WhatsApp messages** — needs WhatsApp Business API approval (2–3 weeks lead time — start this process now in parallel)
- **Push notifications** — needs Firebase project setup
- **n8n automation workflows** — the backend works without n8n; it just won't send automated morning/evening reminders

Your pilot can run perfectly with: signup → AI affirmations → daily check-ins → progress tracking → coaching. That's the core value.
