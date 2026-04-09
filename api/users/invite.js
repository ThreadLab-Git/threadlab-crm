// POST /api/users/invite — invite a new user by email (admin only)
const { getSupabase, getAuthUser } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, profile, error } = await getAuthUser(req);
  if (error) return res.status(401).json({ error });
  if (!profile || profile.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const { email, role = 'editor', full_name = '' } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const sb = getSupabase();

  // Check for existing profile
  const { data: existing } = await sb.from('user_profiles').select('id').eq('email', email).single();
  if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
  const { data: inviteData, error: inviteError } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl,
    data: { role, full_name },
  });
  if (inviteError) return res.status(500).json({ error: inviteError.message });

  const { data: newProfile, error: profileError } = await sb
    .from('user_profiles')
    .insert({ id: inviteData.user.id, email, full_name, role, status: 'invited', invited_by: user.id })
    .select()
    .single();

  if (profileError) return res.status(500).json({ error: profileError.message });
  res.status(201).json(newProfile);
};
