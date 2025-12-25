import cron from 'node-cron';
import { client } from '../models/database.js';
import { processWithClaude } from './anthropic.js';
import { sendEmail } from './gmail.js';
import { randomUUID as uuidv4 } from 'crypto';

// Generate summary for a user
export async function generateUserSummary(userId, periodHours = 12) {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

  // Fetch tasks completed in the period
  const completedTasks = await client.execute({
    sql: `SELECT id, title, description, completed_at FROM tasks
          WHERE user_id = ? AND status = 'completed'
          AND completed_at >= ?
          ORDER BY completed_at DESC`,
    args: [userId, periodStart.toISOString()]
  });

  // Fetch pending tasks
  const pendingTasks = await client.execute({
    sql: `SELECT id, title, description, created_at FROM tasks
          WHERE user_id = ? AND status = 'pending'
          ORDER BY created_at DESC LIMIT 10`,
    args: [userId]
  });

  // Fetch reminders triggered in the period
  const triggeredReminders = await client.execute({
    sql: `SELECT r.id, t.title, r.scheduled_time, r.status FROM reminders r
          LEFT JOIN tasks t ON r.task_id = t.id
          WHERE r.user_id = ? AND r.scheduled_time >= ? AND r.scheduled_time <= ?
          ORDER BY r.scheduled_time DESC`,
    args: [userId, periodStart.toISOString(), now.toISOString()]
  });

  // Fetch searches performed
  const searches = await client.execute({
    sql: `SELECT id, query, created_at FROM searches
          WHERE user_id = ? AND created_at >= ?
          ORDER BY created_at DESC`,
    args: [userId, periodStart.toISOString()]
  });

  // Fetch ideas saved
  const ideas = await client.execute({
    sql: `SELECT id, title, type, created_at FROM ideas
          WHERE user_id = ? AND created_at >= ?
          ORDER BY created_at DESC`,
    args: [userId, periodStart.toISOString()]
  });

  // Build summary data
  const summaryData = {
    period: `Last ${periodHours} hours`,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    tasksCompleted: completedTasks.rows.map(t => ({ title: t.title, completedAt: t.completed_at })),
    tasksPending: pendingTasks.rows.map(t => ({ title: t.title, createdAt: t.created_at })),
    remindersTriggered: triggeredReminders.rows.map(r => ({ title: r.title, time: r.scheduled_time, status: r.status })),
    searchesPerformed: searches.rows.map(s => ({ query: s.query, time: s.created_at })),
    ideasSaved: ideas.rows.map(i => ({ title: i.title, type: i.type }))
  };

  // Generate AI summary
  const prompt = `Generate a concise executive summary for this user's activity in the last ${periodHours} hours.

Data:
- Tasks Completed: ${summaryData.tasksCompleted.length}
${summaryData.tasksCompleted.map(t => `  - ${t.title}`).join('\n') || '  (none)'}

- Tasks Pending: ${summaryData.tasksPending.length}
${summaryData.tasksPending.map(t => `  - ${t.title}`).join('\n') || '  (none)'}

- Reminders: ${summaryData.remindersTriggered.length}
${summaryData.remindersTriggered.map(r => `  - ${r.title} (${r.status})`).join('\n') || '  (none)'}

- Web Searches: ${summaryData.searchesPerformed.length}
${summaryData.searchesPerformed.map(s => `  - "${s.query}"`).join('\n') || '  (none)'}

- Ideas Saved: ${summaryData.ideasSaved.length}
${summaryData.ideasSaved.map(i => `  - ${i.title} (${i.type})`).join('\n') || '  (none)'}

Write a brief 2-3 sentence summary highlighting key accomplishments and what's coming up. Be direct and actionable.`;

  const aiSummary = await processWithClaude(prompt, 'You are an executive assistant providing daily briefings.');

  // Store the summary
  const summaryId = uuidv4();
  await client.execute({
    sql: `INSERT INTO summaries (id, user_id, period_start, period_end, summary_text, data, sent_via)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [summaryId, userId, periodStart.toISOString(), now.toISOString(), aiSummary, JSON.stringify(summaryData), 'pending']
  });

  return {
    summaryId,
    summaryText: aiSummary,
    data: summaryData
  };
}

// Send summary via email
export async function sendSummaryEmail(userId, summary) {
  // Get user email
  const userResult = await client.execute({
    sql: 'SELECT email FROM users WHERE id = ?',
    args: [userId]
  });

  if (userResult.rows.length === 0) {
    console.error('User not found for summary email:', userId);
    return { success: false, error: 'User not found' };
  }

  const userEmail = userResult.rows[0].email;
  const period = summary.data.period;

  const emailBody = `
📊 Your ${period} Summary

${summary.summaryText}

---

📋 Details:

✅ Tasks Completed: ${summary.data.tasksCompleted.length}
${summary.data.tasksCompleted.map(t => `   • ${t.title}`).join('\n') || '   (none)'}

⏳ Tasks Pending: ${summary.data.tasksPending.length}
${summary.data.tasksPending.slice(0, 5).map(t => `   • ${t.title}`).join('\n') || '   (none)'}

🔔 Reminders: ${summary.data.remindersTriggered.length}
${summary.data.remindersTriggered.map(r => `   • ${r.title}`).join('\n') || '   (none)'}

🔍 Searches: ${summary.data.searchesPerformed.length}
${summary.data.searchesPerformed.map(s => `   • ${s.query}`).join('\n') || '   (none)'}

💡 Ideas Saved: ${summary.data.ideasSaved.length}
${summary.data.ideasSaved.map(i => `   • ${i.title}`).join('\n') || '   (none)'}

---
Smart Idea Manager - Your AI Assistant
`;

  try {
    const result = await sendEmail(
      userEmail,
      `📊 Your ${period} Summary - Smart Idea Manager`,
      emailBody
    );

    if (result.success) {
      // Update summary as sent
      await client.execute({
        sql: 'UPDATE summaries SET sent_via = ? WHERE id = ?',
        args: ['email', summary.summaryId]
      });
    }

    return result;
  } catch (error) {
    console.error('Failed to send summary email:', error);
    return { success: false, error: error.message };
  }
}

// Initialize 12-hour summary scheduler
export function initializeSummaryScheduler(io) {
  // Run at 6 AM and 6 PM every day
  cron.schedule('0 6,18 * * *', async () => {
    console.log('Running 12-hour summary generation...');

    try {
      // Get all users
      const users = await client.execute({
        sql: 'SELECT DISTINCT id FROM users'
      });

      for (const user of users.rows) {
        try {
          const summary = await generateUserSummary(user.id, 12);

          // Send email
          await sendSummaryEmail(user.id, summary);

          // Also emit via WebSocket if user is connected
          if (io) {
            io.to(user.id).emit('summary', {
              type: '12_hour_summary',
              summary: summary.summaryText,
              data: summary.data,
              timestamp: new Date().toISOString()
            });
          }

          console.log(`Summary generated and sent for user: ${user.id}`);
        } catch (error) {
          console.error(`Failed to generate summary for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Summary scheduler error:', error);
    }
  });

  console.log('Summary scheduler initialized (runs at 6 AM and 6 PM)');
}

// Manual trigger for testing
export async function triggerSummaryForUser(userId, io) {
  const summary = await generateUserSummary(userId, 12);

  // Send email
  await sendSummaryEmail(userId, summary);

  // Emit via WebSocket
  if (io) {
    io.to(userId).emit('summary', {
      type: '12_hour_summary',
      summary: summary.summaryText,
      data: summary.data,
      timestamp: new Date().toISOString()
    });
  }

  return summary;
}
