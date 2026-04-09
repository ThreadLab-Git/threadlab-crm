const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ── GET /api/events ──────────────────────────────────────────────────────────
// Returns all unique event names currently in the leads table
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('event_name')
      .not('event_name', 'is', null)
      .neq('event_name', '');

    if (error) throw error;

    const unique = [...new Set((data || []).map((r) => r.event_name))].sort();
    res.json(unique);
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
