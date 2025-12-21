import { client } from '../models/database.js';
import { searchSimilarConversations } from './vector-store.js';
import { processWithClaude } from './anthropic.js';

export async function getContext(userId, query, limit = 5) {
  try {
    // Search vector database for similar conversations
    const similarConversations = await searchSimilarConversations(userId, query, limit);
    
    // Get recent conversations from database
    const dbResult = await client.execute({
      sql: 'SELECT message, response FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      args: [userId, limit]
    });

    return {
      vectorResults: similarConversations,
      recentConversations: dbResult.rows,
    };
  } catch (error) {
    console.error('Get context error:', error);
    return { vectorResults: [], recentConversations: [] };
  }
}

export async function generateSummary(userId) {
  try {
    // Get tasks and ideas from last 7 hours
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    
    const tasksResult = await client.execute({
      sql: `SELECT * FROM tasks WHERE user_id = ? AND updated_at >= ?`,
      args: [userId, sevenHoursAgo]
    });

    const ideasResult = await client.execute({
      sql: `SELECT * FROM ideas WHERE user_id = ? AND updated_at >= ?`,
      args: [userId, sevenHoursAgo]
    });

    const remindersResult = await client.execute({
      sql: `SELECT * FROM reminders WHERE user_id = ? AND created_at >= ?`,
      args: [userId, sevenHoursAgo]
    });

    const summaryPrompt = `Generate a tabular summary of the following activities:

Tasks:
${JSON.stringify(tasksResult.rows, null, 2)}

Ideas:
${JSON.stringify(ideasResult.rows, null, 2)}

Reminders:
${JSON.stringify(remindersResult.rows, null, 2)}

Format as a clean table showing:
- Type (Task/Idea/Reminder)
- Title/Description
- Status
- Time (created/completed)
- Notes

Include completion times in format: "Completed today at 10am" if completed in morning, or "Completed on [date]" if completed later.`;

    const summary = await processWithClaude(summaryPrompt);
    
    // Store summary
    const { randomUUID } = await import('crypto');
    const summaryId = randomUUID();
    await client.execute({
      sql: 'INSERT INTO memory_context (id, user_id, context_type, content, summary) VALUES (?, ?, ?, ?, ?)',
      args: [summaryId, userId, 'summary', JSON.stringify({ tasks: tasksResult.rows, ideas: ideasResult.rows, reminders: remindersResult.rows }), summary]
    });

    return summary;
  } catch (error) {
    console.error('Generate summary error:', error);
    throw error;
  }
}

