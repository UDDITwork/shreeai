import dotenv from 'dotenv';
dotenv.config();

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2';

const clientId = process.env.LINKEDIN_CLIENT_ID;
const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3001/api/linkedin/callback';
const scope = 'openid profile w_member_social';
const state = Math.random().toString(36).substring(7);

const authUrl = `${LINKEDIN_AUTH_URL}/authorization?` +
  `response_type=code&` +
  `client_id=${clientId}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `scope=${encodeURIComponent(scope)}&` +
  `state=${state}`;

console.log('='.repeat(60));
console.log('LinkedIn OAuth Setup');
console.log('='.repeat(60));
console.log('\nLinkedIn Client ID:', clientId ? 'Set' : 'Missing!');
console.log('Redirect URI:', redirectUri);
console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. After authorizing, you will be redirected to a callback URL.');
console.log('3. Copy the "code" parameter from the URL.');
console.log('4. Run: node scripts/linkedin-exchange.js YOUR_CODE');
console.log('='.repeat(60));
