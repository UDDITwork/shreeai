import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { client } from '../models/database.js';
import { draftFollowupEmail, saveFollowupDraft, sendFollowupEmail } from '../services/followup.js';
import { isJobRelated } from '../services/email-filter.js';
import { readEmails, storeEmail } from '../services/email-reader.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await client.execute({
      sql: 'SELECT * FROM emails WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId]
    });

    res.json({ emails: result.rows });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

router.get('/job-updates', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await client.execute({
      sql: 'SELECT * FROM emails WHERE user_id = ? AND is_job_related = 1 ORDER BY created_at DESC',
      args: [userId]
    });

    res.json({ emails: result.rows });
  } catch (error) {
    console.error('Get job updates error:', error);
    res.status(500).json({ error: 'Failed to fetch job updates' });
  }
});

router.post('/followup/draft', authenticateToken, async (req, res) => {
  try {
    const { emailId, context } = req.body;
    const userId = req.user.userId;

    const draft = await draftFollowupEmail(userId, context || {});
    const followupId = await saveFollowupDraft(userId, emailId, draft);

    res.json({ followupId, draft });
  } catch (error) {
    console.error('Draft followup error:', error);
    res.status(500).json({ error: 'Failed to draft followup' });
  }
});

router.post('/followup/send', authenticateToken, async (req, res) => {
  try {
    const { followupId, toAddress } = req.body;
    const userId = req.user.userId;

    const result = await sendFollowupEmail(userId, followupId, toAddress);

    res.json(result);
  } catch (error) {
    console.error('Send followup error:', error);
    res.status(500).json({ error: 'Failed to send followup' });
  }
});

router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Read emails (placeholder - will be implemented with Gmail API/IMAP)
    const emails = await readEmails(userId);
    
    // Filter and store job-related emails
    const jobEmails = [];
    for (const email of emails) {
      const isJob = await isJobRelated(email);
      if (isJob) {
        await storeEmail(userId, { ...email, isJobRelated: true });
        jobEmails.push(email);
      }
    }

    // Emit WebSocket notification for job updates
    const io = req.app.get('io');
    if (io && jobEmails.length > 0) {
      io.to(userId).emit('job_update', {
        count: jobEmails.length,
        emails: jobEmails,
      });
    }

    res.json({ success: true, jobEmailsCount: jobEmails.length });
  } catch (error) {
    console.error('Sync emails error:', error);
    res.status(500).json({ error: 'Failed to sync emails' });
  }
});

export default router;

