// PATCH /api/users/:id — update role (admin only)
// DELETE /api/users/:id — remove user (admin only)
const { getSupabase, getAuthUser } = require('../_auth');

module.exports = async (req, res) => {
  const { user, profile, supabase, error } = await getAuthUser(req);
  if (error) return res.status(401).json({ error });
  if (!profile || profile.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  // Vercel puts dynamic segment in req.query
  const id = req.query.id;

  if (req.method === 'PATCH') {
    const { role } = req.body || {};
    if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (id === user.id) return res.status(400).json({ error: 'You cannot change your own role' });

    const { data, error: updateError } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    if (id === user.id) return res.status(400).json({ error: 'You cannot remove yourself' });

    const sb = getSupabase();
    const { error: deleteError } = await sb.auth.admin.deleteUser(id);
    if (deleteError) return res.status(500).json({ error: deleteError.message });
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
