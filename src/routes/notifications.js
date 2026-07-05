const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// GET /api/v1/notifications - Get all notifications for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Fetch Notifications Error:', error);
    res.status(500).json({ error: 'Internal server error fetching notifications.' });
  }
});

// PUT /api/v1/notifications/read-all - Mark all notifications as read (MUST be before /:id routes)
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rowCount } = await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
    res.status(200).json({ message: 'All notifications marked as read.', count: rowCount });
  } catch (error) {
    console.error('Mark All Read Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/v1/notifications/:id/read - Mark single notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const { rows } = await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Notification not found.' });

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Mark Read Notification Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/v1/notifications/:id - Delete a notification
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    const { rowCount } = await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Notification not found.' });

    res.status(200).json({ message: 'Notification deleted successfully.' });
  } catch (error) {
    console.error('Delete Notification Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
