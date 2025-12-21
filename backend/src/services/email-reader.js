// Email reading service - placeholder for Gmail API or IMAP integration
import { client } from '../models/database.js';
import { randomUUID as uuidv4 } from 'crypto';

export async function readEmails(userId) {
  // This will be implemented with Gmail API or IMAP
  // For now, return empty array
  return [];
}

export async function storeEmail(userId, emailData) {
  try {
    const emailId = uuidv4();
    
    await client.execute({
      sql: 'INSERT INTO emails (id, user_id, email_id, from_address, to_address, subject, body, is_job_related) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        emailId,
        userId,
        emailData.id || emailId,
        emailData.from,
        emailData.to,
        emailData.subject,
        emailData.body,
        emailData.isJobRelated ? 1 : 0
      ]
    });

    return emailId;
  } catch (error) {
    console.error('Store email error:', error);
    throw error;
  }
}

