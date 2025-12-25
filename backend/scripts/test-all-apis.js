/**
 * Test All API Connections
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('           SMART IDEA MANAGER - API TEST                   ');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Test 1: Turso Database
async function testTurso() {
  console.log('1. Testing Turso Database...');
  try {
    const { createClient } = await import('@libsql/client');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const result = await client.execute('SELECT 1 as test');
    console.log('   ✅ Turso Database: Connected!');
    return true;
  } catch (error) {
    console.log('   ❌ Turso Database:', error.message);
    return false;
  }
}

// Test 2: Anthropic (Claude)
async function testAnthropic() {
  console.log('2. Testing Anthropic (Claude)...');
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "OK"' }],
    });
    console.log('   ✅ Anthropic: Connected! Response:', response.content[0].text);
    return true;
  } catch (error) {
    console.log('   ❌ Anthropic:', error.message);
    return false;
  }
}

// Test 3: OpenAI (Embeddings)
async function testOpenAI() {
  console.log('3. Testing OpenAI (Embeddings)...');
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
      input: 'test',
    });
    console.log('   ✅ OpenAI Embeddings: Connected! Dimension:', response.data[0].embedding.length);
    return true;
  } catch (error) {
    console.log('   ❌ OpenAI:', error.message);
    return false;
  }
}

// Test 4: Pinecone
async function testPinecone() {
  console.log('4. Testing Pinecone...');
  try {
    const { Pinecone } = await import('@pinecone-database/pinecone');
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexes = await pinecone.listIndexes();
    console.log('   ✅ Pinecone: Connected! Indexes:', indexes.indexes?.length || 0);

    // Check if our index exists
    const indexName = process.env.PINECONE_INDEX_NAME || 'smart-idea-manager';
    const indexExists = indexes.indexes?.some(i => i.name === indexName);
    if (indexExists) {
      console.log(`   ✅ Index "${indexName}" exists!`);
    } else {
      console.log(`   ⚠️  Index "${indexName}" not found. You may need to create it.`);
    }
    return true;
  } catch (error) {
    console.log('   ❌ Pinecone:', error.message);
    return false;
  }
}

// Test 5: Firecrawler
async function testFirecrawler() {
  console.log('5. Testing Firecrawler...');
  try {
    const axios = (await import('axios')).default;
    const response = await axios.post(
      'https://api.firecrawl.dev/v1/search',
      { query: 'test', pageOptions: { onlyMainContent: true } },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWLER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    console.log('   ✅ Firecrawler: Connected!');
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('   ❌ Firecrawler: Invalid API key');
    } else if (error.response?.status === 429) {
      console.log('   ✅ Firecrawler: Connected (rate limited, but working)');
      return true;
    } else {
      console.log('   ⚠️  Firecrawler:', error.message);
    }
    return false;
  }
}

// Test 6: Gmail
async function testGmail() {
  console.log('6. Testing Gmail API...');
  try {
    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'http://localhost:3000/oauth/callback'
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log('   ✅ Gmail: Connected!', profile.data.emailAddress);
    return true;
  } catch (error) {
    console.log('   ❌ Gmail:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = {
    turso: await testTurso(),
    anthropic: await testAnthropic(),
    openai: await testOpenAI(),
    pinecone: await testPinecone(),
    firecrawler: await testFirecrawler(),
    gmail: await testGmail(),
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      SUMMARY                              ');
  console.log('═══════════════════════════════════════════════════════════');

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.values(results).length;

  console.log(`   Passed: ${passed}/${total}`);
  console.log('');

  if (passed === total) {
    console.log('   🎉 ALL SYSTEMS GO! Your app is ready to run!');
    console.log('');
    console.log('   To start the app:');
    console.log('   cd backend && npm run dev');
    console.log('   cd frontend && npm run dev');
  } else {
    console.log('   ⚠️  Some APIs failed. Check the errors above.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
}

runTests();
