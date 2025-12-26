/**
 * Profile API Routes
 * Handles user profile, contacts, income sources, and protected time blocks
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getOrCreateProfile,
  updateProfile,
  getIncomeSources,
  recordIncomeSource,
  getContacts,
  addOrUpdateContact,
  findContact,
  getPersonalizedContext
} from '../services/personalization.js';
import {
  createProtectedTimeBlock,
  getProtectedTimeBlocks,
  deleteProtectedTimeBlock,
  generateOptimizedSchedule,
  getMoneyTimeAnalysis,
  getTimeSavingsSummary
} from '../services/productivity-optimizer.js';
import { triggerBriefing, getProactiveMessages, acknowledgeProactiveMessage } from '../services/proactive-engine.js';

const router = express.Router();

// ============================================
// PROFILE ENDPOINTS
// ============================================

/**
 * GET /api/profile
 * Get user profile
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/profile
 * Update user profile
 */
router.put('/', authenticateToken, async (req, res) => {
  try {
    const profile = await updateProfile(req.user.id, req.body);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * GET /api/profile/context
 * Get full personalized context (for AI agent)
 */
router.get('/context', authenticateToken, async (req, res) => {
  try {
    const context = await getPersonalizedContext(req.user.id);
    res.json({ success: true, context });
  } catch (error) {
    console.error('Error getting context:', error);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// ============================================
// CONTACTS ENDPOINTS
// ============================================

/**
 * GET /api/profile/contacts
 * Get all contacts
 */
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const contacts = await getContacts(req.user.id);
    res.json({ success: true, contacts });
  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

/**
 * POST /api/profile/contacts
 * Add a new contact
 */
router.post('/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, relationship, phone, email, birthday, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Contact name is required' });
    }

    const contactId = await addOrUpdateContact(req.user.id, {
      name, relationship, phone, email, birthday, notes
    });

    res.json({ success: true, contactId });
  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

/**
 * GET /api/profile/contacts/search
 * Search for a contact by name
 */
router.get('/contacts/search', authenticateToken, async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Name query is required' });
    }

    const contact = await findContact(req.user.id, name);
    res.json({ success: true, contact });
  } catch (error) {
    console.error('Error searching contact:', error);
    res.status(500).json({ error: 'Failed to search contact' });
  }
});

// ============================================
// INCOME SOURCES ENDPOINTS
// ============================================

/**
 * GET /api/profile/income-sources
 * Get income sources ranked by priority
 */
router.get('/income-sources', authenticateToken, async (req, res) => {
  try {
    const sources = await getIncomeSources(req.user.id);
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error getting income sources:', error);
    res.status(500).json({ error: 'Failed to get income sources' });
  }
});

/**
 * POST /api/profile/income-sources
 * Record an income
 */
router.post('/income-sources', authenticateToken, async (req, res) => {
  try {
    const { source, amount, time_spent } = req.body;

    if (!source || !amount) {
      return res.status(400).json({ error: 'Source and amount are required' });
    }

    await recordIncomeSource(req.user.id, { source, amount, time_spent });
    res.json({ success: true, message: 'Income recorded' });
  } catch (error) {
    console.error('Error recording income:', error);
    res.status(500).json({ error: 'Failed to record income' });
  }
});

// ============================================
// PROTECTED TIME BLOCKS ENDPOINTS
// ============================================

/**
 * GET /api/profile/time-blocks
 * Get protected time blocks
 */
router.get('/time-blocks', authenticateToken, async (req, res) => {
  try {
    const blocks = await getProtectedTimeBlocks(req.user.id);
    res.json({ success: true, blocks });
  } catch (error) {
    console.error('Error getting time blocks:', error);
    res.status(500).json({ error: 'Failed to get time blocks' });
  }
});

/**
 * POST /api/profile/time-blocks
 * Create a protected time block
 */
router.post('/time-blocks', authenticateToken, async (req, res) => {
  try {
    const { block_name, purpose, start_time, end_time, days_of_week, expected_roi } = req.body;

    if (!block_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Block name, start time, and end time are required' });
    }

    const blockId = await createProtectedTimeBlock(req.user.id, {
      block_name, purpose, start_time, end_time, days_of_week, expected_roi
    });

    res.json({ success: true, blockId });
  } catch (error) {
    console.error('Error creating time block:', error);
    res.status(500).json({ error: 'Failed to create time block' });
  }
});

/**
 * DELETE /api/profile/time-blocks/:blockId
 * Delete a protected time block
 */
router.delete('/time-blocks/:blockId', authenticateToken, async (req, res) => {
  try {
    await deleteProtectedTimeBlock(req.user.id, req.params.blockId);
    res.json({ success: true, message: 'Time block deleted' });
  } catch (error) {
    console.error('Error deleting time block:', error);
    res.status(500).json({ error: 'Failed to delete time block' });
  }
});

// ============================================
// PRODUCTIVITY & SCHEDULE ENDPOINTS
// ============================================

/**
 * GET /api/profile/schedule
 * Get optimized daily schedule
 */
router.get('/schedule', authenticateToken, async (req, res) => {
  try {
    const schedule = await generateOptimizedSchedule(req.user.id);
    res.json({ success: true, schedule });
  } catch (error) {
    console.error('Error getting schedule:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

/**
 * GET /api/profile/money-analysis
 * Get money-time analysis
 */
router.get('/money-analysis', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const analysis = await getMoneyTimeAnalysis(req.user.id, days);
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error getting money analysis:', error);
    res.status(500).json({ error: 'Failed to get money analysis' });
  }
});

/**
 * GET /api/profile/time-savings
 * Get time savings summary
 */
router.get('/time-savings', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const summary = await getTimeSavingsSummary(req.user.id, days);
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error getting time savings:', error);
    res.status(500).json({ error: 'Failed to get time savings' });
  }
});

// ============================================
// PROACTIVE MESSAGES ENDPOINTS
// ============================================

/**
 * GET /api/profile/proactive-messages
 * Get proactive message history
 */
router.get('/proactive-messages', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const acknowledged = req.query.acknowledged === 'true' ? true :
                         req.query.acknowledged === 'false' ? false : null;

    const messages = await getProactiveMessages(req.user.id, days, acknowledged);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error getting proactive messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/profile/proactive-messages/:messageId/acknowledge
 * Acknowledge a proactive message
 */
router.post('/proactive-messages/:messageId/acknowledge', authenticateToken, async (req, res) => {
  try {
    const { action_taken } = req.body;
    await acknowledgeProactiveMessage(req.user.id, req.params.messageId, action_taken);
    res.json({ success: true, message: 'Message acknowledged' });
  } catch (error) {
    console.error('Error acknowledging message:', error);
    res.status(500).json({ error: 'Failed to acknowledge message' });
  }
});

/**
 * POST /api/profile/trigger-briefing
 * Manually trigger a briefing
 */
router.post('/trigger-briefing', authenticateToken, async (req, res) => {
  try {
    const { type } = req.body; // 'morning' or 'evening'

    if (!['morning', 'evening'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "morning" or "evening"' });
    }

    const briefing = await triggerBriefing(req.user.id, type);
    res.json({ success: true, briefing });
  } catch (error) {
    console.error('Error triggering briefing:', error);
    res.status(500).json({ error: 'Failed to trigger briefing' });
  }
});

export default router;
