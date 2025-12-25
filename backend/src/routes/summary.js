import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { generateUserSummary, sendSummaryEmail, triggerSummaryForUser } from '../services/summary-generator.js';
import { client } from '../models/database.js';

const router = express.Router();

// Generate summary for current user
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { hours = 12, sendEmail = false } = req.body;

    const io = req.app.get('io');
    const summary = await generateUserSummary(userId, hours);

    if (sendEmail) {
      await sendSummaryEmail(userId, summary);
    }

    // Emit via WebSocket
    if (io) {
      io.to(userId).emit('summary', {
        type: 'manual_summary',
        summary: summary.summaryText,
        data: summary.data,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      summary: summary.summaryText,
      data: summary.data,
      emailSent: sendEmail
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Get past summaries
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 10;

    const result = await client.execute({
      sql: `SELECT id, period_start, period_end, summary_text, data, sent_via, created_at
            FROM summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      args: [userId, limit]
    });

    res.json({
      summaries: result.rows.map(row => ({
        ...row,
        data: JSON.parse(row.data || '{}')
      }))
    });
  } catch (error) {
    console.error('Get summary history error:', error);
    res.status(500).json({ error: 'Failed to fetch summaries' });
  }
});

// Get latest summary
router.get('/latest', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await client.execute({
      sql: `SELECT id, period_start, period_end, summary_text, data, sent_via, created_at
            FROM summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      args: [userId]
    });

    if (result.rows.length === 0) {
      return res.json({ summary: null });
    }

    const row = result.rows[0];
    res.json({
      summary: {
        ...row,
        data: JSON.parse(row.data || '{}')
      }
    });
  } catch (error) {
    console.error('Get latest summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
