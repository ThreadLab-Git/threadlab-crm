# WhatsApp Integration Setup Guide

This guide walks you through activating the Twilio WhatsApp integration in your Threadlab CRM.

---

## Step 1 — Create a Twilio Account

1. Go to [https://www.twilio.com](https://www.twilio.com) and sign up for a free account.
2. From your Twilio Console, note your **Account SID** and **Auth Token** (on the dashboard homepage).

---

## Step 2 — Enable WhatsApp

### Option A: Sandbox (free, for testing — recommended to start)

1. In the Twilio Console, go to **Messaging → Try it out → Send a WhatsApp message**.
2. Follow the on-screen instructions to join the sandbox (you'll send a join code from your own WhatsApp number).
3. The sandbox number is: `+1 415 523 8886`

### Option B: Production WhatsApp Business number (for live use)

1. Go to **Messaging → Senders → WhatsApp senders** and register a WhatsApp Business number.
2. This requires a Facebook Business Manager account and Meta approval (typically 1–3 days).

---

## Step 3 — Configure your .env

Open `.env` and fill in your credentials:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# Sandbox number (for testing):
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# OR your approved production number:
# TWILIO_WHATSAPP_NUMBER=whatsapp:+61XXXXXXXXX
```

---

## Step 4 — Run the DB migration

In your **Supabase dashboard → SQL Editor**, run the following to add the messages table:

```sql
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        REFERENCES leads(id) ON DELETE CASCADE,
  direction    TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body         TEXT        NOT NULL DEFAULT '',
  from_number  TEXT        DEFAULT '',
  to_number    TEXT        DEFAULT '',
  twilio_sid   TEXT        DEFAULT '',
  status       TEXT        DEFAULT 'sent',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_lead_id ON whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON whatsapp_messages(created_at DESC);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
```

---

## Step 5 — Install the Twilio package

In your project folder, run:

```bash
npm install
```

This installs the `twilio` SDK that was added to `package.json`.

---

## Step 6 — Configure the Twilio Webhook (for incoming replies)

This is what makes replies automatically appear in the CRM and move leads to **Pending Reply**.

1. In the Twilio Console, go to **Messaging → Senders → WhatsApp senders** (or Sandbox settings for testing).
2. Set the **"A message comes in"** webhook URL to:

   ```
   https://YOUR-DEPLOYED-URL.com/api/whatsapp/webhook
   ```

   Replace `YOUR-DEPLOYED-URL.com` with your actual server domain (e.g. your Vercel/Railway/VPS URL).

3. Make sure the method is set to **HTTP POST**.

4. Save.

---

## Step 7 — Restart your server

```bash
npm start
```

---

## How it works in the CRM

### Sending a message
1. Open any lead with a phone number saved.
2. A **💬 WhatsApp Thread** section appears at the bottom of their profile.
3. Click **+ Send Message** (or the existing 📱 WhatsApp button in the email actions area).
4. A pre-filled message appears — edit it freely, then hit **Send via WhatsApp**.
5. The message is sent via Twilio and saved to the thread immediately.

### Receiving replies
- When a lead replies to your WhatsApp number, Twilio calls the webhook.
- The CRM automatically:
  - Finds the matching lead by phone number
  - Saves their reply to the thread
  - Moves their stage to **🔔 Pending Reply**
  - Logs the activity

### Viewing the thread
- Open a lead profile — the WhatsApp Thread section shows all messages (yours and theirs), oldest first, styled like a chat.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Twilio credentials not configured" error | Check your `.env` values — make sure SID/Token are real, not the placeholder text |
| Messages send but lead doesn't receive | For Sandbox: the lead must have joined the sandbox first by messaging `join <keyword>` to `+14155238886` |
| Incoming webhook not triggering | Check the webhook URL is correct and publicly accessible; use a tool like [webhook.site](https://webhook.site) to test |
| Lead not found when reply comes in | Make sure the phone number in the CRM exactly matches what the lead is messaging from (including country code) |

---

## Phone number format

Phone numbers in the CRM should be saved in **international format**, e.g.:
- `+61412345678` (Australia)
- `+33612345678` (France)
- `+15551234567` (USA)

The integration strips formatting characters (spaces, dashes, parentheses) automatically during matching, so `+33 6 12 34 56 78` will also match.
