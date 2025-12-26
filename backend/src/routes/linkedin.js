import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { client } from '../models/database.js';
import {
  getAuthorizationUrl,
  getAccessToken,
  getProfile,
  createTextPost,
  createArticlePost,
  createImagePost,
  createVideoPost,
  uploadImage,
  uploadVideo,
  deletePost,
  getRateLimitStatus,
  LinkedInVisibility
} from '../services/linkedin.js';
import { randomUUID as uuidv4 } from 'crypto';

const router = express.Router();

// Store pending OAuth states (in production, use Redis or database)
const pendingStates = new Map();

// Step 1: Get authorization URL to connect LinkedIn - REDIRECTS DIRECTLY
// Supports both header auth and query param token (for popup flow)
router.get('/auth', async (req, res) => {
  try {
    // Try to get user from token in query param (popup flow) or header
    let userId;
    const queryToken = req.query.token;
    const headerToken = req.headers.authorization?.split(' ')[1];
    const token = queryToken || headerToken;

    if (!token) {
      return res.status(401).send('Authentication required. Please login first.');
    }

    // Verify token
    const jwt = await import('jsonwebtoken');
    try {
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
    } catch (err) {
      return res.status(401).send('Invalid or expired token. Please login again.');
    }

    const { authUrl, state } = getAuthorizationUrl();

    // Store state with user ID for verification
    pendingStates.set(state, {
      userId: userId,
      timestamp: Date.now()
    });

    // Redirect directly to LinkedIn authorization
    res.redirect(authUrl);
  } catch (error) {
    console.error('LinkedIn auth URL error:', error);
    res.status(500).send('Failed to start LinkedIn authorization');
  }
});

// Step 2: OAuth callback - exchange code for token
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(`LinkedIn authorization failed: ${error}`);
    }

    // Verify state
    const stateData = pendingStates.get(state);
    if (!stateData) {
      return res.status(400).send('Invalid state - please try again');
    }
    pendingStates.delete(state);

    const userId = stateData.userId;

    // Exchange code for access token
    const tokenResult = await getAccessToken(code);
    if (!tokenResult.success) {
      return res.status(400).send(`Token exchange failed: ${tokenResult.error}`);
    }

    // Get user profile to get person URN
    const profileResult = await getProfile(tokenResult.accessToken);
    if (!profileResult.success) {
      return res.status(400).send(`Profile fetch failed: ${profileResult.error}`);
    }

    // Store the credentials in database
    const credentialId = uuidv4();
    await client.execute({
      sql: `INSERT OR REPLACE INTO linkedin_credentials
            (id, user_id, access_token, person_urn, profile_name, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        credentialId,
        userId,
        tokenResult.accessToken,
        profileResult.personUrn,
        profileResult.profile.name || 'LinkedIn User',
        new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
      ]
    });

    // Success page
    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>✅ LinkedIn Connected!</h1>
          <p>You can now post to LinkedIn from the Smart Idea Manager.</p>
          <p>Profile: ${profileResult.profile.name || 'Connected'}</p>
          <p>You can close this window.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('LinkedIn callback error:', error);
    res.status(500).send('Failed to complete LinkedIn authorization');
  }
});

// Check if user has LinkedIn connected
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const result = await client.execute({
      sql: 'SELECT person_urn, profile_name, expires_at FROM linkedin_credentials WHERE user_id = ?',
      args: [req.user.userId]
    });

    if (result.rows.length === 0) {
      return res.json({ connected: false });
    }

    const credential = result.rows[0];
    const isExpired = new Date(credential.expires_at) < new Date();

    res.json({
      connected: !isExpired,
      profileName: credential.profile_name,
      expired: isExpired
    });
  } catch (error) {
    console.error('LinkedIn status error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// Create a LinkedIn post
router.post('/post', authenticateToken, async (req, res) => {
  try {
    const { text, articleUrl, articleTitle, articleDescription } = req.body;
    const userId = req.user.userId;

    if (!text) {
      return res.status(400).json({ error: 'Post text is required' });
    }

    // Get stored credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token, person_urn FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return res.status(401).json({
        error: 'LinkedIn not connected',
        authRequired: true,
        message: 'Please connect your LinkedIn account first'
      });
    }

    const { access_token, person_urn } = credResult.rows[0];

    let result;
    if (articleUrl) {
      // Post with article/link
      result = await createArticlePost(
        access_token,
        person_urn,
        text,
        articleUrl,
        articleTitle || 'Shared Article',
        articleDescription || ''
      );
    } else {
      // Text-only post
      result = await createTextPost(access_token, person_urn, text);
    }

    if (result.success) {
      // Log the post
      await client.execute({
        sql: 'INSERT INTO linkedin_posts (id, user_id, content, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, text, result.postId, new Date().toISOString()]
      });
    }

    res.json(result);
  } catch (error) {
    console.error('LinkedIn post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Disconnect LinkedIn
router.delete('/disconnect', authenticateToken, async (req, res) => {
  try {
    await client.execute({
      sql: 'DELETE FROM linkedin_credentials WHERE user_id = ?',
      args: [req.user.userId]
    });

    res.json({ success: true, message: 'LinkedIn disconnected' });
  } catch (error) {
    console.error('LinkedIn disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get rate limit status
router.get('/rate-limit', authenticateToken, (req, res) => {
  try {
    const status = getRateLimitStatus();
    res.json({
      success: true,
      ...status,
      message: `${status.remaining} of ${status.limit} requests remaining. Resets in ${status.resetIn} hours.`
    });
  } catch (error) {
    console.error('Rate limit status error:', error);
    res.status(500).json({ error: 'Failed to get rate limit status' });
  }
});

// Delete a LinkedIn post
router.delete('/post/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Get stored credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return res.status(401).json({
        error: 'LinkedIn not connected',
        authRequired: true
      });
    }

    const { access_token } = credResult.rows[0];
    const result = await deletePost(access_token, postId);

    if (result.success) {
      // Remove from our database too
      await client.execute({
        sql: 'DELETE FROM linkedin_posts WHERE post_id = ? AND user_id = ?',
        args: [postId, userId]
      });
    }

    res.json(result);
  } catch (error) {
    console.error('LinkedIn delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Get user's LinkedIn post history
router.get('/posts', authenticateToken, async (req, res) => {
  try {
    const result = await client.execute({
      sql: 'SELECT id, content, post_id, created_at FROM linkedin_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      args: [req.user.userId]
    });

    res.json({
      success: true,
      posts: result.rows
    });
  } catch (error) {
    console.error('LinkedIn posts history error:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// Create post with visibility option
router.post('/post/advanced', authenticateToken, async (req, res) => {
  try {
    const { text, articleUrl, articleTitle, articleDescription, visibility } = req.body;
    const userId = req.user.userId;

    if (!text) {
      return res.status(400).json({ error: 'Post text is required' });
    }

    // Validate visibility
    const postVisibility = visibility === 'CONNECTIONS'
      ? LinkedInVisibility.CONNECTIONS
      : LinkedInVisibility.PUBLIC;

    // Get stored credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token, person_urn FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return res.status(401).json({
        error: 'LinkedIn not connected',
        authRequired: true,
        message: 'Please connect your LinkedIn account first'
      });
    }

    const { access_token, person_urn } = credResult.rows[0];

    let result;
    if (articleUrl) {
      result = await createArticlePost(
        access_token,
        person_urn,
        text,
        articleUrl,
        articleTitle || 'Shared Article',
        articleDescription || '',
        postVisibility
      );
    } else {
      result = await createTextPost(access_token, person_urn, text, postVisibility);
    }

    if (result.success) {
      await client.execute({
        sql: 'INSERT INTO linkedin_posts (id, user_id, content, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, text, result.postId, new Date().toISOString()]
      });
    }

    res.json(result);
  } catch (error) {
    console.error('LinkedIn advanced post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Upload and post image (for future use with multer middleware)
router.post('/post/image', authenticateToken, async (req, res) => {
  try {
    const { text, imageBase64, fileName, visibility } = req.body;
    const userId = req.user.userId;

    if (!text || !imageBase64) {
      return res.status(400).json({ error: 'Post text and image are required' });
    }

    const postVisibility = visibility === 'CONNECTIONS'
      ? LinkedInVisibility.CONNECTIONS
      : LinkedInVisibility.PUBLIC;

    // Get stored credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token, person_urn FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return res.status(401).json({
        error: 'LinkedIn not connected',
        authRequired: true
      });
    }

    const { access_token, person_urn } = credResult.rows[0];

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Upload image first
    const uploadResult = await uploadImage(access_token, person_urn, imageBuffer, fileName || 'image.png');
    if (!uploadResult.success) {
      return res.status(400).json(uploadResult);
    }

    // Create post with image
    const result = await createImagePost(access_token, person_urn, text, uploadResult.asset, postVisibility);

    if (result.success) {
      await client.execute({
        sql: 'INSERT INTO linkedin_posts (id, user_id, content, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, text, result.postId, new Date().toISOString()]
      });
    }

    res.json(result);
  } catch (error) {
    console.error('LinkedIn image post error:', error);
    res.status(500).json({ error: 'Failed to create image post' });
  }
});

// Upload and post video
router.post('/post/video', authenticateToken, async (req, res) => {
  try {
    const { text, videoBase64, fileName, visibility } = req.body;
    const userId = req.user.userId;

    if (!text || !videoBase64) {
      return res.status(400).json({ error: 'Post text and video are required' });
    }

    const postVisibility = visibility === 'CONNECTIONS'
      ? LinkedInVisibility.CONNECTIONS
      : LinkedInVisibility.PUBLIC;

    // Get stored credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token, person_urn FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return res.status(401).json({
        error: 'LinkedIn not connected',
        authRequired: true
      });
    }

    const { access_token, person_urn } = credResult.rows[0];

    // Convert base64 to buffer
    const videoBuffer = Buffer.from(videoBase64, 'base64');

    // Upload video first
    const uploadResult = await uploadVideo(access_token, person_urn, videoBuffer, fileName || 'video.mp4');
    if (!uploadResult.success) {
      return res.status(400).json(uploadResult);
    }

    // Create post with video
    const result = await createVideoPost(access_token, person_urn, text, uploadResult.asset, postVisibility);

    if (result.success) {
      await client.execute({
        sql: 'INSERT INTO linkedin_posts (id, user_id, content, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, text, result.postId, new Date().toISOString()]
      });
    }

    res.json(result);
  } catch (error) {
    console.error('LinkedIn video post error:', error);
    res.status(500).json({ error: 'Failed to create video post' });
  }
});

export default router;
