# n8n Workflows

Five workflows covering all automation for the Identity Change Platform.

| File | Purpose | Trigger |
|---|---|---|
| `01_morning_delivery.json` | Daily morning reminder via WhatsApp + FCM | Cron 6–9 AM |
| `02_evening_delivery.json` | Daily evening reminder via WhatsApp + FCM | Cron 7–9 PM |
| `03_content_pipeline.json` | Triggers BullMQ content generation after payment | Webhook |
| `04_day_completion.json` | Progress card + WhatsApp congratulations on day complete | Webhook |
| `05_reengagement_renewal.json` | 48hr nudge + Day 21 renewal prompts | Cron daily |

## Setup

1. Import each JSON file into your n8n instance via Settings → Import Workflow.
2. Configure credentials:
   - PostgreSQL: add DB connection under Credentials
   - WhatsApp Business API: add HTTP Header Auth with your WATI/Interakt token
   - HTTP Request nodes: set `X-Webhook-Secret` header for backend webhooks
3. Set environment variables in n8n:
   - `BACKEND_URL` — your API base URL
   - `WEBHOOK_SECRET` — matches N8N_WEBHOOK_SECRET in backend .env
   - `WHATSAPP_API_URL` — your WhatsApp BSP endpoint
   - `WHATSAPP_TOKEN` — API token
