const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

// GET /api/v1/campuses - List all campuses (Public)
router.get('/', async (req, res) => {
  try {
    const { rows: campuses } = await pool.query('SELECT * FROM campuses ORDER BY block_number ASC');
    res.status(200).json(campuses);
  } catch (error) {
    console.error('Fetch Campuses Error:', error);
    res.status(500).json({ error: 'Internal server error fetching campuses.' });
  }
});

// GET /api/v1/campuses/:id - Get single campus detail (Public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM campuses WHERE id = $1', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Campus block not found.' });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Fetch Campus Detail Error:', error);
    res.status(500).json({ error: 'Internal server error fetching campus.' });
  }
});

// POST /api/v1/campuses - Create new campus (Super Admin only)
router.post('/', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const { block_number, name, address } = req.body;

    if (!block_number) {
      return res.status(400).json({ error: 'Block number is required.' });
    }

    const checkRes = await pool.query('SELECT id FROM campuses WHERE block_number = $1', [block_number]);
    if (checkRes.rows.length > 0) {
      return res.status(400).json({ error: `Campus Block ${block_number} already exists.` });
    }

    const insertRes = await pool.query(
      'INSERT INTO campuses (block_number, name, address) VALUES ($1, $2, $3) RETURNING *',
      [block_number, name, address]
    );

    res.status(201).json({ message: 'Campus block created successfully.', campus: insertRes.rows[0] });
  } catch (error) {
    console.error('Create Campus Error:', error);
    res.status(500).json({ error: 'Internal server error creating campus.' });
  }
});

// PUT /api/v1/campuses/:id - Update campus details (Super Admin only)
router.put('/:id', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { block_number, name, address } = req.body;

    const checkRes = await pool.query('SELECT * FROM campuses WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campus block not found.' });
    }
    const campus = checkRes.rows[0];

    // Check if new block_number conflicts with another
    if (block_number && block_number !== campus.block_number) {
      const conflictRes = await pool.query('SELECT id FROM campuses WHERE block_number = $1', [block_number]);
      if (conflictRes.rows.length > 0) {
        return res.status(400).json({ error: `Campus Block ${block_number} already exists.` });
      }
    }

    const updateRes = await pool.query(
      'UPDATE campuses SET block_number = $1, name = $2, address = $3 WHERE id = $4 RETURNING *',
      [block_number, name, address, id]
    );

    res.status(200).json({ message: 'Campus block updated successfully.', campus: updateRes.rows[0] });
  } catch (error) {
    console.error('Update Campus Error:', error);
    res.status(500).json({ error: 'Internal server error updating campus.' });
  }
});

module.exports = router;
