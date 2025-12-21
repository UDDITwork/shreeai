import cron from 'node-cron';
import { client } from '../models/database.js';
import { sendReminderEmail } from './email.js';

export function setupReminderScheduler(io) {
  // Check for due reminders every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date().toISOString();
      
      // Get pending reminders that are due
      const result = await client.execute({
        sql: `SELECT * FROM reminders 
              WHERE status = 'pending' 
              AND scheduled_time <= ? 
              AND (last_reminder_sent IS NULL OR last_reminder_sent < datetime(?, '-2 minutes'))`,
        args: [now, now]
      });

      for (const reminder of result.rows) {
        // Send popup notification via WebSocket
        if (io) {
          io.to(reminder.user_id).emit('reminder', {
            id: reminder.id,
            type: reminder.reminder_type || 'popup',
            message: `Reminder: ${reminder.task_id || reminder.idea_id || 'Task'}`,
            scheduledTime: reminder.scheduled_time,
          });
        }

        // Update last reminder sent
        await client.execute({
          sql: 'UPDATE reminders SET last_reminder_sent = ? WHERE id = ?',
          args: [now, reminder.id]
        });

        // Schedule email if no response in 2 minutes
        setTimeout(async () => {
          // Check if reminder was acknowledged
          const checkResult = await client.execute({
            sql: 'SELECT status FROM reminders WHERE id = ?',
            args: [reminder.id]
          });

          if (checkResult.rows[0]?.status === 'pending') {
            // Send email reminder
            await sendReminderEmail(reminder.user_id, reminder);
            
            // Increment escalation count
            await client.execute({
              sql: 'UPDATE reminders SET escalation_count = escalation_count + 1 WHERE id = ?',
              args: [reminder.id]
            });
          }
        }, 2 * 60 * 1000); // 2 minutes
      }
    } catch (error) {
      console.error('Reminder scheduler error:', error);
    }
  });
}

