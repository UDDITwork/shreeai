import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2';
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

const code = process.argv[2];

if (!code) {
  console.error('Usage: node scripts/linkedin-exchange.js YOUR_AUTH_CODE');
  console.error('\nGet the code by running: node scripts/linkedin-auth.js');
  process.exit(1);
}

// Initialize database client
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function exchangeCode() {
  try {
    console.log('Exchanging authorization code for access token...');

    const tokenResponse = await axios.post(
      `${LINKEDIN_AUTH_URL}/accessToken`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3001/api/linkedin/callback'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    const expiresIn = tokenResponse.data.expires_in;

    console.log('Access token obtained!');
    console.log('Token expires in:', Math.ceil(expiresIn / 86400), 'days');

    // Get user profile
    console.log('\nFetching LinkedIn profile...');
    const profileResponse = await axios.get(
      `${LINKEDIN_API_URL}/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const personUrn = `urn:li:person:${profileResponse.data.sub}`;
    const profileName = profileResponse.data.name || 'LinkedIn User';

    console.log('Profile Name:', profileName);
    console.log('Person URN:', personUrn);

    // Store credentials in database
    console.log('\nSaving credentials to database...');

    // Get or create a default user for direct script usage
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Check if we have any existing user in the database
    let userId;
    const existingUsers = await client.execute('SELECT id FROM users LIMIT 1');

    if (existingUsers.rows.length > 0) {
      userId = existingUsers.rows[0].id;
      console.log('Using existing user:', userId);
    } else {
      // Create a default user
      userId = randomUUID();
      await client.execute({
        sql: `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
        args: [userId, 'default@shreeai.local', 'script-generated', new Date().toISOString()]
      });
      console.log('Created default user:', userId);
    }

    // Delete any existing LinkedIn credentials for this user
    await client.execute({
      sql: 'DELETE FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    // Insert the new credentials
    const credentialId = randomUUID();
    await client.execute({
      sql: `INSERT INTO linkedin_credentials
            (id, user_id, access_token, person_urn, profile_name, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [credentialId, userId, accessToken, personUrn, profileName, expiresAt]
    });

    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS! LinkedIn connected!');
    console.log('='.repeat(60));
    console.log('\nProfile:', profileName);
    console.log('Person URN:', personUrn);
    console.log('Expires:', expiresAt);
    console.log('\nYou can now post to LinkedIn!');
    console.log('Run: node scripts/linkedin-test-post.js');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nError:', error.response?.data || error.message);
    if (error.response?.data?.error === 'invalid_grant') {
      console.error('\nThe authorization code has expired or already been used.');
      console.error('Run "node scripts/linkedin-auth.js" again to get a new code.');
    }
  }
}

exchangeCode();
