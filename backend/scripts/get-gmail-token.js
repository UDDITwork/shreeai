/**
 * Gmail OAuth Token Generator
 *
 * This script helps you get a refresh token for Gmail API access.
 *
 * SETUP:
 * 1. Set your GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET below
 * 2. Run: node scripts/get-gmail-token.js
 * 3. Open the URL in your browser
 * 4. Sign in and authorize
 * 5. Copy the refresh token to your .env file
 */

import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// YOUR CREDENTIALS (SET THESE BEFORE RUNNING)
// Get from: Google Cloud Console > APIs & Services > Credentials
// ============================================
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
// ============================================

const REDIRECT_URI = 'http://localhost:3000/oauth/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
];

// Generate authorization URL
function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });

  return response.json();
}

// Start local server to receive callback
function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:3000`);

    if (url.pathname === '/oauth/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error: ${error}</h1><p>Please try again.</p>`);
        server.close();
        process.exit(1);
      }

      if (code) {
        console.log('\n✅ Authorization code received!');
        console.log('🔄 Exchanging for tokens...\n');

        try {
          const tokens = await exchangeCodeForTokens(code);

          if (tokens.error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error: ${tokens.error}</h1><p>${tokens.error_description}</p>`);
            console.error('❌ Token exchange failed:', tokens);
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Success!</title></head>
                <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px;">
                  <h1 style="color: green;">✅ Success!</h1>
                  <p>Your Gmail API credentials have been generated.</p>
                  <p>Check your terminal for the tokens.</p>
                  <p>You can close this window now.</p>
                </body>
              </html>
            `);

            console.log('═══════════════════════════════════════════════════════════');
            console.log('                    YOUR GMAIL CREDENTIALS                  ');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('');
            console.log('Add these to your backend/.env file:');
            console.log('');
            console.log(`GMAIL_CLIENT_ID=${GMAIL_CLIENT_ID}`);
            console.log(`GMAIL_CLIENT_SECRET=${GMAIL_CLIENT_SECRET}`);
            console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log('');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('');
            console.log('Access Token (expires in 1 hour):');
            console.log(tokens.access_token);
            console.log('');

            if (!tokens.refresh_token) {
              console.log('⚠️  WARNING: No refresh token received!');
              console.log('    This happens if you already authorized this app before.');
              console.log('    To get a new refresh token:');
              console.log('    1. Go to https://myaccount.google.com/permissions');
              console.log('    2. Remove access for your app');
              console.log('    3. Run this script again');
            }
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Server Error</h1><pre>${err.message}</pre>`);
          console.error('❌ Error:', err);
        }

        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 2000);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(3000, () => {
    const authUrl = getAuthUrl();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('               GMAIL API TOKEN GENERATOR                   ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Step 1: Open this URL in your browser:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log('Step 2: Sign in with your Google account');
    console.log('Step 3: Click "Allow" to grant permissions');
    console.log('Step 4: You will be redirected back here');
    console.log('');
    console.log('Waiting for authorization...');
    console.log('');
  });
}

// Validate credentials before starting
if (GMAIL_CLIENT_ID === 'YOUR_CLIENT_ID_HERE' || GMAIL_CLIENT_SECRET === 'YOUR_CLIENT_SECRET_HERE') {
  console.log('');
  console.log('❌ ERROR: Please set your credentials first!');
  console.log('');
  console.log('Open this file and replace:');
  console.log('  - YOUR_CLIENT_ID_HERE with your Gmail Client ID');
  console.log('  - YOUR_CLIENT_SECRET_HERE with your Gmail Client Secret');
  console.log('');
  console.log('You can find these in Google Cloud Console:');
  console.log('  APIs & Services → Credentials → OAuth 2.0 Client IDs');
  console.log('');
  process.exit(1);
}

startServer();
