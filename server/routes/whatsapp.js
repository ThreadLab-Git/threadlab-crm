const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ── Twilio client — lazily initialised so missing creds don't crash on boot ──
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || accountSid.startsWith('REPLACE_')) {
    throw new Error(
      'Twilio credentials not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to your .env file.'
    );
  }
  return require('twilio')(accountSid, authToken);
}

// ── Helper: normalise a phone number to E.164 format (+15551234567) ──────────
function toE164(raw) {
  if (!raw) return '';
  // Strip everything except digits and leading +
  const digits = raw.replace(/[^\d]/g, '');
  return '+' + digits;
}

// ── Helper: wrap a number in Twilio's whatsapp: prefix ───────────────────────
function toWA(raw) {
  const e164 = toE164(raw);
  return e164.startsWith('whatsapp:') ? e164 : 'whatsapp:' + e164;
}

// ── Helper: log to activity_logs ─────────────────────────────────────────────
async function logActivity(lead_id, lead_name, action, details = {}) {
  await supabase.from('activity_logs').insert({ lead_id, lead_name, action, details });
}

// ── GET /api/whatsapp/messages/:lead_id ──────────────────────────────────────
// Returns all WA messages for a lead, oldest first (for thread display)
router.get('/messages/:lead_id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('lead_id', req.params.lead_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /whatsapp/messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/send ───────────────────────────────────────────────────
// Sends an outbound WhatsApp message to a lead via Twilio
router.post('/send', async (req, res) => {
  const { lead_id, lead_name, to_number, body } = req.body;

  if (!lead_id || !to_number || !body) {
    return res.status(400).json({ error: 'lead_id, to_number, and body are required' });
  }

  try {
    const client     = getTwilioClient();
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. whatsapp:+14155238886
    const toFormatted = toWA(to_number);

    // Send via Twilio
    const message = await client.messages.create({
      from: fromNumber,
      to:   toFormatted,
      body,
    });

    // Persist to DB
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .insert({
        lead_id,
        direction:   'outbound',
        body,
        from_number: fromNumber,
        to_number:   toFormatted,
        twilio_sid:  message.sid,
        status:      message.status || 'queued',
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(lead_id, lead_name, 'whatsapp_sent', {
      preview: body.substring(0, 100),
      to:      toFormatted,
    });

    res.json({ success: true, message: data });
  } catch (err) {
    console.error('POST /whatsapp/send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/webhook ────────────────────────────────────────────────
// Twilio calls this endpoint when a lead replies to your WhatsApp number.
// It:
//   1. Matches the sender's number to a lead in the DB
//   2. Stores the inbound message
//   3. Automatically moves the lead to "Pending Reply" stage
//   4. Logs the activity
//
// Twilio sends the payload as URL-encoded form data — we handle that below.
router.post(
  '/webhook',
  express.urlencoded({ extended: false }),  // parse Twilio's form-encoded body
  async (req, res) => {
    // Always return valid TwiML so Twilio doesn't retry
    const emptyTwiML =
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

    try {
      const { From, Body, MessageSid } = req.body;

      if (!From || !Body) {
        return res.set('Content-Type', 'text/xml').send(emptyTwiML);
      }

      // Strip "whatsapp:" prefix and normalise to digits only for matching
      const senderRaw    = From.replace('whatsapp:', '');
      const senderDigits = senderRaw.replace(/\D/g, '');

      // Load all leads and find one whose phone matches
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, stage, pending_since, phone');

      if (leadsError) throw leadsError;

      const lead = (leads || []).find(
        (l) => l.phone && l.phone.replace(/\D/g, '') === senderDigits
      );

      if (lead) {
        // 1. Store the inbound message
        await supabase.from('whatsapp_messages').insert({
          lead_id:     lead.id,
          direction:   'inbound',
          body:        Body,
          from_number: From,
          to_number:   process.env.TWILIO_WHATSAPP_NUMBER || '',
          twilio_sid:  MessageSid || '',
          status:      'received',
        });

        // 2. Auto-move to "Pending Reply" if not already there
        if (lead.stage !== 'Pending Reply') {
          const updates = {
            stage:      'Pending Reply',
            updated_at: new Date().toISOString(),
          };
          if (!lead.pending_since) {
            updates.pending_since = new Date().toISOString();
          }
          await supabase.from('leads').update(updates).eq('id', lead.id);
          await logActivity(lead.id, lead.name, 'stage_changed', {
            stage:   'Pending Reply',
            trigger: 'whatsapp_inbound',
          });
        }

        // 3. Log the received message
        await logActivity(lead.id, lead.name, 'whatsapp_received', {
          preview: Body.substring(0, 100),
          from:    From,
        });
      } else {
        // Unknown sender — log for debugging but don't crash
        console.warn(`WhatsApp webhook: no lead found for number ${senderRaw}`);
      }

      res.set('Content-Type', 'text/xml').send(emptyTwiML);
    } catch (err) {
      console.error('WhatsApp webhook error:', err);
      // Still return 200 + empty TwiML to prevent Twilio retries
      res.set('Content-Type', 'text/xml').send(emptyTwiML);
    }
  }
);

module.exports = router;
