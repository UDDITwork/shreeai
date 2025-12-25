import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost:3001/api/google/callback'
);

const code = process.argv[2];

if (!code) {
  console.error('Usage: node scripts/exchange-google-code.js YOUR_AUTH_CODE');
  console.error('\nGet the code by running: node scripts/get-google-auth.js');
  process.exit(1);
}

async function exchangeCode() {
  try {
    console.log('Exchanging authorization code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    console.log('\n='.repeat(60));
    console.log('SUCCESS! Here are your tokens:');
    console.log('='.repeat(60));
    console.log('\nRefresh Token (add this to your .env file):');
    console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nAccess Token (temporary, will be auto-refreshed):');
    console.log(tokens.access_token?.substring(0, 50) + '...');
    console.log('\nToken Expiry:', new Date(tokens.expiry_date));
    console.log('\nScopes granted:', tokens.scope);
    console.log('='.repeat(60));
    console.log('\nUpdate your .env file with the new GMAIL_REFRESH_TOKEN');
    console.log('This token now includes Google Sheets permissions!');
  } catch (error) {
    console.error('Error exchanging code:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.error('\nThe authorization code has expired or already been used.');
      console.error('Run "node scripts/get-google-auth.js" again to get a new code.');
    }
  }
}

exchangeCode();
