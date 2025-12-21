import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { searchWeb } from '../services/firecrawler.js';
import { client } from '../models/database.js';
import { randomUUID as uuidv4 } from 'crypto';

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user.userId;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const searchResult = await searchWeb(query);

    // Store search
    const searchId = uuidv4();
    await client.execute({
      sql: 'INSERT INTO searches (id, user_id, query, results) VALUES (?, ?, ?, ?)',
      args: [searchId, userId, query, JSON.stringify(searchResult)]
    });

    res.json({
      success: searchResult.success,
      results: searchResult.results || [],
      searchId,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;

