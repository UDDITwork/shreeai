import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost:3001/api/google/callback'
);

// All scopes needed for Gmail + Sheets + Drive
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Force consent to get new refresh token
});

console.log('='.repeat(60));
console.log('Google OAuth Setup (Gmail + Sheets)');
console.log('='.repeat(60));
console.log('\n1. First, make sure you have added these scopes in Google Cloud Console:');
console.log('   - https://www.googleapis.com/auth/spreadsheets');
console.log('   - https://www.googleapis.com/auth/drive.file');
console.log('\n2. Also enable these APIs:');
console.log('   - Google Sheets API');
console.log('   - Google Drive API');
console.log('\n3. Open this URL in your browser:');
console.log('\n' + authUrl + '\n');
console.log('4. After authorizing, you will be redirected to a URL with a code parameter');
console.log('5. Copy the code and run: node scripts/exchange-google-code.js YOUR_CODE');
console.log('='.repeat(60));
