-- ============================================================
-- Threadlab CRM — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
-- ============================================================

-- ── leads ────────────────────────────────────────────────────────────────────
-- Core lead/contact table. Stage, personal notes and pending timestamp
-- are stored here directly for simplicity; activity_logs captures history.

CREATE TABLE IF NOT EXISTS leads (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT        NOT NULL,
  company          TEXT        NOT NULL,
  email            TEXT        DEFAULT '',
  phone            TEXT        DEFAULT '',
  type             TEXT        DEFAULT 'Brand'
                               CHECK (type IN ('Brand','Retail','Manufacturing','Print','Other')),
  size             TEXT        DEFAULT 'Medium'
                               CHECK (size IN ('Enterprise','Large','Medium','Small','Startup')),
  priority         TEXT        DEFAULT 'Warm'
                               CHECK (priority IN ('Big Fish','Hot','Warm','Cold')),
  preferred_contact TEXT       DEFAULT 'Email'
                               CHECK (preferred_contact IN ('Email','Phone','WhatsApp','Unknown')),
  location         TEXT        DEFAULT '',
  event_name       TEXT        DEFAULT '',
  interests        TEXT[]      DEFAULT '{}',
  notes            TEXT        DEFAULT '',
  score            INTEGER     DEFAULT 0,

  -- Pipeline state
  stage            TEXT        DEFAULT 'New'
                               CHECK (stage IN ('New','Reached Out','Pending Reply','Proposal Sent','In Discussion','Won','Dropped')),
  pending_since    TIMESTAMPTZ,          -- Set when stage first becomes "Pending Reply"

  -- Assignment
  assigned_to      UUID,                             -- FK to auth.users(id), soft reference

  -- Personal notes (Daniel's private follow-up notes)
  personal_note    TEXT        DEFAULT '',

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── events ───────────────────────────────────────────────────────────────────
-- Optional: pre-register events/expos for richer metadata.
-- The leads table also stores event_name as free text, so this table
-- is for future use (dates, location, notes per show).

CREATE TABLE IF NOT EXISTS events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  location    TEXT        DEFAULT '',
  event_date  DATE,
  notes       TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── activity_logs ─────────────────────────────────────────────────────────────
-- Append-only log of every meaningful action on a lead.
-- action examples: 'created', 'updated', 'stage_changed', 'note_saved'

CREATE TABLE IF NOT EXISTS activity_logs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id    UUID        REFERENCES leads(id) ON DELETE CASCADE,
  lead_name  TEXT,
  action     TEXT        NOT NULL,
  details    JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_event_name   ON leads(event_name);
CREATE INDEX IF NOT EXISTS idx_leads_stage        ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_priority     ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_score        ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to  ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activity_lead_id   ON activity_logs(lead_id);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── whatsapp_messages ─────────────────────────────────────────────────────────
-- Stores all inbound and outbound WhatsApp messages per lead.
-- direction: 'outbound' = sent by Daniel via CRM, 'inbound' = reply from lead.
-- Inbound messages are created by the Twilio webhook and automatically trigger
-- the lead's stage to move to 'Pending Reply'.

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

-- ── user_profiles ─────────────────────────────────────────────────────────────
-- Stores role and metadata for each authenticated user.
-- Created automatically when a user is invited or on first admin login.
-- role: 'admin' = full access + manage team, 'editor' = full lead CRUD,
--       'viewer' = read-only

CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT        DEFAULT '',
  role        TEXT        NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin','editor','viewer')),
  status      TEXT        NOT NULL DEFAULT 'invited'
                          CHECK (status IN ('invited','active')),
  invited_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security (RLS) ──────────────────────────────────────────────────
-- The server uses the service role key (bypasses RLS), so we enable RLS
-- but do not add public policies. This keeps the data private to the server.

ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles      ENABLE ROW LEVEL SECURITY;
