import dotenv from 'dotenv';
dotenv.config();

import { getAuthorizationUrl } from '../src/services/linkedin.js';

console.log('='.repeat(60));
console.log('LinkedIn OAuth Setup');
console.log('='.repeat(60));

const { authUrl, state } = getAuthorizationUrl();

console.log('\n📱 To connect your LinkedIn account:\n');
console.log('1. Open this URL in your browser:');
console.log('\n' + authUrl + '\n');
console.log('2. Log in to LinkedIn if needed');
console.log('3. Click "Allow" to grant permissions');
console.log('4. You will be redirected to localhost - that\'s okay!');
console.log('\nState token:', state);
console.log('\n' + '='.repeat(60));
