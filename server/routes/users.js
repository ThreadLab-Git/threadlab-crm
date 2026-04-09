const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ── Auth middleware ────────────────────────────────────────────
// Validates the bearer token and attaches req.user + req.profile
async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  req.user = user;
  req.profile = profile;
  next();
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    if (!req.profile || req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ── GET /api/users/me ──────────────────────────────────────────
// Returns the calling user's profile. Auto-creates an admin profile
// for the very first user in the system (bootstrapping).
router.get('/me', requireAuth, async (req, res) => {
  if (req.profile) {
    // Mark as active on first real login
    if (req.profile.status === 'invited') {
      await supabase
        .from('user_profiles')
        .update({ status: 'active' })
        .eq('id', req.user.id);
      req.profile.status = 'active';
    }
    return res.json(req.profile);
  }

  // No profile exists — check if this is the first user (auto-promote to admin)
  const { count } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true });

  const role = (count === 0) ? 'admin' : 'viewer';
  const newProfile = {
    id: req.user.id,
    email: req.user.email,
    full_name: req.user.user_metadata?.full_name || '',
    role,
    status: 'active',
  };

  const { data, error } = await supabase
    .from('user_profiles')
    .insert(newProfile)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /api/users ─────────────────────────────────────────────
// Returns all user profiles. Admin only.
router.get('/', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/users/invite ─────────────────────────────────────
// Invites a new user by email. Supabase sends the setup email.
router.post('/invite', requireAdmin, async (req, res) => {
  const { email, role = 'editor', full_name = '' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Check if user already exists in profiles
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

  // Send Supabase invite email
  const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: siteUrl, data: { role, full_name } }
  );

  if (inviteError) return res.status(500).json({ error: inviteError.message });

  // Pre-create the profile record so role is set before they accept
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: inviteData.user.id,
      email,
      full_name,
      role,
      status: 'invited',
      invited_by: req.user.id,
    })
    .select()
    .single();

  if (profileError) return res.status(500).json({ error: profileError.message });
  res.status(201).json(profile);
});

// ── PATCH /api/users/:id/role ──────────────────────────────────
// Updates a user's role. Admin only. Cannot demote yourself.
router.patch('/:id/role', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'User not found' });
  res.json(data);
});

// ── DELETE /api/users/:id ──────────────────────────────────────
// Removes a user. Admin only. Cannot remove yourself.
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself' });
  }

  // Delete from Supabase Auth (cascades to user_profiles via FK)
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

module.exports = router;
