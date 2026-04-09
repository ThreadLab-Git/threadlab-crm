const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const SEED = require('../data/seed');

// ── Helper: map DB row → camelCase client object ─────────────────────────────
function mapLead(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email || '',
    phone: row.phone || '',
    type: row.type || 'Brand',
    size: row.size || 'Medium',
    priority: row.priority || 'Warm',
    preferredContact: row.preferred_contact || 'Email',
    location: row.location || '',
    event: row.event_name || '',
    interests: row.interests || [],
    notes: row.notes || '',
    score: row.score || 0,
    stage: row.stage || 'New',
    pendingSince: row.pending_since || null,
    personalNote: row.personal_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Helper: map camelCase client payload → DB snake_case ─────────────────────
function toDbRow(body) {
  return {
    name: body.name,
    company: body.company,
    email: body.email || '',
    phone: body.phone || '',
    type: body.type || 'Brand',
    size: body.size || 'Medium',
    priority: body.priority || 'Warm',
    preferred_contact: body.preferredContact || 'Email',
    location: body.location || '',
    event_name: body.event || '',
    interests: Array.isArray(body.interests) ? body.interests : [],
    notes: body.notes || '',
    score: body.score || 0,
    stage: body.stage || 'New',
  };
}

// ── Helper: log to activity_logs ─────────────────────────────────────────────
async function logActivity(lead_id, lead_name, action, details = {}) {
  await supabase.from('activity_logs').insert({
    lead_id,
    lead_name,
    action,
    details,
  });
}

// ── GET /api/leads ───────────────────────────────────────────────────────────
// Returns all leads ordered by score desc
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('score', { ascending: false });

    if (error) throw error;
    res.json((data || []).map(mapLead));
  } catch (err) {
    console.error('GET /leads error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Lead not found' });
    res.json(mapLead(data));
  } catch (err) {
    console.error('GET /leads/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/leads ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const row = toDbRow(req.body);
    const { data, error } = await supabase
      .from('leads')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    await logActivity(data.id, data.name, 'created', { priority: data.priority, size: data.size });
    res.status(201).json(mapLead(data));
  } catch (err) {
    console.error('POST /leads error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/leads/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const row = toDbRow(req.body);
    row.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('leads')
      .update(row)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    await logActivity(data.id, data.name, 'updated', { fields: Object.keys(req.body) });
    res.json(mapLead(data));
  } catch (err) {
    console.error('PUT /leads/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/leads/:id/stage ───────────────────────────────────────────────
router.patch('/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage is required' });

    const updates = {
      stage,
      updated_at: new Date().toISOString(),
    };

    // Record when a lead first enters Pending Reply
    if (stage === 'Pending Reply') {
      const { data: existing } = await supabase
        .from('leads')
        .select('pending_since, name')
        .eq('id', req.params.id)
        .single();

      if (existing && !existing.pending_since) {
        updates.pending_since = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    await logActivity(data.id, data.name, 'stage_changed', { stage });
    res.json(mapLead(data));
  } catch (err) {
    console.error('PATCH /leads/:id/stage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/leads/:id/personal-note ──────────────────────────────────────
router.patch('/:id/personal-note', async (req, res) => {
  try {
    const { note } = req.body;
    const { data, error } = await supabase
      .from('leads')
      .update({ personal_note: note, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(mapLead(data));
  } catch (err) {
    console.error('PATCH /leads/:id/personal-note error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id/activity ──────────────────────────────────────────────
router.get('/:id/activity', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /leads/:id/activity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/leads/seed ─────────────────────────────────────────────────────
// Seeds the DB with SEED data — only if the leads table is empty.
router.post('/seed', async (req, res) => {
  try {
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    if (count > 0) {
      // Already seeded — just return existing leads
      const { data } = await supabase
        .from('leads')
        .select('*')
        .order('score', { ascending: false });
      return res.json((data || []).map(mapLead));
    }

    // Calculate scores and insert
    const rows = SEED.map((c) => ({
      ...toDbRow({ ...c, preferredContact: c.preferred_contact }),
      score: calcScore(c),
      stage: c.stage || 'New',
      event_name: c.event_name || '',
    }));

    const { data, error } = await supabase
      .from('leads')
      .insert(rows)
      .select();

    if (error) throw error;
    res.status(201).json((data || []).map(mapLead));
  } catch (err) {
    console.error('POST /leads/seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Score calculation mirrored from the frontend
function calcScore(c) {
  const s = { Enterprise: 48, Large: 38, Medium: 28, Small: 16, Startup: 12 }[c.size] || 12;
  const p = { 'Big Fish': 42, Hot: 32, Warm: 18, Cold: 4 }[c.priority] || 4;
  return Math.min(100, s + p + (c.email ? 5 : 0) + (c.phone ? 3 : 0));
}

module.exports = router;
