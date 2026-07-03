const pool = require('../config/db');

// Enforce role checks
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Unauthorized: No active session.' });
    }

    const userRole = req.session.user.role;
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  };
}

// Enforce post ownership (Only post author or Super Admin can edit/delete)
async function requirePostOwnership(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: No active session.' });
    }

    if (user.role === 'super_admin') {
      return next(); // Super Admins bypass ownership checks
    }

    const { rows } = await pool.query('SELECT author_id, society_id FROM posts WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const post = rows[0];

    if (post.author_id !== user.id) {
      if (post.society_id && user.role === 'society_admin') {
        const checkRes = await pool.query(
          "SELECT id FROM society_members WHERE society_id = $1 AND user_id = $2 AND role IN ('president', 'marketing')",
          [post.society_id, user.id]
        );
        if (checkRes.rows.length > 0) {
          return next();
        }
      }
      return res.status(403).json({ error: 'Forbidden: You are not the owner of this post.' });
    }

    next();
  } catch (error) {
    console.error('Error in requirePostOwnership middleware:', error);
    res.status(500).json({ error: 'Internal server error during authorization check.' });
  }
}

// Enforce society admin rights (Only matching Society President, Marketing admin, or Super Admin can manage)
function requireSocietyAdminRights() {
  return async (req, res, next) => {
    try {
      const societyId = req.params.id || req.body.society_id;
      const user = req.session.user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: No active session.' });
      }

      if (user.role === 'super_admin') {
        return next(); // Super Admins bypass
      }

      if (!societyId) {
        return res.status(400).json({ error: 'Society ID is required.' });
      }

      const checkRes = await pool.query(
        "SELECT id FROM society_members WHERE society_id = $1 AND user_id = $2 AND role IN ('president', 'marketing')",
        [societyId, user.id]
      );

      if (checkRes.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: You do not have admin rights for this society.' });
      }

      next();
    } catch (error) {
      console.error('Error in requireSocietyAdminRights middleware:', error);
      res.status(500).json({ error: 'Internal server error during authorization check.' });
    }
  };
}

module.exports = {
  requireRole,
  requirePostOwnership,
  requireSocietyAdminRights,
};
