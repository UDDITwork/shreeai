/**
 * Gmail API Service
 * Handles reading and sending emails using Gmail API
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Create OAuth2 client
function createOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'http://localhost:3000/oauth/callback'
  );

  // Set credentials using refresh token
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return oauth2Client;
}

// Get Gmail API instance
function getGmailClient() {
  const auth = createOAuth2Client();
  return google.gmail({ version: 'v1', auth });
}

/**
 * Get user's Gmail profile
 */
export async function getProfile() {
  try {
    const gmail = getGmailClient();
    const response = await gmail.users.getProfile({ userId: 'me' });
    return {
      success: true,
      email: response.data.emailAddress,
      messagesTotal: response.data.messagesTotal,
      threadsTotal: response.data.threadsTotal,
    };
  } catch (error) {
    console.error('Gmail getProfile error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * List emails with optional query filter
 * @param {Object} options - Search options
 * @param {string} options.query - Gmail search query (e.g., "is:unread", "from:example@gmail.com")
 * @param {number} options.maxResults - Maximum number of emails to return (default: 10)
 * @param {string} options.labelIds - Label IDs to filter (e.g., ['INBOX', 'UNREAD'])
 */
export async function listEmails(options = {}) {
  try {
    const gmail = getGmailClient();
    const { query = '', maxResults = 10, labelIds = ['INBOX'] } = options;

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
      labelIds,
    });

    const messages = response.data.messages || [];

    // Fetch full details for each message
    const emails = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });
        return parseEmail(detail.data);
      })
    );

    return {
      success: true,
      emails,
      resultSizeEstimate: response.data.resultSizeEstimate,
    };
  } catch (error) {
    console.error('Gmail listEmails error:', error.message);
    return { success: false, error: error.message, emails: [] };
  }
}

/**
 * Get a specific email by ID
 */
export async function getEmail(messageId) {
  try {
    const gmail = getGmailClient();
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return {
      success: true,
      email: parseEmail(response.data),
    };
  } catch (error) {
    console.error('Gmail getEmail error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Search emails with a query
 * @param {string} query - Gmail search query
 */
export async function searchEmails(query, maxResults = 20) {
  return listEmails({ query, maxResults, labelIds: [] });
}

/**
 * Get unread emails
 */
export async function getUnreadEmails(maxResults = 10) {
  return listEmails({ query: 'is:unread', maxResults });
}

/**
 * Get emails from a specific sender
 */
export async function getEmailsFrom(senderEmail, maxResults = 10) {
  return listEmails({ query: `from:${senderEmail}`, maxResults });
}

/**
 * Get job-related emails (applications, interviews, offers, rejections)
 */
export async function getJobRelatedEmails(maxResults = 20) {
  const jobQueries = [
    'subject:(job application OR interview OR offer OR position)',
    'from:(careers@ OR recruiting@ OR talent@ OR hr@ OR jobs@)',
    'subject:(application received OR application status)',
    'subject:(interview invitation OR interview schedule)',
  ];

  const query = jobQueries.join(' OR ');
  return listEmails({ query, maxResults, labelIds: [] });
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body (plain text or HTML)
 * @param {boolean} options.isHtml - Whether body is HTML (default: false)
 * @param {string} options.cc - CC recipients (optional)
 * @param {string} options.bcc - BCC recipients (optional)
 * @param {string} options.replyTo - Reply-to address (optional)
 * @param {string} options.threadId - Thread ID for replies (optional)
 */
export async function sendEmail(options) {
  try {
    const gmail = getGmailClient();
    const { to, subject, body, isHtml = false, cc, bcc, replyTo, threadId } = options;

    // Get sender's email
    const profile = await getProfile();
    if (!profile.success) {
      throw new Error('Could not get sender email address');
    }
    const from = profile.email;

    // Build email headers
    const headers = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
    ];

    if (cc) headers.push(`Cc: ${cc}`);
    if (bcc) headers.push(`Bcc: ${bcc}`);
    if (replyTo) headers.push(`Reply-To: ${replyTo}`);

    headers.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`);
    headers.push('MIME-Version: 1.0');

    // Create raw email
    const emailContent = headers.join('\r\n') + '\r\n\r\n' + body;
    const encodedMessage = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send the email
    const requestBody = { raw: encodedMessage };
    if (threadId) requestBody.threadId = threadId;

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    };
  } catch (error) {
    console.error('Gmail sendEmail error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Reply to an email
 */
export async function replyToEmail(originalMessageId, body, isHtml = false) {
  try {
    // Get original email
    const original = await getEmail(originalMessageId);
    if (!original.success) {
      throw new Error('Could not fetch original email');
    }

    const { from, subject, threadId } = original.email;

    // Add "Re:" to subject if not present
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    return sendEmail({
      to: from,
      subject: replySubject,
      body,
      isHtml,
      threadId,
    });
  } catch (error) {
    console.error('Gmail replyToEmail error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark email as read
 */
export async function markAsRead(messageId) {
  try {
    const gmail = getGmailClient();
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
    return { success: true };
  } catch (error) {
    console.error('Gmail markAsRead error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark email as unread
 */
export async function markAsUnread(messageId) {
  try {
    const gmail = getGmailClient();
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['UNREAD'],
      },
    });
    return { success: true };
  } catch (error) {
    console.error('Gmail markAsUnread error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Move email to trash
 */
export async function trashEmail(messageId) {
  try {
    const gmail = getGmailClient();
    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId,
    });
    return { success: true };
  } catch (error) {
    console.error('Gmail trashEmail error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get email labels
 */
export async function getLabels() {
  try {
    const gmail = getGmailClient();
    const response = await gmail.users.labels.list({ userId: 'me' });
    return {
      success: true,
      labels: response.data.labels,
    };
  } catch (error) {
    console.error('Gmail getLabels error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Parse email from Gmail API response format
 */
function parseEmail(messageData) {
  const headers = messageData.payload?.headers || [];

  const getHeader = (name) => {
    const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };

  // Extract body
  let body = '';
  let htmlBody = '';

  function extractBody(payload) {
    if (payload.body?.data) {
      const decodedBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (payload.mimeType === 'text/html') {
        htmlBody = decodedBody;
      } else {
        body = decodedBody;
      }
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        extractBody(part);
      }
    }
  }

  if (messageData.payload) {
    extractBody(messageData.payload);
  }

  // Extract snippet if no body found
  if (!body && !htmlBody) {
    body = messageData.snippet || '';
  }

  return {
    id: messageData.id,
    threadId: messageData.threadId,
    labelIds: messageData.labelIds || [],
    snippet: messageData.snippet,
    from: getHeader('From'),
    to: getHeader('To'),
    cc: getHeader('Cc'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body: body || htmlBody,
    htmlBody,
    isUnread: messageData.labelIds?.includes('UNREAD'),
    internalDate: messageData.internalDate,
  };
}

/**
 * Test Gmail connection
 */
export async function testConnection() {
  const profile = await getProfile();
  if (profile.success) {
    console.log('Gmail API connected successfully!');
    console.log(`Email: ${profile.email}`);
    console.log(`Total messages: ${profile.messagesTotal}`);
  }
  return profile;
}
