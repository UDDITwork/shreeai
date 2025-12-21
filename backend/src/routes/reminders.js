import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { client } from '../models/database.js';
import { extractTimeExpression } from '../services/anthropic.js';
import { parseTimeExpression } from '../utils/time-parser.js';
import { randomUUID as uuidv4 } from 'crypto';

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { taskId, ideaId, timeExpression, reminderType } = req.body;
    const userId = req.user.userId;

    if (!timeExpression) {
      return res.status(400).json({ error: 'Time expression required' });
    }

    // Parse time expression
    let timeData = await extractTimeExpression(timeExpression);
    if (!timeData.time) {
      timeData = parseTimeExpression(timeExpression);
    }

    if (!timeData || !timeData.time) {
      return res.status(400).json({ error: 'Could not parse time expression' });
    }

    const reminderId = uuidv4();
    
    await client.execute({
      sql: 'INSERT INTO reminders (id, user_id, task_id, idea_id, scheduled_time, reminder_type) VALUES (?, ?, ?, ?, ?, ?)',
      args: [reminderId, userId, taskId || null, ideaId || null, timeData.time, reminderType || 'popup']
    });

    res.json({ 
      success: true, 
      reminderId,
      scheduledTime: timeData.time,
      description: timeData.description
    });
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = req.query.status || 'pending';
    
    const result = await client.execute({
      sql: 'SELECT * FROM reminders WHERE user_id = ? AND status = ? ORDER BY scheduled_time ASC',
      args: [userId, status]
    });

    res.json({ reminders: result.rows });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

router.patch('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    await client.execute({
      sql: 'UPDATE reminders SET status = ? WHERE id = ? AND user_id = ?',
      args: ['completed', id, userId]
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Complete reminder error:', error);
    res.status(500).json({ error: 'Failed to complete reminder' });
  }
});

export default router;

