import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { createClient } from '@libsql/client';

const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

// Initialize database client
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const testMessage = process.argv[2] || 'Test Configured: Autonomous hello! The Shree AI is live and ready to follow orders.';

async function postToLinkedIn() {
  try {
    console.log('Fetching LinkedIn credentials from database...');

    const result = await client.execute({
      sql: 'SELECT access_token, person_urn, profile_name FROM linkedin_credentials LIMIT 1',
      args: []
    });

    if (result.rows.length === 0) {
      console.error('\nNo LinkedIn credentials found!');
      console.error('Please connect LinkedIn first:');
      console.error('  1. Run: node scripts/linkedin-auth.js');
      console.error('  2. Copy the authorization code from the callback URL');
      console.error('  3. Run: node scripts/linkedin-exchange.js YOUR_CODE');
      process.exit(1);
    }

    const { access_token, person_urn, profile_name } = result.rows[0];

    console.log('Logged in as:', profile_name);
    console.log('Person URN:', person_urn);
    console.log('\nPosting message:');
    console.log('"' + testMessage + '"');
    console.log('\nSending to LinkedIn...');

    const response = await axios.post(
      `${LINKEDIN_API_URL}/ugcPosts`,
      {
        author: person_urn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: testMessage
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const postId = response.headers['x-restli-id'] || response.data.id;

    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS! Post published to LinkedIn!');
    console.log('='.repeat(60));
    console.log('Post ID:', postId);
    console.log('Profile:', profile_name);
    console.log('\nCheck your LinkedIn profile to see the post!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nError posting to LinkedIn:');
    console.error(error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.error('\nAccess token may have expired. Please reconnect:');
      console.error('  1. Run: node scripts/linkedin-auth.js');
      console.error('  2. Complete the OAuth flow');
    }
  }
}

postToLinkedIn();
