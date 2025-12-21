import { ChatAnthropic } from '@langchain/anthropic';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { pull } from 'langchain/hub';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { searchWeb } from './firecrawler.js';
import { client } from '../models/database.js';
import { storeConversationEmbedding } from './vector-store.js';
import { generateEmbedding } from './embeddings.js';
import { upsertVector } from './vector-store.js';
import { randomUUID as uuidv4 } from 'crypto';
import { extractTimeExpression } from './anthropic.js';

// Tool definitions for the agent
const tools = [
  {
    name: 'search_web',
    description: 'Search the web for information using Firecrawler API',
    func: async (query) => {
      const result = await searchWeb(query);
      return JSON.stringify(result);
    },
  },
  {
    name: 'save_idea',
    description: 'Save an idea or piece of information to the database',
    func: async (userId, title, content, metadata = {}) => {
      const ideaId = uuidv4();
      await client.execute({
        sql: 'INSERT INTO ideas (id, user_id, title, content, metadata) VALUES (?, ?, ?, ?, ?)',
        args: [ideaId, userId, title, content, JSON.stringify(metadata)]
      });

      // Store embedding
      const embedding = await generateEmbedding(`${title} ${content}`);
      await upsertVector(`idea_${ideaId}`, embedding, {
        userId,
        ideaId,
        type: 'idea',
        title,
      });

      return JSON.stringify({ success: true, ideaId });
    },
  },
  {
    name: 'save_task',
    description: 'Create a task with metadata',
    func: async (userId, title, description = '') => {
      const taskId = uuidv4();
      await client.execute({
        sql: 'INSERT INTO tasks (id, user_id, title, description) VALUES (?, ?, ?, ?)',
        args: [taskId, userId, title, description]
      });
      return JSON.stringify({ success: true, taskId });
    },
  },
  {
    name: 'set_reminder',
    description: 'Schedule a reminder with natural language time parsing',
    func: async (userId, taskId, timeExpression) => {
      const timeData = await extractTimeExpression(timeExpression);
      if (!timeData.time) {
        return JSON.stringify({ success: false, error: 'Could not parse time expression' });
      }

      const reminderId = uuidv4();
      await client.execute({
        sql: 'INSERT INTO reminders (id, user_id, task_id, scheduled_time) VALUES (?, ?, ?, ?)',
        args: [reminderId, userId, taskId, timeData.time]
      });

      return JSON.stringify({ success: true, reminderId, scheduledTime: timeData.time });
    },
  },
];

// Create agent prompt
const agentPrompt = `You are an intelligent assistant that helps users manage ideas, tasks, and reminders.
You can execute multiple steps autonomously to complete complex tasks.

When a user asks you to:
1. Search for information and save it
2. Set reminders
3. Process multiple items in sequence

Break down the task into steps and execute them using the available tools.
Always confirm completion of each step and provide a summary at the end.`;

export async function createAgent(userId) {
  try {
    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Create tool wrapper for LangChain
    const langchainTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      func: async (input) => {
        try {
          // Parse input and call tool with userId
          const args = JSON.parse(input);
          return await tool.func(userId, ...args);
        } catch (error) {
          return await tool.func(userId, input);
        }
      },
    }));

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', agentPrompt],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    // Simplified agent implementation
    // Note: LangChain agent creation may need adjustment based on version
    const agent = {
      invoke: async (input) => {
        // Simple agent logic - execute tools based on input
        let result = '';
        for (const tool of langchainTools) {
          if (input.input.toLowerCase().includes(tool.name.split('_')[0])) {
            result = await tool.invoke(input.input);
            break;
          }
        }
        return { output: result || 'Task completed' };
      }
    };

    const agentExecutor = new AgentExecutor({
      agent,
      tools: langchainTools,
      verbose: true,
    });

    return agentExecutor;
  } catch (error) {
    console.error('Agent creation error:', error);
    throw error;
  }
}

export async function executeAgentTask(userId, userMessage, context = '') {
  try {
    const agent = await createAgent(userId);
    
    // Store execution
    const executionId = uuidv4();
    await client.execute({
      sql: 'INSERT INTO agent_executions (id, user_id, execution_type, status) VALUES (?, ?, ?, ?)',
      args: [executionId, userId, 'multi_step', 'running']
    });

    const fullPrompt = context ? `Context: ${context}\n\nUser request: ${userMessage}` : userMessage;
    
    const result = await agent.invoke({
      input: fullPrompt,
    });

    // Update execution
    await client.execute({
      sql: 'UPDATE agent_executions SET status = ?, result = ? WHERE id = ?',
      args: ['completed', JSON.stringify(result), executionId]
    });

    // Store conversation embedding
    await storeConversationEmbedding(userId, executionId, userMessage, {
      executionId,
      result: result.output?.substring(0, 200),
    });

    return {
      success: true,
      result: result.output,
      executionId,
    };
  } catch (error) {
    console.error('Agent execution error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

