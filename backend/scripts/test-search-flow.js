import dotenv from 'dotenv';
dotenv.config();

import { executeAgentTask } from '../src/services/agent.js';
import { initializeDatabase, client } from '../src/models/database.js';

async function testSearchFlow() {
  console.log('='.repeat(60));
  console.log('Testing Search Flow with Firecrawler');
  console.log('='.repeat(60));

  try {
    // Initialize database
    await initializeDatabase();

    // Create test user if not exists
    const testUserId = 'test-user-123';
    await client.execute({
      sql: `INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)`,
      args: [testUserId, 'test@example.com', 'test-hash']
    });
    console.log('Test user created/verified');

    // Test search query
    const searchQuery = 'Search for top AI startups in India with funding';

    console.log('\n📝 Sending message:', searchQuery);
    console.log('-'.repeat(60));

    const result = await executeAgentTask(testUserId, searchQuery, '');

    console.log('\n' + '='.repeat(60));
    console.log('RESULT:');
    console.log('='.repeat(60));
    console.log('Success:', result.success);
    console.log('Tools Used:', result.toolResults?.map(t => t.tool).join(', ') || 'None');
    console.log('\nResponse:');
    console.log(result.result);

    if (result.toolResults?.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('Tool Results:');
      for (const tr of result.toolResults) {
        console.log(`\n[${tr.tool}]`);
        console.log('Input:', JSON.stringify(tr.input));
        console.log('Success:', tr.result?.success);
        if (tr.result?.results) {
          console.log('Results count:', tr.result.results.length);
        }
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  }

  process.exit(0);
}

testSearchFlow();
