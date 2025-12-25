import express from 'express';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback'
);

// All scopes needed for Gmail + Sheets + Drive
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

// Get authorization URL
router.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  res.json({
    success: true,
    authUrl,
    message: 'Open this URL to authorize Gmail and Google Sheets access'
  });
});

// OAuth callback - exchange code for tokens
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Authorization failed: ${error}`);
  }

  if (!code) {
    return res.status(400).send('No authorization code provided');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Display the refresh token for the user to copy
    res.send(`
      <html>
        <head>
          <title>Google Authorization Success</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .token-box { background: #f0f0f0; padding: 15px; border-radius: 8px; word-break: break-all; margin: 20px 0; }
            .success { color: #28a745; }
            code { background: #e9ecef; padding: 2px 6px; border-radius: 4px; }
            .warning { color: #856404; background: #fff3cd; padding: 15px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1 class="success">Google Authorization Successful!</h1>

          <h2>Your Refresh Token:</h2>
          <div class="token-box">
            <code id="token">${tokens.refresh_token || 'No refresh token returned (you may already have one)'}</code>
          </div>

          <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent)">
            Copy Token
          </button>

          <div class="warning" style="margin-top: 20px;">
            <strong>Important:</strong> Update your <code>.env</code> file with this token:
            <pre>GMAIL_REFRESH_TOKEN=${tokens.refresh_token || 'your_existing_token'}</pre>
          </div>

          <h3>Scopes Granted:</h3>
          <ul>
            ${tokens.scope?.split(' ').map(s => `<li>${s}</li>`).join('') || '<li>Unknown</li>'}
          </ul>

          <p>You can now close this window and restart your server.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Token exchange error:', err);
    res.status(500).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${err.message}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

// Check current auth status
router.get('/status', (req, res) => {
  const hasCredentials = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );

  res.json({
    configured: hasCredentials,
    clientId: process.env.GMAIL_CLIENT_ID ? 'Set' : 'Missing',
    clientSecret: process.env.GMAIL_CLIENT_SECRET ? 'Set' : 'Missing',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN ? 'Set' : 'Missing'
  });
});

export default router;
