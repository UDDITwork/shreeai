/**
 * Email Reading Service
 * Uses Gmail API to read emails
 */

import { client } from '../models/database.js';
import { randomUUID as uuidv4 } from 'crypto';
import {
  listEmails,
  getUnreadEmails,
  getJobRelatedEmails,
  searchEmails,
  getEmail,
  testConnection,
} from './gmail.js';

/**
 * Read emails from Gmail
 * @param {string} userId - User ID in our database
 * @param {Object} options - Options for email fetching
 */
export async function readEmails(userId, options = {}) {
  try {
    const { maxResults = 10, query = '', unreadOnly = false } = options;

    let result;
    if (unreadOnly) {
      result = await getUnreadEmails(maxResults);
    } else if (query) {
      result = await searchEmails(query, maxResults);
    } else {
      result = await listEmails({ maxResults });
    }

    if (!result.success) {
      console.error('Failed to read emails:', result.error);
      return [];
    }

    return result.emails.map((email) => ({
      id: email.id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.body,
      snippet: email.snippet,
      date: email.date,
      isUnread: email.isUnread,
      threadId: email.threadId,
    }));
  } catch (error) {
    console.error('readEmails error:', error.message);
    return [];
  }
}

/**
 * Read job-related emails (applications, interviews, offers)
 */
export async function readJobEmails(userId, maxResults = 20) {
  try {
    const result = await getJobRelatedEmails(maxResults);

    if (!result.success) {
      console.error('Failed to read job emails:', result.error);
      return [];
    }

    return result.emails;
  } catch (error) {
    console.error('readJobEmails error:', error.message);
    return [];
  }
}

/**
 * Store email in database
 */
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
        emailData.isJobRelated ? 1 : 0,
      ],
    });

    return emailId;
  } catch (error) {
    // Handle duplicate email IDs
    if (error.message?.includes('UNIQUE constraint')) {
      console.log('Email already stored:', emailData.id);
      return null;
    }
    console.error('Store email error:', error);
    throw error;
  }
}

/**
 * Get specific email by Gmail message ID
 */
export async function getEmailById(messageId) {
  try {
    const result = await getEmail(messageId);
    if (!result.success) {
      return null;
    }
    return result.email;
  } catch (error) {
    console.error('getEmailById error:', error.message);
    return null;
  }
}

/**
 * Test Gmail API connection
 */
export async function testGmailConnection() {
  return testConnection();
}
