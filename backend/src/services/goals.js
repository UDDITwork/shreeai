/**
 * Goals Service
 * Handles goal creation, tracking, progress, and streak management
 */

import { client } from '../models/database.js';
import { v4 as uuidv4 } from 'uuid';
import { updateDailyMetrics } from './personalization.js';

// ============================================
// GOAL MANAGEMENT
// ============================================

/**
 * Create a new goal
 */
export async function createGoal(userId, goalData) {
  try {
    const id = uuidv4();

    await client.execute({
      sql: `INSERT INTO user_goals
            (id, user_id, title, description, goal_type, target_value, unit,
             target_date, frequency, priority, parent_goal_id, linked_income_source, expected_roi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, userId, goalData.title, goalData.description || null,
        goalData.goal_type || 'short_term', goalData.target_value || null,
        goalData.unit || null, goalData.target_date || null,
        goalData.frequency || 'one_time', goalData.priority || 3,
        goalData.parent_goal_id || null, goalData.linked_income_source || null,
        goalData.expected_roi || null
      ]
    });

    return { id, ...goalData };
  } catch (error) {
    console.error('Error creating goal:', error);
    throw error;
  }
}

/**
 * Get all goals for a user
 */
export async function getGoals(userId, status = 'active', goalType = null) {
  try {
    let sql = 'SELECT * FROM user_goals WHERE user_id = ?';
    const args = [userId];

    if (status) {
      sql += ' AND status = ?';
      args.push(status);
    }

    if (goalType) {
      sql += ' AND goal_type = ?';
      args.push(goalType);
    }

    sql += ' ORDER BY priority DESC, created_at DESC';

    const result = await client.execute({ sql, args });
    return result.rows;
  } catch (error) {
    console.error('Error getting goals:', error);
    return [];
  }
}

/**
 * Get a single goal by ID
 */
export async function getGoal(userId, goalId) {
  try {
    const result = await client.execute({
      sql: 'SELECT * FROM user_goals WHERE id = ? AND user_id = ?',
      args: [goalId, userId]
    });
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting goal:', error);
    return null;
  }
}

/**
 * Update a goal
 */
export async function updateGoal(userId, goalId, updates) {
  try {
    const allowedFields = [
      'title', 'description', 'goal_type', 'target_value', 'current_value',
      'unit', 'target_date', 'frequency', 'priority', 'parent_goal_id',
      'linked_income_source', 'expected_roi', 'status'
    ];

    const fieldsToUpdate = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fieldsToUpdate.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fieldsToUpdate.length === 0) {
      return await getGoal(userId, goalId);
    }

    fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
    values.push(goalId, userId);

    await client.execute({
      sql: `UPDATE user_goals SET ${fieldsToUpdate.join(', ')} WHERE id = ? AND user_id = ?`,
      args: values
    });

    return await getGoal(userId, goalId);
  } catch (error) {
    console.error('Error updating goal:', error);
    throw error;
  }
}

/**
 * Delete (archive) a goal
 */
export async function deleteGoal(userId, goalId) {
  try {
    await client.execute({
      sql: `UPDATE user_goals SET status = 'archived', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?`,
      args: [goalId, userId]
    });
    return true;
  } catch (error) {
    console.error('Error deleting goal:', error);
    return false;
  }
}

// ============================================
// PROGRESS TRACKING
// ============================================

/**
 * Log progress for a goal
 */
export async function logProgress(userId, goalId, progressValue, notes = null) {
  try {
    const goal = await getGoal(userId, goalId);
    if (!goal) throw new Error('Goal not found');

    const id = uuidv4();

    // Insert progress log
    await client.execute({
      sql: `INSERT INTO goal_progress (id, goal_id, user_id, progress_value, notes)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, goalId, userId, progressValue, notes]
    });

    // Update current value on goal
    const newValue = (goal.current_value || 0) + progressValue;
    await client.execute({
      sql: `UPDATE user_goals SET current_value = ?, last_progress_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [newValue, goalId]
    });

    // Update streak for daily/weekly goals
    if (goal.frequency === 'daily' || goal.frequency === 'weekly') {
      await updateStreak(userId, goalId, goal);
    }

    // Check if goal completed
    if (goal.target_value && newValue >= goal.target_value) {
      await client.execute({
        sql: `UPDATE user_goals SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [goalId]
      });
    }

    // Update daily metrics
    await updateDailyMetrics(userId, { goals_progressed: 1 });

    return {
      id,
      goal_id: goalId,
      progress_value: progressValue,
      new_total: newValue,
      target: goal.target_value,
      completed: goal.target_value ? newValue >= goal.target_value : false
    };
  } catch (error) {
    console.error('Error logging progress:', error);
    throw error;
  }
}

/**
 * Get progress history for a goal
 */
export async function getProgressHistory(userId, goalId, limit = 30) {
  try {
    const result = await client.execute({
      sql: `SELECT * FROM goal_progress
            WHERE goal_id = ? AND user_id = ?
            ORDER BY logged_at DESC LIMIT ?`,
      args: [goalId, userId, limit]
    });
    return result.rows;
  } catch (error) {
    console.error('Error getting progress history:', error);
    return [];
  }
}

// ============================================
// STREAK MANAGEMENT
// ============================================

/**
 * Update streak for a goal
 */
async function updateStreak(userId, goalId, goal) {
  try {
    const lastProgress = goal.last_progress_at ? new Date(goal.last_progress_at) : null;
    const now = new Date();

    let newStreak = goal.streak_count || 0;
    let streakBroken = false;

    if (goal.frequency === 'daily') {
      if (lastProgress) {
        const daysDiff = Math.floor((now - lastProgress) / (1000 * 60 * 60 * 24));

        if (daysDiff === 0) {
          // Same day, no streak change
        } else if (daysDiff === 1) {
          // Consecutive day, increment streak
          newStreak += 1;
        } else {
          // Streak broken
          newStreak = 1;
          streakBroken = true;
        }
      } else {
        // First progress
        newStreak = 1;
      }
    } else if (goal.frequency === 'weekly') {
      if (lastProgress) {
        const weeksDiff = Math.floor((now - lastProgress) / (1000 * 60 * 60 * 24 * 7));

        if (weeksDiff === 0) {
          // Same week
        } else if (weeksDiff === 1) {
          // Consecutive week
          newStreak += 1;
        } else {
          // Streak broken
          newStreak = 1;
          streakBroken = true;
        }
      } else {
        newStreak = 1;
      }
    }

    // Update streak and best streak
    const bestStreak = Math.max(goal.best_streak || 0, newStreak);

    await client.execute({
      sql: `UPDATE user_goals SET streak_count = ?, best_streak = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [newStreak, bestStreak, goalId]
    });

    return { streak: newStreak, best_streak: bestStreak, broken: streakBroken };
  } catch (error) {
    console.error('Error updating streak:', error);
    return null;
  }
}

/**
 * Check and reset broken streaks (run daily)
 */
export async function checkBrokenStreaks() {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find daily goals with last progress before yesterday
    const brokenDaily = await client.execute({
      sql: `SELECT * FROM user_goals
            WHERE status = 'active' AND frequency = 'daily'
            AND streak_count > 0
            AND (last_progress_at < ? OR last_progress_at IS NULL)`,
      args: [yesterday.toISOString()]
    });

    for (const goal of brokenDaily.rows) {
      await client.execute({
        sql: `UPDATE user_goals SET streak_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [goal.id]
      });
    }

    // Similarly for weekly goals (check if more than 7 days)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const brokenWeekly = await client.execute({
      sql: `SELECT * FROM user_goals
            WHERE status = 'active' AND frequency = 'weekly'
            AND streak_count > 0
            AND (last_progress_at < ? OR last_progress_at IS NULL)`,
      args: [weekAgo.toISOString()]
    });

    for (const goal of brokenWeekly.rows) {
      await client.execute({
        sql: `UPDATE user_goals SET streak_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [goal.id]
      });
    }

    return {
      daily_reset: brokenDaily.rows.length,
      weekly_reset: brokenWeekly.rows.length
    };
  } catch (error) {
    console.error('Error checking broken streaks:', error);
    return null;
  }
}

// ============================================
// GOAL SUGGESTIONS & BREAKDOWN
// ============================================

/**
 * Break down a long-term goal into sub-goals
 */
export async function breakdownGoal(userId, goalId) {
  try {
    const goal = await getGoal(userId, goalId);
    if (!goal) throw new Error('Goal not found');

    // Use AI to suggest breakdown
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Break down this goal into actionable sub-goals:

Goal: "${goal.title}"
Description: ${goal.description || 'None'}
Target date: ${goal.target_date || 'Not set'}
Expected ROI: ${goal.expected_roi || 'Not specified'}

Return a JSON array of sub-goals with this structure:
[
  {
    "title": "Sub-goal title",
    "description": "Brief description",
    "goal_type": "short_term",
    "frequency": "daily|weekly|one_time",
    "target_value": number or null,
    "unit": "string or null",
    "priority": 1-5,
    "estimated_time": "e.g., 2 hours, 1 week"
  }
]

Create 3-5 actionable sub-goals that lead to achieving the main goal.
Return ONLY valid JSON, no explanation.`
      }]
    });

    const content = response.content[0].text.trim();
    let subGoals;

    try {
      subGoals = JSON.parse(content);
    } catch {
      console.error('Failed to parse sub-goals:', content);
      return [];
    }

    // Create sub-goals linked to parent
    const createdGoals = [];
    for (const sg of subGoals) {
      const created = await createGoal(userId, {
        ...sg,
        parent_goal_id: goalId
      });
      createdGoals.push(created);
    }

    return createdGoals;
  } catch (error) {
    console.error('Error breaking down goal:', error);
    throw error;
  }
}

/**
 * Get goal summary with statistics
 */
export async function getGoalsSummary(userId) {
  try {
    const [activeGoals, completedGoals, dailyHabits] = await Promise.all([
      getGoals(userId, 'active'),
      getGoals(userId, 'completed'),
      getGoals(userId, 'active', 'daily_habit')
    ]);

    // Calculate streaks
    const streaks = dailyHabits.map(g => ({
      title: g.title,
      current_streak: g.streak_count,
      best_streak: g.best_streak
    })).sort((a, b) => b.current_streak - a.current_streak);

    // Get progress stats for active goals with targets
    const progressStats = activeGoals
      .filter(g => g.target_value)
      .map(g => ({
        title: g.title,
        progress: Math.round((g.current_value / g.target_value) * 100),
        current: g.current_value,
        target: g.target_value,
        unit: g.unit
      }));

    // Count by type
    const byType = {
      short_term: activeGoals.filter(g => g.goal_type === 'short_term').length,
      long_term: activeGoals.filter(g => g.goal_type === 'long_term').length,
      daily_habit: dailyHabits.length
    };

    return {
      total_active: activeGoals.length,
      total_completed: completedGoals.length,
      by_type: byType,
      top_streaks: streaks.slice(0, 5),
      progress_tracking: progressStats,
      goals_needing_attention: activeGoals.filter(g =>
        g.target_date && new Date(g.target_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      ).length
    };
  } catch (error) {
    console.error('Error getting goals summary:', error);
    return null;
  }
}

/**
 * Get daily habits status for today
 */
export async function getDailyHabitsStatus(userId) {
  try {
    const dailyHabits = await getGoals(userId, 'active', 'daily_habit');
    const today = new Date().toISOString().split('T')[0];

    const status = [];

    for (const habit of dailyHabits) {
      // Check if progress logged today
      const todayProgress = await client.execute({
        sql: `SELECT * FROM goal_progress
              WHERE goal_id = ? AND date(logged_at) = ?`,
        args: [habit.id, today]
      });

      status.push({
        id: habit.id,
        title: habit.title,
        completed_today: todayProgress.rows.length > 0,
        streak: habit.streak_count,
        best_streak: habit.best_streak,
        target: habit.target_value,
        unit: habit.unit
      });
    }

    return status;
  } catch (error) {
    console.error('Error getting daily habits status:', error);
    return [];
  }
}

export default {
  createGoal,
  getGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  logProgress,
  getProgressHistory,
  checkBrokenStreaks,
  breakdownGoal,
  getGoalsSummary,
  getDailyHabitsStatus
};
