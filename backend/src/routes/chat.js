import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { client } from '../models/database.js';
import { executeAgentTask } from '../services/agent.js';
import { searchSimilarConversations, storeConversationEmbedding } from '../services/vector-store.js';
import { randomUUID as uuidv4 } from 'crypto';

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.userId;

    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Store user message
    const conversationId = uuidv4();
    await client.execute({
      sql: 'INSERT INTO conversations (id, user_id, message, role) VALUES (?, ?, ?, ?)',
      args: [conversationId, userId, message, 'user']
    });

    // Search for relevant context
    const similarConversations = await searchSimilarConversations(userId, message, 3);
    const context = similarConversations
      .map(c => c.metadata?.text)
      .filter(Boolean)
      .join('\n');

    // Always use the agent for processing - it handles all intents intelligently
    const agentResult = await executeAgentTask(userId, message, context);
    let response = agentResult.result || 'I\'ve processed your request.';

    // Get intent for logging purposes
    const intent = { intent: agentResult.toolResults?.length > 0 ? agentResult.toolResults[0].tool : 'chat' };

    // Store assistant response
    const responseId = uuidv4();
    await client.execute({
      sql: 'INSERT INTO conversations (id, user_id, message, response, role) VALUES (?, ?, ?, ?, ?)',
      args: [responseId, userId, message, response, 'assistant']
    });

    // Store embedding
    await storeConversationEmbedding(userId, conversationId, `${message} ${response}`, {
      conversationId,
      intent: intent.intent,
    });

    // Emit WebSocket event if needed
    const io = req.app.get('io');
    if (io) {
      io.to(userId).emit('chat_message', {
        id: responseId,
        message: response,
        role: 'assistant',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      response,
      intent: intent.intent,
      conversationId: responseId,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;

    const result = await client.execute({
      sql: 'SELECT id, message, response, role, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      args: [userId, limit]
    });

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;

