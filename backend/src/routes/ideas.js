import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { client } from '../models/database.js';
import { generateEmbedding } from '../services/embeddings.js';
import { upsertVector } from '../services/vector-store.js';
import { randomUUID as uuidv4 } from 'crypto';

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, type, metadata } = req.body;
    const userId = req.user.userId;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    const ideaId = uuidv4();
    
    await client.execute({
      sql: 'INSERT INTO ideas (id, user_id, title, content, type, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      args: [ideaId, userId, title || null, content, type || 'idea', JSON.stringify(metadata || {})]
    });

    // Store embedding
    const embedding = await generateEmbedding(`${title || ''} ${content}`);
    await upsertVector(`idea_${ideaId}`, embedding, {
      userId,
      ideaId,
      type: 'idea',
      title: title || 'Untitled',
    });

    res.json({ success: true, ideaId });
  } catch (error) {
    console.error('Save idea error:', error);
    res.status(500).json({ error: 'Failed to save idea' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await client.execute({
      sql: 'SELECT * FROM ideas WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId]
    });

    res.json({ ideas: result.rows });
  } catch (error) {
    console.error('Get ideas error:', error);
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
});

export default router;

