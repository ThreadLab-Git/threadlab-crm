// GET /api/users/me — returns the current user's profile.
// Auto-creates an admin profile for the very first user (bootstrapping).
const { getSupabase, getAuthUser } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user, profile, supabase, error } = await getAuthUser(req);
  if (error) return res.status(401).json({ error });

  if (profile) {
    if (profile.status === 'invited') {
      await supabase.from('user_profiles').update({ status: 'active' }).eq('id', user.id);
      profile.status = 'active';
    }
    return res.json(profile);
  }

  // No profile yet — first user becomes admin, all others get viewer
  const sb = getSupabase();
  const { count } = await sb
    .from('user_profiles')
    .select('id', { count: 'exact', head: true });

  const role = count === 0 ? 'admin' : 'viewer';
  const { data, error: createError } = await sb
    .from('user_profiles')
    .insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      role,
      status: 'active',
    })
    .select()
    .single();

  if (createError) return res.status(500).json({ error: createError.message });
  res.json(data);
};
