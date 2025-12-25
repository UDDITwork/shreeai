import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2';
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

// Initialize database client
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const code = process.argv[2];

if (!code) {
  console.error('Usage: node scripts/linkedin-save-direct.js YOUR_AUTH_CODE');
  process.exit(1);
}

async function saveLinkedIn() {
  try {
    console.log('Exchanging authorization code...');

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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    const expiresIn = tokenResponse.data.expires_in;
    console.log('Token obtained! Expires in', Math.ceil(expiresIn / 86400), 'days');

    // Get profile
    console.log('Fetching profile...');
    const profileResponse = await axios.get(`${LINKEDIN_API_URL}/userinfo`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const personUrn = `urn:li:person:${profileResponse.data.sub}`;
    const profileName = profileResponse.data.name || 'LinkedIn User';
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log('Profile:', profileName);
    console.log('URN:', personUrn);

    // Save directly without foreign key - drop and recreate table
    console.log('\nSaving to database...');

    // Check current table structure
    try {
      await client.execute('DROP TABLE IF EXISTS linkedin_credentials_backup');
      await client.execute('ALTER TABLE linkedin_credentials RENAME TO linkedin_credentials_backup');
    } catch (e) {
      // Table might not exist
    }

    // Create table without foreign key constraint
    await client.execute(`
      CREATE TABLE IF NOT EXISTS linkedin_credentials (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        access_token TEXT NOT NULL,
        person_urn TEXT NOT NULL,
        profile_name TEXT,
        expires_at TEXT
      )
    `);

    const credentialId = randomUUID();
    await client.execute({
      sql: `INSERT INTO linkedin_credentials (id, user_id, access_token, person_urn, profile_name, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [credentialId, 'script-user', accessToken, personUrn, profileName, expiresAt]
    });

    console.log('\n' + '='.repeat(50));
    console.log('SUCCESS! LinkedIn connected!');
    console.log('='.repeat(50));
    console.log('Profile:', profileName);
    console.log('You can now run: node scripts/linkedin-test-post.js');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data?.error === 'invalid_grant') {
      console.error('\nCode expired. Get a new one from the auth URL.');
    }
  }
}

saveLinkedIn();
