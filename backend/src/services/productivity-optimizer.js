/**
 * Productivity Optimizer Service
 * Handles task prioritization, time-money optimization, and protected time blocks
 */

import { client } from '../models/database.js';
import { v4 as uuidv4 } from 'uuid';
import { getOrCreateProfile, getIncomeSources } from './personalization.js';

// ============================================
// TASK PRIORITY CALCULATION
// ============================================

/**
 * Calculate priority score for a task (0-100)
 * Higher score = higher priority
 */
export function calculatePriorityScore(task, userContext = {}) {
  let score = 0;

  // 1. Money Impact (0-40 points)
  if (task.money_impact > 0) {
    // Direct income tasks get highest priority
    if (task.money_impact >= 10000) score += 40;
    else if (task.money_impact >= 5000) score += 35;
    else if (task.money_impact >= 1000) score += 30;
    else score += 20;
  } else if (task.linked_income_source) {
    // Tasks linked to income sources
    score += 25;
  } else if (task.task_type === 'study' || task.task_type === 'learning') {
    // Study/learning = future income
    score += 20;
  } else if (task.task_type === 'job_related') {
    score += 15;
  } else {
    score += 5;
  }

  // 2. Deadline Urgency (0-30 points)
  if (task.deadline) {
    const now = new Date();
    const deadline = new Date(task.deadline);
    const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

    if (hoursUntilDeadline <= 0) score += 30; // Overdue
    else if (hoursUntilDeadline <= 2) score += 28;
    else if (hoursUntilDeadline <= 6) score += 25;
    else if (hoursUntilDeadline <= 24) score += 20;
    else if (hoursUntilDeadline <= 48) score += 15;
    else if (hoursUntilDeadline <= 168) score += 10; // Within a week
    else score += 5;
  }

  // 3. User-set Priority (0-15 points)
  const userPriority = task.priority || 3;
  score += userPriority * 3; // 1-5 * 3 = 3-15 points

  // 4. Time Efficiency (0-10 points)
  if (task.time_required_minutes && task.money_impact) {
    const efficiency = task.money_impact / (task.time_required_minutes / 60);
    if (efficiency >= 2000) score += 10; // >2000/hr
    else if (efficiency >= 1000) score += 8;
    else if (efficiency >= 500) score += 6;
    else score += 3;
  }

  // 5. Goal Alignment (0-5 points)
  if (task.goal_id) {
    score += 5; // Linked to a goal
  }

  // PENALTY: During protected time (-50 points)
  if (task.is_during_protected_time) {
    score -= 50;
  }

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, score));
}

/**
 * Get prioritized task list for a user
 */
export async function getPrioritizedTasks(userId) {
  try {
    // Get all pending tasks with calculated priorities
    const result = await client.execute({
      sql: `SELECT tp.*, ug.title as goal_title
            FROM task_priorities tp
            LEFT JOIN user_goals ug ON tp.goal_id = ug.id
            WHERE tp.user_id = ? AND tp.status = 'pending'
            ORDER BY tp.priority_score DESC, tp.deadline ASC`,
      args: [userId]
    });

    return result.rows;
  } catch (error) {
    console.error('Error getting prioritized tasks:', error);
    return [];
  }
}

/**
 * Add a task with automatic priority calculation
 */
export async function addPrioritizedTask(userId, taskData) {
  try {
    const id = uuidv4();

    // Check if during protected time
    const isDuringProtected = await isTimeProtected(userId, taskData.deadline);

    // Calculate priority score
    const priorityScore = calculatePriorityScore({
      ...taskData,
      is_during_protected_time: isDuringProtected
    });

    await client.execute({
      sql: `INSERT INTO task_priorities
            (id, user_id, task_id, goal_id, reminder_id, title, task_type,
             priority_score, money_impact, time_required_minutes, deadline,
             is_during_protected_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, userId, taskData.task_id || null, taskData.goal_id || null,
        taskData.reminder_id || null, taskData.title, taskData.task_type || 'general',
        priorityScore, taskData.money_impact || 0, taskData.time_required_minutes || null,
        taskData.deadline || null, isDuringProtected ? 1 : 0
      ]
    });

    return { id, priority_score: priorityScore };
  } catch (error) {
    console.error('Error adding prioritized task:', error);
    throw error;
  }
}

/**
 * Recalculate all task priorities for a user
 */
export async function recalculatePriorities(userId) {
  try {
    const tasks = await client.execute({
      sql: `SELECT * FROM task_priorities WHERE user_id = ? AND status = 'pending'`,
      args: [userId]
    });

    for (const task of tasks.rows) {
      const isDuringProtected = await isTimeProtected(userId, task.deadline);
      const newScore = calculatePriorityScore({
        ...task,
        is_during_protected_time: isDuringProtected
      });

      await client.execute({
        sql: `UPDATE task_priorities SET priority_score = ?, is_during_protected_time = ?,
              updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [newScore, isDuringProtected ? 1 : 0, task.id]
      });
    }

    return true;
  } catch (error) {
    console.error('Error recalculating priorities:', error);
    return false;
  }
}

// ============================================
// PROTECTED TIME BLOCKS
// ============================================

/**
 * Create a protected time block
 */
export async function createProtectedTimeBlock(userId, blockData) {
  try {
    const id = uuidv4();

    await client.execute({
      sql: `INSERT INTO protected_time_blocks
            (id, user_id, block_name, purpose, start_time, end_time,
             days_of_week, priority, expected_roi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, userId, blockData.block_name, blockData.purpose || null,
        blockData.start_time, blockData.end_time,
        JSON.stringify(blockData.days_of_week || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
        blockData.priority || 100, blockData.expected_roi || null
      ]
    });

    // Recalculate task priorities with new block
    await recalculatePriorities(userId);

    return id;
  } catch (error) {
    console.error('Error creating protected time block:', error);
    throw error;
  }
}

/**
 * Get active protected time blocks
 */
export async function getProtectedTimeBlocks(userId) {
  try {
    const result = await client.execute({
      sql: `SELECT * FROM protected_time_blocks WHERE user_id = ? AND is_active = 1
            ORDER BY start_time`,
      args: [userId]
    });

    return result.rows.map(row => ({
      ...row,
      days_of_week: JSON.parse(row.days_of_week || '[]')
    }));
  } catch (error) {
    console.error('Error getting protected time blocks:', error);
    return [];
  }
}

/**
 * Check if a specific time falls within a protected block
 */
export async function isTimeProtected(userId, datetime) {
  if (!datetime) return false;

  try {
    const date = new Date(datetime);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
    const timeStr = date.toTimeString().slice(0, 5); // HH:MM

    const blocks = await getProtectedTimeBlocks(userId);

    for (const block of blocks) {
      // Check if day matches
      if (block.days_of_week.includes(dayOfWeek) || block.days_of_week.includes('daily')) {
        // Check if time falls within block
        if (timeStr >= block.start_time && timeStr <= block.end_time) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking protected time:', error);
    return false;
  }
}

/**
 * Check if current time is during a protected block
 */
export async function isCurrentlyProtected(userId) {
  const now = new Date();
  return isTimeProtected(userId, now.toISOString());
}

/**
 * Delete a protected time block
 */
export async function deleteProtectedTimeBlock(userId, blockId) {
  try {
    await client.execute({
      sql: 'UPDATE protected_time_blocks SET is_active = 0 WHERE id = ? AND user_id = ?',
      args: [blockId, userId]
    });
    return true;
  } catch (error) {
    console.error('Error deleting protected time block:', error);
    return false;
  }
}

// ============================================
// TIME SAVINGS TRACKING
// ============================================

/**
 * Log a time saving action
 */
export async function logTimeSaving(userId, actionType, description, minutesSaved, source = 'ai_suggestion') {
  try {
    const id = uuidv4();

    await client.execute({
      sql: `INSERT INTO time_savings_log
            (id, user_id, action_type, description, time_saved_minutes, suggestion_source)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, userId, actionType, description, minutesSaved, source]
    });

    // Update daily metrics
    const { updateDailyMetrics } = await import('./personalization.js');
    await updateDailyMetrics(userId, { time_saved_minutes: minutesSaved });

    return id;
  } catch (error) {
    console.error('Error logging time saving:', error);
    return null;
  }
}

/**
 * Get time savings summary
 */
export async function getTimeSavingsSummary(userId, days = 7) {
  try {
    const result = await client.execute({
      sql: `SELECT
              SUM(time_saved_minutes) as total_minutes,
              COUNT(*) as action_count,
              action_type,
              suggestion_source
            FROM time_savings_log
            WHERE user_id = ? AND logged_at >= datetime('now', '-${days} days')
            GROUP BY action_type, suggestion_source`,
      args: [userId]
    });

    const totalMinutes = result.rows.reduce((sum, row) => sum + (row.total_minutes || 0), 0);

    return {
      total_minutes_saved: totalMinutes,
      total_hours_saved: Math.round(totalMinutes / 60 * 10) / 10,
      breakdown: result.rows
    };
  } catch (error) {
    console.error('Error getting time savings summary:', error);
    return { total_minutes_saved: 0, total_hours_saved: 0, breakdown: [] };
  }
}

// ============================================
// SCHEDULE OPTIMIZATION
// ============================================

/**
 * Generate optimized daily schedule
 */
export async function generateOptimizedSchedule(userId) {
  try {
    const profile = await getOrCreateProfile(userId);
    const tasks = await getPrioritizedTasks(userId);
    const timeBlocks = await getProtectedTimeBlocks(userId);
    const incomeSources = await getIncomeSources(userId);

    // Get today's date and day of week
    const now = new Date();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];

    // Filter protected blocks for today
    const todayBlocks = timeBlocks.filter(b =>
      b.days_of_week.includes(dayOfWeek) || b.days_of_week.includes('daily')
    );

    // Build schedule
    const schedule = {
      date: now.toISOString().split('T')[0],
      wake_time: profile.wake_time,
      sleep_time: profile.sleep_time,
      work_start: profile.work_start_time,
      work_end: profile.work_end_time,
      protected_blocks: todayBlocks.map(b => ({
        name: b.block_name,
        start: b.start_time,
        end: b.end_time,
        purpose: b.purpose
      })),
      high_priority_tasks: [],
      medium_priority_tasks: [],
      low_priority_tasks: [],
      suggestions: []
    };

    // Categorize tasks by priority
    for (const task of tasks) {
      if (task.priority_score >= 70) {
        schedule.high_priority_tasks.push({
          title: task.title,
          priority: task.priority_score,
          money_impact: task.money_impact,
          deadline: task.deadline,
          time_required: task.time_required_minutes
        });
      } else if (task.priority_score >= 40) {
        schedule.medium_priority_tasks.push({
          title: task.title,
          priority: task.priority_score,
          deadline: task.deadline
        });
      } else {
        schedule.low_priority_tasks.push({
          title: task.title,
          priority: task.priority_score
        });
      }
    }

    // Generate suggestions
    if (schedule.high_priority_tasks.length > 3) {
      schedule.suggestions.push({
        type: 'focus',
        message: `You have ${schedule.high_priority_tasks.length} high-priority tasks. Focus on the top 3 first.`
      });
    }

    if (incomeSources.length > 0) {
      const topSource = incomeSources[0];
      schedule.suggestions.push({
        type: 'income',
        message: `Your highest-paying work is "${topSource.source_name}" (₹${topSource.hourly_rate}/hr). Prioritize similar tasks.`
      });
    }

    if (todayBlocks.length > 0) {
      const totalProtectedHours = todayBlocks.reduce((sum, b) => {
        const start = parseInt(b.start_time.split(':')[0]);
        const end = parseInt(b.end_time.split(':')[0]);
        return sum + (end - start);
      }, 0);
      schedule.suggestions.push({
        type: 'protected',
        message: `${totalProtectedHours} hours protected today for focused work. No interruptions allowed.`
      });
    }

    return schedule;
  } catch (error) {
    console.error('Error generating optimized schedule:', error);
    return null;
  }
}

/**
 * Get task batching suggestions
 */
export async function getTaskBatchingSuggestions(userId) {
  try {
    // Analyze behavior patterns for batching opportunities
    const result = await client.execute({
      sql: `SELECT pattern_type, pattern_data, occurrences
            FROM behavior_patterns
            WHERE user_id = ? AND pattern_type IN ('email_check', 'meeting_time', 'task_switch')
            ORDER BY occurrences DESC`,
      args: [userId]
    });

    const suggestions = [];

    for (const pattern of result.rows) {
      const data = JSON.parse(pattern.pattern_data || '{}');

      if (pattern.pattern_type === 'email_check' && pattern.occurrences > 5) {
        suggestions.push({
          type: 'batch_emails',
          current: `Checking emails ${pattern.occurrences}+ times/day`,
          suggestion: 'Batch to 3 times: 9am, 1pm, 6pm',
          time_saved: Math.round(pattern.occurrences * 5 * 0.6) // 60% time saved
        });
      }

      if (pattern.pattern_type === 'meeting_time' && data.avg_duration > 45) {
        suggestions.push({
          type: 'shorten_meetings',
          current: `Average meeting: ${data.avg_duration} minutes`,
          suggestion: 'Set 25-min default, decline optional meetings',
          time_saved: Math.round((data.avg_duration - 25) * data.weekly_count)
        });
      }
    }

    return suggestions;
  } catch (error) {
    console.error('Error getting batching suggestions:', error);
    return [];
  }
}

// ============================================
// MONEY-TIME ANALYSIS
// ============================================

/**
 * Get money-time analysis
 */
export async function getMoneyTimeAnalysis(userId, days = 30) {
  try {
    const [incomeSources, metrics, timeSavings] = await Promise.all([
      getIncomeSources(userId),
      client.execute({
        sql: `SELECT * FROM daily_metrics WHERE user_id = ?
              AND date >= date('now', '-${days} days')`,
        args: [userId]
      }),
      getTimeSavingsSummary(userId, days)
    ]);

    // Calculate totals
    const totalEarned = metrics.rows.reduce((sum, m) => sum + (m.money_earned || 0), 0);
    const totalProductiveHours = metrics.rows.reduce((sum, m) => sum + (m.productive_hours || 0), 0);
    const totalStudyHours = metrics.rows.reduce((sum, m) => sum + (m.study_hours || 0), 0);
    const effectiveHourlyRate = totalProductiveHours > 0 ? Math.round(totalEarned / totalProductiveHours) : 0;

    // Rank income sources
    const rankedSources = incomeSources.map(s => ({
      name: s.source_name,
      hourly_rate: s.hourly_rate || 0,
      total_earned: s.total_earned || 0,
      time_invested: s.time_investment_hours || 0,
      priority: s.priority_score
    })).sort((a, b) => (b.hourly_rate || 0) - (a.hourly_rate || 0));

    return {
      period_days: days,
      total_earned: totalEarned,
      productive_hours: totalProductiveHours,
      study_hours: totalStudyHours,
      effective_hourly_rate: effectiveHourlyRate,
      time_saved_hours: timeSavings.total_hours_saved,
      income_sources_ranked: rankedSources,
      recommendations: generateMoneyRecommendations(rankedSources, effectiveHourlyRate)
    };
  } catch (error) {
    console.error('Error getting money-time analysis:', error);
    return null;
  }
}

/**
 * Generate money-focused recommendations
 */
function generateMoneyRecommendations(sources, hourlyRate) {
  const recommendations = [];

  if (sources.length >= 2) {
    const topSource = sources[0];
    const bottomSource = sources[sources.length - 1];

    if (topSource.hourly_rate > bottomSource.hourly_rate * 2) {
      recommendations.push({
        type: 'focus_high_value',
        message: `"${topSource.name}" pays ${Math.round(topSource.hourly_rate / bottomSource.hourly_rate)}x more per hour than "${bottomSource.name}". Prioritize high-value work.`
      });
    }
  }

  if (hourlyRate > 0 && hourlyRate < 500) {
    recommendations.push({
      type: 'increase_rates',
      message: `Your effective rate is ₹${hourlyRate}/hr. Consider raising prices or focusing on higher-paying clients.`
    });
  }

  if (sources.length > 0 && sources.some(s => !s.hourly_rate)) {
    recommendations.push({
      type: 'track_time',
      message: 'Some income sources have no hourly rate. Track time spent to identify your most profitable work.'
    });
  }

  return recommendations;
}

export default {
  calculatePriorityScore,
  getPrioritizedTasks,
  addPrioritizedTask,
  recalculatePriorities,
  createProtectedTimeBlock,
  getProtectedTimeBlocks,
  isTimeProtected,
  isCurrentlyProtected,
  deleteProtectedTimeBlock,
  logTimeSaving,
  getTimeSavingsSummary,
  generateOptimizedSchedule,
  getTaskBatchingSuggestions,
  getMoneyTimeAnalysis
};
