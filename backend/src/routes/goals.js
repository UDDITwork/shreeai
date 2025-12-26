/**
 * Goals API Routes
 * Handles goal CRUD, progress tracking, and statistics
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  createGoal,
  getGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  logProgress,
  getProgressHistory,
  breakdownGoal,
  getGoalsSummary,
  getDailyHabitsStatus
} from '../services/goals.js';

const router = express.Router();

// ============================================
// GOAL CRUD ENDPOINTS
// ============================================

/**
 * GET /api/goals
 * Get all goals for user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, type } = req.query;
    const goals = await getGoals(req.user.id, status || 'active', type || null);
    res.json({ success: true, goals });
  } catch (error) {
    console.error('Error getting goals:', error);
    res.status(500).json({ error: 'Failed to get goals' });
  }
});

/**
 * GET /api/goals/summary
 * Get goals summary with statistics
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const summary = await getGoalsSummary(req.user.id);
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error getting goals summary:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

/**
 * GET /api/goals/daily-habits
 * Get daily habits status for today
 */
router.get('/daily-habits', authenticateToken, async (req, res) => {
  try {
    const habits = await getDailyHabitsStatus(req.user.id);
    res.json({ success: true, habits });
  } catch (error) {
    console.error('Error getting daily habits:', error);
    res.status(500).json({ error: 'Failed to get daily habits' });
  }
});

/**
 * GET /api/goals/:goalId
 * Get a single goal
 */
router.get('/:goalId', authenticateToken, async (req, res) => {
  try {
    const goal = await getGoal(req.user.id, req.params.goalId);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error getting goal:', error);
    res.status(500).json({ error: 'Failed to get goal' });
  }
});

/**
 * POST /api/goals
 * Create a new goal
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title, description, goal_type, target_value, unit,
      target_date, frequency, priority, parent_goal_id,
      linked_income_source, expected_roi
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Goal title is required' });
    }

    // Validate goal_type
    const validTypes = ['short_term', 'long_term', 'daily_habit'];
    if (goal_type && !validTypes.includes(goal_type)) {
      return res.status(400).json({ error: 'Invalid goal type. Use: short_term, long_term, or daily_habit' });
    }

    // Validate frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'one_time'];
    if (frequency && !validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency. Use: daily, weekly, monthly, or one_time' });
    }

    const goal = await createGoal(req.user.id, {
      title, description, goal_type, target_value, unit,
      target_date, frequency, priority, parent_goal_id,
      linked_income_source, expected_roi
    });

    res.status(201).json({ success: true, goal });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

/**
 * PUT /api/goals/:goalId
 * Update a goal
 */
router.put('/:goalId', authenticateToken, async (req, res) => {
  try {
    const goal = await updateGoal(req.user.id, req.params.goalId, req.body);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

/**
 * DELETE /api/goals/:goalId
 * Delete (archive) a goal
 */
router.delete('/:goalId', authenticateToken, async (req, res) => {
  try {
    await deleteGoal(req.user.id, req.params.goalId);
    res.json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// ============================================
// PROGRESS ENDPOINTS
// ============================================

/**
 * POST /api/goals/:goalId/progress
 * Log progress for a goal
 */
router.post('/:goalId/progress', authenticateToken, async (req, res) => {
  try {
    const { progress_value, notes } = req.body;

    if (progress_value === undefined) {
      return res.status(400).json({ error: 'Progress value is required' });
    }

    const result = await logProgress(req.user.id, req.params.goalId, progress_value, notes);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error logging progress:', error);

    if (error.message === 'Goal not found') {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.status(500).json({ error: 'Failed to log progress' });
  }
});

/**
 * GET /api/goals/:goalId/progress
 * Get progress history for a goal
 */
router.get('/:goalId/progress', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const history = await getProgressHistory(req.user.id, req.params.goalId, limit);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error getting progress history:', error);
    res.status(500).json({ error: 'Failed to get progress history' });
  }
});

// ============================================
// GOAL BREAKDOWN ENDPOINT
// ============================================

/**
 * POST /api/goals/:goalId/breakdown
 * Break down a goal into sub-goals using AI
 */
router.post('/:goalId/breakdown', authenticateToken, async (req, res) => {
  try {
    const subGoals = await breakdownGoal(req.user.id, req.params.goalId);
    res.json({ success: true, subGoals });
  } catch (error) {
    console.error('Error breaking down goal:', error);

    if (error.message === 'Goal not found') {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.status(500).json({ error: 'Failed to break down goal' });
  }
});

// ============================================
// QUICK ACTIONS
// ============================================

/**
 * POST /api/goals/:goalId/complete
 * Mark a goal as completed
 */
router.post('/:goalId/complete', authenticateToken, async (req, res) => {
  try {
    const goal = await updateGoal(req.user.id, req.params.goalId, { status: 'completed' });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error completing goal:', error);
    res.status(500).json({ error: 'Failed to complete goal' });
  }
});

/**
 * POST /api/goals/:goalId/pause
 * Pause a goal
 */
router.post('/:goalId/pause', authenticateToken, async (req, res) => {
  try {
    const goal = await updateGoal(req.user.id, req.params.goalId, { status: 'paused' });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error pausing goal:', error);
    res.status(500).json({ error: 'Failed to pause goal' });
  }
});

/**
 * POST /api/goals/:goalId/resume
 * Resume a paused goal
 */
router.post('/:goalId/resume', authenticateToken, async (req, res) => {
  try {
    const goal = await updateGoal(req.user.id, req.params.goalId, { status: 'active' });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error resuming goal:', error);
    res.status(500).json({ error: 'Failed to resume goal' });
  }
});

export default router;
