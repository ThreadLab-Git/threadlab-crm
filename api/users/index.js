// GET /api/users — list all team members (admin only)
const { getAuthUser } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { profile, supabase, error } = await getAuthUser(req);
  if (error) return res.status(401).json({ error });
  if (!profile || profile.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const { data, error: listError } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (listError) return res.status(500).json({ error: listError.message });
  res.json(data);
};
