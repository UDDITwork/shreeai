import { processWithClaude } from './anthropic.js';
import { sendEmail } from './email.js';
import { client } from '../models/database.js';
import { randomUUID } from 'crypto';

export async function draftFollowupEmail(userId, context) {
  try {
    const prompt = `Draft a professional follow-up email based on this context:
${JSON.stringify(context, null, 2)}

Generate a polite, professional follow-up email. Return only the email content in this JSON format:
{
  "subject": "email subject",
  "body": "email body in HTML format"
}`;

    const response = await processWithClaude(prompt);
    
    // Try to parse JSON
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Fallback
    }

    return {
      subject: 'Follow-up',
      body: response,
    };
  } catch (error) {
    console.error('Draft followup error:', error);
    throw error;
  }
}

export async function saveFollowupDraft(userId, emailId, draft) {
  try {
    const followupId = randomUUID();
    
    await client.execute({
      sql: 'INSERT INTO email_followups (id, user_id, email_id, draft, status) VALUES (?, ?, ?, ?, ?)',
      args: [followupId, userId, emailId, JSON.stringify(draft), 'draft']
    });

    return followupId;
  } catch (error) {
    console.error('Save followup draft error:', error);
    throw error;
  }
}

export async function sendFollowupEmail(userId, followupId, toAddress) {
  try {
    // Get draft
    const result = await client.execute({
      sql: 'SELECT draft FROM email_followups WHERE id = ? AND user_id = ?',
      args: [followupId, userId]
    });

    if (result.rows.length === 0) {
      throw new Error('Followup not found');
    }

    const draft = JSON.parse(result.rows[0].draft);

    // Send email
    const emailResult = await sendEmail(toAddress, draft.subject, draft.body);

    if (emailResult.success) {
      // Update status
      await client.execute({
        sql: 'UPDATE email_followups SET status = ?, sent_at = ? WHERE id = ?',
        args: ['sent', new Date().toISOString(), followupId]
      });

      return { success: true };
    }

    return { success: false, error: emailResult.error };
  } catch (error) {
    console.error('Send followup error:', error);
    throw error;
  }
}

