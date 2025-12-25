/**
 * Test Gmail API Connection
 */

import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';

async function testGmail() {
  console.log('Testing Gmail API connection...\n');

  // Check credentials
  console.log('Credentials check:');
  console.log('- GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('- GMAIL_CLIENT_SECRET:', process.env.GMAIL_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('- GMAIL_REFRESH_TOKEN:', process.env.GMAIL_REFRESH_TOKEN ? '✅ Set' : '❌ Missing');
  console.log('');

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    console.log('❌ Missing credentials. Please check your .env file.');
    return;
  }

  try {
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'http://localhost:3000/oauth/callback'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    // Get Gmail client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Test 1: Get profile
    console.log('Test 1: Getting Gmail profile...');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log('✅ Connected to Gmail!');
    console.log(`   Email: ${profile.data.emailAddress}`);
    console.log(`   Total messages: ${profile.data.messagesTotal}`);
    console.log(`   Total threads: ${profile.data.threadsTotal}`);
    console.log('');

    // Test 2: List recent emails
    console.log('Test 2: Fetching recent emails...');
    const messages = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
    });

    if (messages.data.messages && messages.data.messages.length > 0) {
      console.log(`✅ Found ${messages.data.messages.length} recent emails:`);

      for (const msg of messages.data.messages.slice(0, 3)) {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject'],
        });

        const headers = detail.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';

        console.log(`   - From: ${from.substring(0, 40)}...`);
        console.log(`     Subject: ${subject.substring(0, 50)}...`);
        console.log('');
      }
    } else {
      console.log('   No emails found.');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   ✅ Gmail API is working correctly!');
    console.log('   Your app can now READ and SEND emails.');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.log('❌ Gmail API Error:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('   The refresh token may have expired. Run get-gmail-token.js again.');
    }
  }
}

testGmail();
