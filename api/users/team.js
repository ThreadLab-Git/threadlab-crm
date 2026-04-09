// GET /api/users/team — returns active team members for any authenticated user.
// Used to populate "Assigned To" dropdowns throughout the app.
const { getAuthUser } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { supabase, error } = await getAuthUser(req);
  if (error) return res.status(401).json({ error });

  const { data, error: listError } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, status')
    .eq('status', 'active')
    .order('full_name', { ascending: true });

  if (listError) return res.status(500).json({ error: listError.message });
  res.json(data);
};
