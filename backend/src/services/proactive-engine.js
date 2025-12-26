/**
 * Proactive Engine Service
 * Handles morning briefings, evening summaries, and proactive notifications
 */

import { client } from '../models/database.js';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';
import { getOrCreateProfile, getPersonalizedContext, getDailyMetrics } from './personalization.js';
import { getPrioritizedTasks, getProtectedTimeBlocks, generateOptimizedSchedule, getMoneyTimeAnalysis } from './productivity-optimizer.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Store Socket.io instance
let io = null;

/**
 * Initialize proactive engine with Socket.io
 */
export function initializeProactiveEngine(socketIo) {
  io = socketIo;

  // Check for proactive triggers every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    checkProactiveTriggers();
  });

  // Check for morning briefings every hour (will match user's wake time)
  cron.schedule('0 * * * *', () => {
    checkMorningBriefings();
  });

  // Check for evening summaries every hour (will match user's sleep time - 1hr)
  cron.schedule('0 * * * *', () => {
    checkEveningSummaries();
  });

  console.log('Proactive engine initialized with cron jobs');
}

// ============================================
// MORNING BRIEFING
// ============================================

/**
 * Check and send morning briefings to users
 */
async function checkMorningBriefings() {
  try {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = '00';
    const currentTime = `${currentHour}:${currentMinute}`;

    // Find users whose wake time matches current hour
    const users = await client.execute({
      sql: `SELECT up.user_id, up.wake_time, u.email
            FROM user_profiles up
            JOIN users u ON up.user_id = u.id
            WHERE up.morning_briefing_enabled = 1
            AND substr(up.wake_time, 1, 2) = ?`,
      args: [currentHour]
    });

    for (const user of users.rows) {
      // Check if already sent today
      const alreadySent = await client.execute({
        sql: `SELECT id FROM proactive_messages
              WHERE user_id = ? AND message_type = 'morning_briefing'
              AND date(sent_at) = date('now')`,
        args: [user.user_id]
      });

      if (alreadySent.rows.length === 0) {
        await generateAndSendMorningBriefing(user.user_id);
      }
    }
  } catch (error) {
    console.error('Error checking morning briefings:', error);
  }
}

/**
 * Generate and send morning briefing to a user
 */
export async function generateAndSendMorningBriefing(userId) {
  try {
    const [profile, context, tasks, schedule] = await Promise.all([
      getOrCreateProfile(userId),
      getPersonalizedContext(userId),
      getPrioritizedTasks(userId),
      generateOptimizedSchedule(userId)
    ]);

    // Get today's events
    const today = new Date().toISOString().split('T')[0];
    const events = await client.execute({
      sql: `SELECT * FROM life_events
            WHERE user_id = ? AND date(start_time) = ?
            ORDER BY start_time`,
      args: [userId, today]
    });

    // Get pending reminders for today
    const reminders = await client.execute({
      sql: `SELECT * FROM reminders
            WHERE user_id = ? AND status = 'pending'
            AND date(scheduled_time) = ?
            ORDER BY scheduled_time`,
      args: [userId, today]
    });

    // Get active goals progress
    const goals = await client.execute({
      sql: `SELECT * FROM user_goals
            WHERE user_id = ? AND status = 'active'
            ORDER BY priority DESC LIMIT 5`,
      args: [userId]
    });

    // Build briefing data
    const briefingData = {
      name: profile.preferred_name || profile.name || 'there',
      date: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
      high_priority_tasks: tasks.filter(t => t.priority_score >= 70).slice(0, 3),
      events: events.rows,
      reminders: reminders.rows,
      protected_blocks: schedule?.protected_blocks || [],
      goals: goals.rows.map(g => ({
        title: g.title,
        progress: g.target_value ? `${g.current_value}/${g.target_value}` : 'ongoing',
        streak: g.streak_count
      })),
      weekly_stats: context?.weekly_stats
    };

    // Generate AI-powered briefing
    const briefingContent = await generateBriefingContent(briefingData, 'morning');

    // Store and send
    await storeAndSendProactiveMessage(userId, 'morning_briefing', briefingContent, 'Daily morning briefing', 80);

    return briefingContent;
  } catch (error) {
    console.error('Error generating morning briefing:', error);
    return null;
  }
}

// ============================================
// EVENING SUMMARY
// ============================================

/**
 * Check and send evening summaries to users
 */
async function checkEveningSummaries() {
  try {
    const now = new Date();
    // Send 1 hour before sleep time
    const targetHour = now.getHours().toString().padStart(2, '0');

    // Find users whose sleep time is 1 hour from now
    const users = await client.execute({
      sql: `SELECT up.user_id, up.sleep_time, u.email
            FROM user_profiles up
            JOIN users u ON up.user_id = u.id
            WHERE up.evening_summary_enabled = 1
            AND CAST(substr(up.sleep_time, 1, 2) AS INTEGER) - 1 = CAST(? AS INTEGER)`,
      args: [targetHour]
    });

    for (const user of users.rows) {
      // Check if already sent today
      const alreadySent = await client.execute({
        sql: `SELECT id FROM proactive_messages
              WHERE user_id = ? AND message_type = 'evening_summary'
              AND date(sent_at) = date('now')`,
        args: [user.user_id]
      });

      if (alreadySent.rows.length === 0) {
        await generateAndSendEveningSummary(user.user_id);
      }
    }
  } catch (error) {
    console.error('Error checking evening summaries:', error);
  }
}

/**
 * Generate and send evening summary to a user
 */
export async function generateAndSendEveningSummary(userId) {
  try {
    const [profile, metrics, moneyAnalysis] = await Promise.all([
      getOrCreateProfile(userId),
      getDailyMetrics(userId, 1),
      getMoneyTimeAnalysis(userId, 1)
    ]);

    // Get completed tasks today
    const completedTasks = await client.execute({
      sql: `SELECT * FROM task_priorities
            WHERE user_id = ? AND status = 'completed'
            AND date(completed_at) = date('now')`,
      args: [userId]
    });

    // Get remaining tasks
    const remainingTasks = await client.execute({
      sql: `SELECT * FROM task_priorities
            WHERE user_id = ? AND status = 'pending'
            ORDER BY priority_score DESC`,
      args: [userId]
    });

    // Get goal progress logged today
    const goalProgress = await client.execute({
      sql: `SELECT gp.*, ug.title as goal_title
            FROM goal_progress gp
            JOIN user_goals ug ON gp.goal_id = ug.id
            WHERE gp.user_id = ? AND date(gp.logged_at) = date('now')`,
      args: [userId]
    });

    // Get wellbeing logs for today
    const wellbeingLogs = await client.execute({
      sql: `SELECT * FROM wellbeing_logs
            WHERE user_id = ? AND date(logged_at) = date('now')`,
      args: [userId]
    });

    const todayMetrics = metrics[0] || {};

    // Build summary data
    const summaryData = {
      name: profile.preferred_name || profile.name || 'there',
      completed_count: completedTasks.rows.length,
      completed_tasks: completedTasks.rows.map(t => t.title),
      remaining_count: remainingTasks.rows.length,
      remaining_tasks: remainingTasks.rows.slice(0, 3).map(t => ({ title: t.title, priority: t.priority_score })),
      money_earned: todayMetrics.money_earned || 0,
      productive_hours: todayMetrics.productive_hours || 0,
      study_hours: todayMetrics.study_hours || 0,
      time_saved: todayMetrics.time_saved_minutes || 0,
      goal_progress: goalProgress.rows,
      mood: wellbeingLogs.rows.find(w => w.log_type === 'mood')?.value,
      tomorrow_top_tasks: remainingTasks.rows.slice(0, 3).map(t => t.title)
    };

    // Generate AI-powered summary
    const summaryContent = await generateBriefingContent(summaryData, 'evening');

    // Store and send
    await storeAndSendProactiveMessage(userId, 'evening_summary', summaryContent, 'Daily evening summary', 70);

    return summaryContent;
  } catch (error) {
    console.error('Error generating evening summary:', error);
    return null;
  }
}

// ============================================
// PROACTIVE TRIGGERS
// ============================================

/**
 * Check for various proactive triggers
 */
async function checkProactiveTriggers() {
  try {
    const users = await client.execute({
      sql: `SELECT user_id FROM user_profiles WHERE proactive_enabled = 1`
    });

    for (const user of users.rows) {
      await checkUserProactiveTriggers(user.user_id);
    }
  } catch (error) {
    console.error('Error checking proactive triggers:', error);
  }
}

/**
 * Check proactive triggers for a specific user
 */
async function checkUserProactiveTriggers(userId) {
  try {
    const now = new Date();

    // 1. Check for approaching deadlines
    await checkDeadlineReminders(userId, now);

    // 2. Check for birthdays
    await checkBirthdayReminders(userId, now);

    // 3. Check for goal reminders
    await checkGoalReminders(userId, now);

    // 4. Check for wellbeing reminders
    await checkWellbeingReminders(userId, now);

    // 5. Check for protected time starting
    await checkProtectedTimeStart(userId, now);

  } catch (error) {
    console.error(`Error checking triggers for user ${userId}:`, error);
  }
}

/**
 * Check for approaching deadlines
 */
async function checkDeadlineReminders(userId, now) {
  try {
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

    // Find tasks with deadlines approaching
    const urgentTasks = await client.execute({
      sql: `SELECT * FROM task_priorities
            WHERE user_id = ? AND status = 'pending'
            AND deadline IS NOT NULL
            AND deadline <= ?
            AND deadline > ?`,
      args: [userId, in24Hours.toISOString(), now.toISOString()]
    });

    for (const task of urgentTasks.rows) {
      const deadline = new Date(task.deadline);
      const hoursLeft = Math.round((deadline - now) / (1000 * 60 * 60));

      // Check if reminder already sent in last 4 hours
      const recentReminder = await client.execute({
        sql: `SELECT id FROM proactive_messages
              WHERE user_id = ? AND message_type = 'deadline_reminder'
              AND trigger_reason LIKE ?
              AND sent_at >= datetime('now', '-4 hours')`,
        args: [userId, `%${task.id}%`]
      });

      if (recentReminder.rows.length === 0) {
        const priority = hoursLeft <= 1 ? 95 : hoursLeft <= 6 ? 85 : 75;
        const message = hoursLeft <= 1
          ? `⚠️ URGENT: "${task.title}" is due in ${hoursLeft} hour! This is your final reminder.`
          : `📅 Reminder: "${task.title}" is due in ${hoursLeft} hours. ${task.money_impact > 0 ? `Worth ₹${task.money_impact}!` : ''}`;

        await storeAndSendProactiveMessage(userId, 'deadline_reminder', message, `deadline:${task.id}`, priority);
      }
    }
  } catch (error) {
    console.error('Error checking deadline reminders:', error);
  }
}

/**
 * Check for birthday reminders
 */
async function checkBirthdayReminders(userId, now) {
  try {
    const today = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    // Find contacts with birthdays today
    const birthdays = await client.execute({
      sql: `SELECT * FROM user_contacts
            WHERE user_id = ? AND birthday LIKE ?`,
      args: [userId, `%${today}`]
    });

    for (const contact of birthdays.rows) {
      // Check if reminder already sent today
      const alreadySent = await client.execute({
        sql: `SELECT id FROM proactive_messages
              WHERE user_id = ? AND message_type = 'birthday_reminder'
              AND trigger_reason = ?
              AND date(sent_at) = date('now')`,
        args: [userId, `birthday:${contact.id}`]
      });

      if (alreadySent.rows.length === 0) {
        const message = `🎂 Today is ${contact.name}'s birthday! Don't forget to wish them.${contact.phone ? ` Call: ${contact.phone}` : ''}`;
        await storeAndSendProactiveMessage(userId, 'birthday_reminder', message, `birthday:${contact.id}`, 70);
      }
    }
  } catch (error) {
    console.error('Error checking birthday reminders:', error);
  }
}

/**
 * Check for goal reminders
 */
async function checkGoalReminders(userId, now) {
  try {
    const hour = now.getHours();

    // Check daily habits in the morning and evening
    if (hour === 10 || hour === 20) {
      const dailyGoals = await client.execute({
        sql: `SELECT * FROM user_goals
              WHERE user_id = ? AND status = 'active'
              AND frequency = 'daily'`,
        args: [userId]
      });

      for (const goal of dailyGoals.rows) {
        // Check if progress logged today
        const todayProgress = await client.execute({
          sql: `SELECT id FROM goal_progress
                WHERE goal_id = ? AND date(logged_at) = date('now')`,
          args: [goal.id]
        });

        if (todayProgress.rows.length === 0 && hour === 20) {
          // Evening reminder for unfulfilled daily goal
          const streakMsg = goal.streak_count > 0
            ? `You have a ${goal.streak_count}-day streak! Don't break it!`
            : 'Start building your streak today!';

          const message = `💪 Daily goal reminder: "${goal.title}". ${streakMsg}`;

          // Check if already reminded today
          const alreadyReminded = await client.execute({
            sql: `SELECT id FROM proactive_messages
                  WHERE user_id = ? AND message_type = 'goal_reminder'
                  AND trigger_reason = ?
                  AND date(sent_at) = date('now')`,
            args: [userId, `goal:${goal.id}`]
          });

          if (alreadyReminded.rows.length === 0) {
            await storeAndSendProactiveMessage(userId, 'goal_reminder', message, `goal:${goal.id}`, 65);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking goal reminders:', error);
  }
}

/**
 * Check for wellbeing reminders
 */
async function checkWellbeingReminders(userId, now) {
  try {
    const profile = await getOrCreateProfile(userId);
    if (!profile.wellbeing_enabled) return;

    const hour = now.getHours();

    // Hydration reminder at 10am, 2pm, 5pm
    if ([10, 14, 17].includes(hour)) {
      const reminderType = 'hydration_reminder';
      const alreadySent = await client.execute({
        sql: `SELECT id FROM proactive_messages
              WHERE user_id = ? AND message_type = ?
              AND sent_at >= datetime('now', '-3 hours')`,
        args: [userId, reminderType]
      });

      if (alreadySent.rows.length === 0) {
        await storeAndSendProactiveMessage(
          userId,
          reminderType,
          '💧 Time for a water break! Stay hydrated to maintain focus.',
          'scheduled_wellbeing',
          40
        );
      }
    }

    // Break reminder every 2 hours during work
    const workStart = parseInt(profile.work_start_time?.split(':')[0] || 9);
    const workEnd = parseInt(profile.work_end_time?.split(':')[0] || 18);

    if (hour >= workStart && hour < workEnd && hour % 2 === 0) {
      const alreadySent = await client.execute({
        sql: `SELECT id FROM proactive_messages
              WHERE user_id = ? AND message_type = 'break_reminder'
              AND sent_at >= datetime('now', '-90 minutes')`,
        args: [userId]
      });

      if (alreadySent.rows.length === 0) {
        await storeAndSendProactiveMessage(
          userId,
          'break_reminder',
          '🧘 Take a 5-minute stretch break. Your productivity will thank you!',
          'scheduled_wellbeing',
          35
        );
      }
    }
  } catch (error) {
    console.error('Error checking wellbeing reminders:', error);
  }
}

/**
 * Check if protected time is about to start
 */
async function checkProtectedTimeStart(userId, now) {
  try {
    const blocks = await getProtectedTimeBlocks(userId);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const block of blocks) {
      if (!block.days_of_week.includes(dayOfWeek) && !block.days_of_week.includes('daily')) continue;

      // Check if block starts in 10-15 minutes
      const blockStart = block.start_time;
      const [blockHour, blockMin] = blockStart.split(':').map(Number);
      const blockStartMinutes = blockHour * 60 + blockMin;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const minutesUntilStart = blockStartMinutes - currentMinutes;

      if (minutesUntilStart > 5 && minutesUntilStart <= 15) {
        const alreadySent = await client.execute({
          sql: `SELECT id FROM proactive_messages
                WHERE user_id = ? AND message_type = 'protected_time_start'
                AND trigger_reason = ?
                AND sent_at >= datetime('now', '-1 hour')`,
          args: [userId, `block:${block.id}`]
        });

        if (alreadySent.rows.length === 0) {
          const message = `🛡️ "${block.block_name}" starts in ${minutesUntilStart} minutes. ${block.purpose || 'Time to focus!'} All distractions will be minimized.`;
          await storeAndSendProactiveMessage(userId, 'protected_time_start', message, `block:${block.id}`, 85);
        }
      }
    }
  } catch (error) {
    console.error('Error checking protected time start:', error);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate briefing content using AI
 */
async function generateBriefingContent(data, type) {
  try {
    const prompt = type === 'morning'
      ? `Generate a concise, motivating morning briefing for ${data.name}. Today is ${data.date}.

Data:
- Top 3 priority tasks: ${JSON.stringify(data.high_priority_tasks)}
- Today's events: ${JSON.stringify(data.events)}
- Reminders: ${JSON.stringify(data.reminders)}
- Protected time blocks: ${JSON.stringify(data.protected_blocks)}
- Active goals: ${JSON.stringify(data.goals)}
- Last week stats: ${JSON.stringify(data.weekly_stats)}

Create a brief, actionable morning message (max 300 words) that:
1. Greets them warmly
2. Lists top 3 priorities with money impact if any
3. Mentions protected time blocks
4. Shows goal streaks if any
5. Ends with a motivating one-liner

Keep it scannable with bullet points and emojis. Focus on MONEY-MAKING tasks first.`
      : `Generate a concise evening summary for ${data.name}.

Data:
- Tasks completed: ${data.completed_count} (${JSON.stringify(data.completed_tasks)})
- Tasks remaining: ${data.remaining_count}
- Money earned today: ₹${data.money_earned}
- Productive hours: ${data.productive_hours}
- Study hours: ${data.study_hours}
- Time saved: ${data.time_saved} minutes
- Goal progress: ${JSON.stringify(data.goal_progress)}
- Mood: ${data.mood || 'not logged'}
- Tomorrow's top tasks: ${JSON.stringify(data.tomorrow_top_tasks)}

Create a brief evening summary (max 250 words) that:
1. Acknowledges accomplishments with specific numbers
2. Shows money earned and time saved
3. Highlights goal progress and streaks
4. Lists top 3 tasks for tomorrow
5. Ends with encouragement for rest

Keep it positive and scannable. Celebrate wins, however small.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error generating briefing content:', error);

    // Fallback to simple message
    return type === 'morning'
      ? `Good morning, ${data.name}! You have ${data.high_priority_tasks?.length || 0} high-priority tasks today. Let's make it count!`
      : `Good evening, ${data.name}! You completed ${data.completed_count} tasks today. Rest well and prepare for tomorrow!`;
  }
}

/**
 * Store and send a proactive message
 */
async function storeAndSendProactiveMessage(userId, messageType, content, triggerReason, priority) {
  try {
    const id = uuidv4();

    // Store in database
    await client.execute({
      sql: `INSERT INTO proactive_messages
            (id, user_id, message_type, content, trigger_reason, priority)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, userId, messageType, content, triggerReason, priority]
    });

    // Send via WebSocket
    if (io) {
      io.to(userId).emit('proactive_message', {
        id,
        type: messageType,
        content,
        priority,
        timestamp: new Date().toISOString()
      });
    }

    // For high priority (P1), also send email
    if (priority >= 90) {
      try {
        const { sendEmail } = await import('./email.js');
        const user = await client.execute({
          sql: 'SELECT email FROM users WHERE id = ?',
          args: [userId]
        });

        if (user.rows[0]?.email) {
          await sendEmail(user.rows[0].email, `[Shree AI] ${messageType.replace(/_/g, ' ').toUpperCase()}`, content);
        }
      } catch (emailError) {
        console.error('Error sending proactive email:', emailError);
      }
    }

    return id;
  } catch (error) {
    console.error('Error storing/sending proactive message:', error);
    return null;
  }
}

/**
 * Acknowledge a proactive message
 */
export async function acknowledgeProactiveMessage(userId, messageId, actionTaken = null) {
  try {
    await client.execute({
      sql: `UPDATE proactive_messages
            SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP, action_taken = ?
            WHERE id = ? AND user_id = ?`,
      args: [actionTaken, messageId, userId]
    });
    return true;
  } catch (error) {
    console.error('Error acknowledging message:', error);
    return false;
  }
}

/**
 * Get proactive message history
 */
export async function getProactiveMessages(userId, days = 7, acknowledged = null) {
  try {
    let sql = `SELECT * FROM proactive_messages
               WHERE user_id = ?
               AND sent_at >= datetime('now', '-${days} days')`;
    const args = [userId];

    if (acknowledged !== null) {
      sql += ' AND acknowledged = ?';
      args.push(acknowledged ? 1 : 0);
    }

    sql += ' ORDER BY sent_at DESC';

    const result = await client.execute({ sql, args });
    return result.rows;
  } catch (error) {
    console.error('Error getting proactive messages:', error);
    return [];
  }
}

/**
 * Manually trigger a briefing (for testing or on-demand)
 */
export async function triggerBriefing(userId, type) {
  if (type === 'morning') {
    return await generateAndSendMorningBriefing(userId);
  } else if (type === 'evening') {
    return await generateAndSendEveningSummary(userId);
  }
  return null;
}

export default {
  initializeProactiveEngine,
  generateAndSendMorningBriefing,
  generateAndSendEveningSummary,
  acknowledgeProactiveMessage,
  getProactiveMessages,
  triggerBriefing
};
