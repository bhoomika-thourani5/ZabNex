const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

// Enforce Super Admin on all admin sub-routes
router.use(authMiddleware, requireRole(['super_admin']));

// GET /api/v1/admin/analytics - Global platform statistics and metrics
router.get('/analytics', async (req, res) => {
  try {
    const [userRes, postRes, societyRes, rsvpRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM posts'),
      pool.query('SELECT COUNT(*) FROM societies'),
      pool.query('SELECT COUNT(*) FROM rsvps')
    ]);

    await pool.query('REFRESH MATERIALIZED VIEW trending_posts');
    const { rows: trendingPosts } = await pool.query('SELECT * FROM trending_posts');

    const { rows: postsByType } = await pool.query('SELECT type, COUNT(id) FROM posts GROUP BY type');
    
    const { rows: campusDistribution } = await pool.query(`
      SELECT COALESCE(c.name, 'Unknown Campus') as campus_name, 
             COALESCE(c.block_number, 'N/A') as block_number, 
             COUNT(u.id) as count
      FROM users u
      LEFT JOIN campuses c ON u.campus_id = c.id
      GROUP BY c.id, c.name, c.block_number
    `);

    res.status(200).json({
      totals: {
        users: parseInt(userRes.rows[0].count),
        posts: parseInt(postRes.rows[0].count),
        societies: parseInt(societyRes.rows[0].count),
        rsvps: parseInt(rsvpRes.rows[0].count),
      },
      posts_by_type: postsByType.map(p => ({ type: p.type, count: parseInt(p.count) })),
      campus_distribution: campusDistribution.map(c => ({
        campus_name: c.campus_name,
        block_number: c.block_number,
        count: parseInt(c.count)
      })),
      trending_posts: trendingPosts,
    });
  } catch (error) {
    console.error('Super Admin Global Analytics Error:', error);
    res.status(500).json({ error: 'Internal server error rendering admin analytics.' });
  }
});

// GET /api/v1/admin/dashboard - System summary dashboard listings
router.get('/dashboard', async (req, res) => {
  try {
    const { rows: recentUsers } = await pool.query(`
      SELECT id, email, full_name, role, is_active, created_at
      FROM users ORDER BY created_at DESC LIMIT 5
    `);

    const { rows: pendingSocieties } = await pool.query(`
      SELECT s.*, row_to_json(c.*) as campus, row_to_json(u.*) as creator
      FROM societies s
      LEFT JOIN campuses c ON s.campus_id = c.id
      LEFT JOIN (SELECT id, full_name, email FROM users) u ON s.created_by = u.id
      WHERE s.is_active = false
    `);

    const { rows: activeSocieties } = await pool.query(`
      SELECT s.*, row_to_json(c.*) as campus, row_to_json(u.*) as creator
      FROM societies s
      LEFT JOIN campuses c ON s.campus_id = c.id
      LEFT JOIN (SELECT id, full_name, email FROM users) u ON s.created_by = u.id
      WHERE s.is_active = true
    `);

    res.status(200).json({
      recent_users: recentUsers,
      pending_societies: pendingSocieties,
      active_societies: activeSocieties,
    });
  } catch (error) {
    console.error('Super Admin Dashboard Details Error:', error);
    res.status(500).json({ error: 'Internal server error loading dashboard summary.' });
  }
});

module.exports = router;
