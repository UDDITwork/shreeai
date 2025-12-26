import Anthropic from '@anthropic-ai/sdk';
import { searchWeb, scrapeUrl } from './firecrawler.js';
import { client } from '../models/database.js';
import { storeConversationEmbedding, upsertVector } from './vector-store.js';
import { generateEmbedding } from './embeddings.js';
import { randomUUID as uuidv4 } from 'crypto';
import { parseTimeExpression } from '../utils/time-parser.js';
import { sendEmail, listEmails } from './gmail.js';
import { createTextPost, createArticlePost, createImagePost, uploadImage, getRateLimitStatus, LinkedInVisibility } from './linkedin.js';
import { generateImage, generateImageBuffer, suggestImagePrompt } from './image-generator.js';
import {
  createSpreadsheet,
  readRange,
  writeRange,
  appendRows,
  clearRange,
  deleteRows,
  listSpreadsheets,
  deleteSpreadsheet,
  getSpreadsheetSummary,
  addSheet,
  deleteSheet
} from './google-sheets.js';
// Personalization & Productivity imports
import {
  getOrCreateProfile,
  updateProfile,
  learnFromConversation,
  recordIncomeSource,
  getIncomeSources,
  addOrUpdateContact,
  getContacts,
  recordWellbeingLog,
  getWellbeingLogs,
  getPersonalizedContext,
  updateDailyMetrics
} from './personalization.js';
import {
  createProtectedTimeBlock,
  getProtectedTimeBlocks,
  isCurrentlyProtected,
  getPrioritizedTasks,
  addPrioritizedTask,
  generateOptimizedSchedule,
  logTimeSaving
} from './productivity-optimizer.js';
import {
  createGoal,
  getGoals,
  logProgress,
  getDailyHabitsStatus,
  getGoalsSummary
} from './goals.js';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Tool definitions for Claude
const tools = [
  {
    name: 'search_web',
    description: 'Search the web for information using Firecrawler API. Use this when user asks to search, find, look up, or research something.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find information on the web'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'save_idea',
    description: 'Save an idea, note, or piece of information to the database for later retrieval.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A short title for the idea'
        },
        content: {
          type: 'string',
          description: 'The full content or description of the idea'
        },
        type: {
          type: 'string',
          description: 'Type of idea: startup, research, task, note, etc.'
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'save_task',
    description: 'Create a task or to-do item.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The task title'
        },
        description: {
          type: 'string',
          description: 'Optional description of the task'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder for a specific time. If no time is provided, ask the user when they want to be reminded.',
    input_schema: {
      type: 'object',
      properties: {
        reminder_text: {
          type: 'string',
          description: 'What to remind the user about'
        },
        time_expression: {
          type: 'string',
          description: 'When to remind (e.g., "tomorrow at 10am", "in 2 hours", "next Monday")'
        }
      },
      required: ['reminder_text']
    }
  },
  {
    name: 'send_email',
    description: 'Send an email on behalf of the user.',
    input_schema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address'
        },
        subject: {
          type: 'string',
          description: 'Email subject line'
        },
        body: {
          type: 'string',
          description: 'Email body content'
        }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'read_emails',
    description: 'Read recent emails from the user inbox.',
    input_schema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of emails to fetch (default 5)'
        },
        filter: {
          type: 'string',
          description: 'Optional filter: "unread", "job", or search term'
        }
      },
      required: []
    }
  },
  {
    name: 'scrape_url',
    description: 'Scrape content from a specific URL to extract information.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to scrape'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'post_to_linkedin',
    description: 'Create and publish a post on the user\'s LinkedIn profile. Use this when the user wants to share content on LinkedIn.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The text content of the LinkedIn post. Should be engaging and professional.'
        },
        article_url: {
          type: 'string',
          description: 'Optional URL to share as an article/link post'
        },
        article_title: {
          type: 'string',
          description: 'Title for the shared article (if article_url is provided)'
        },
        visibility: {
          type: 'string',
          enum: ['PUBLIC', 'CONNECTIONS'],
          description: 'Who can see the post: PUBLIC (anyone on LinkedIn) or CONNECTIONS (only connections). Default is PUBLIC.'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'check_linkedin_status',
    description: 'Check LinkedIn connection status and remaining API rate limits. Use this before posting to ensure the user is connected.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'generate_image',
    description: 'Generate an AI image using DALL-E 3. Use this when user wants to create an image, illustration, or visual content.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate. Be specific about style, colors, composition.'
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1792x1024', '1024x1792'],
          description: 'Image dimensions. 1024x1024 (square), 1792x1024 (landscape), 1024x1792 (portrait). Default: 1024x1024'
        },
        style: {
          type: 'string',
          enum: ['vivid', 'natural'],
          description: 'Image style. vivid = hyper-real/dramatic, natural = more realistic. Default: vivid'
        },
        quality: {
          type: 'string',
          enum: ['standard', 'hd'],
          description: 'Image quality. hd = more detail but costs more. Default: standard'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'post_to_linkedin_with_image',
    description: 'Create and publish a LinkedIn post with an AI-generated image. Use this when user wants to post on LinkedIn with a custom generated image.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The text content of the LinkedIn post. Should be engaging and professional.'
        },
        image_prompt: {
          type: 'string',
          description: 'Description of the image to generate for the post. Will be used with DALL-E 3.'
        },
        visibility: {
          type: 'string',
          enum: ['PUBLIC', 'CONNECTIONS'],
          description: 'Who can see the post: PUBLIC or CONNECTIONS. Default: PUBLIC'
        }
      },
      required: ['content', 'image_prompt']
    }
  },
  {
    name: 'search_viral_content',
    description: 'Search for trending/viral technical content on the internet. Use this when user asks for viral content, trending posts, or popular tech news.',
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic to search for viral content (e.g., "AI", "tech", "programming")'
        },
        platform: {
          type: 'string',
          description: 'Optional platform focus: "twitter", "hackernews", "reddit", "general"'
        }
      },
      required: ['topic']
    }
  },
  // Google Sheets Tools
  {
    name: 'create_spreadsheet',
    description: 'Create a new Google Spreadsheet. Use when user wants to create a new spreadsheet or sheet.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title for the new spreadsheet'
        },
        sheet_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional names for the sheets in the spreadsheet (default: Sheet1)'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'read_spreadsheet',
    description: 'Read data from a Google Spreadsheet. Use when user asks to view, check, or get data from a sheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'The ID of the spreadsheet (from URL: docs.google.com/spreadsheets/d/{ID}/edit)'
        },
        range: {
          type: 'string',
          description: 'The A1 notation range to read (e.g., "Sheet1!A1:D10", "A1:Z100"). Default reads first sheet.'
        }
      },
      required: ['spreadsheet_id']
    }
  },
  {
    name: 'write_spreadsheet',
    description: 'Write or update data in a Google Spreadsheet. Use when user wants to add, update, or modify data in a sheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'The ID of the spreadsheet'
        },
        range: {
          type: 'string',
          description: 'The A1 notation range to write to (e.g., "Sheet1!A1:D5")'
        },
        values: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' }
          },
          description: 'The data to write as a 2D array (rows and columns)'
        }
      },
      required: ['spreadsheet_id', 'range', 'values']
    }
  },
  {
    name: 'append_to_spreadsheet',
    description: 'Append new rows to a Google Spreadsheet. Use when user wants to add new data at the end of a sheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'The ID of the spreadsheet'
        },
        range: {
          type: 'string',
          description: 'The sheet or range to append to (e.g., "Sheet1" or "Sheet1!A:D")'
        },
        values: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' }
          },
          description: 'The rows to append as a 2D array'
        }
      },
      required: ['spreadsheet_id', 'range', 'values']
    }
  },
  {
    name: 'delete_spreadsheet_data',
    description: 'Clear or delete data from a Google Spreadsheet. Use when user wants to clear cells or delete rows.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'The ID of the spreadsheet'
        },
        action: {
          type: 'string',
          enum: ['clear_range', 'delete_rows', 'delete_sheet', 'delete_spreadsheet'],
          description: 'The deletion action to perform'
        },
        range: {
          type: 'string',
          description: 'For clear_range: The A1 notation range to clear'
        },
        sheet_id: {
          type: 'number',
          description: 'For delete_rows or delete_sheet: The sheet ID'
        },
        start_row: {
          type: 'number',
          description: 'For delete_rows: Starting row index (0-based)'
        },
        end_row: {
          type: 'number',
          description: 'For delete_rows: Ending row index (0-based, exclusive)'
        }
      },
      required: ['spreadsheet_id', 'action']
    }
  },
  {
    name: 'list_spreadsheets',
    description: 'List all Google Spreadsheets the user has access to. Use when user asks to see their spreadsheets or find a specific one.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of spreadsheets to return (default 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'summarize_spreadsheet',
    description: 'Get an AI-friendly summary of a Google Spreadsheet including structure, headers, data types, and sample data. Use when user asks for a summary or overview of a spreadsheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'The ID of the spreadsheet to summarize'
        }
      },
      required: ['spreadsheet_id']
    }
  },
  {
    name: 'add_sheet',
    description: 'Add a new sheet/tab to an existing Google Spreadsheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'The ID of the spreadsheet'
        },
        sheet_title: {
          type: 'string',
          description: 'Title for the new sheet'
        }
      },
      required: ['spreadsheet_id', 'sheet_title']
    }
  },
  // ============================================
  // PERSONALIZATION & PROFILE TOOLS
  // ============================================
  {
    name: 'update_my_profile',
    description: 'Update user preferences, schedule, goals, or personal information. Use when user shares preferences, work hours, goals, or personal details.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['name', 'preferred_name', 'timezone', 'wake_time', 'sleep_time', 'work_start_time', 'work_end_time', 'communication_style', 'interests', 'short_term_goals', 'long_term_goals', 'daily_habits', 'financial_goal', 'personality_notes'],
          description: 'The profile field to update'
        },
        value: {
          type: 'string',
          description: 'The new value for the field'
        }
      },
      required: ['field', 'value']
    }
  },
  {
    name: 'add_contact',
    description: 'Add or update a contact/relationship the AI should remember. Use when user mentions important people in their life.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the contact'
        },
        relationship: {
          type: 'string',
          description: 'Relationship type: family, friend, colleague, boss, client, mentor, etc.'
        },
        phone: {
          type: 'string',
          description: 'Phone number (optional)'
        },
        email: {
          type: 'string',
          description: 'Email address (optional)'
        },
        birthday: {
          type: 'string',
          description: 'Birthday in YYYY-MM-DD format (optional)'
        },
        notes: {
          type: 'string',
          description: 'Additional notes about this contact'
        },
        importance: {
          type: 'number',
          description: 'Importance level 1-5 (5 = most important)'
        }
      },
      required: ['name', 'relationship']
    }
  },
  {
    name: 'get_my_contacts',
    description: 'Get list of user contacts/relationships the AI knows about.',
    input_schema: {
      type: 'object',
      properties: {
        relationship: {
          type: 'string',
          description: 'Filter by relationship type (optional)'
        }
      },
      required: []
    }
  },
  // ============================================
  // GOAL TRACKING TOOLS
  // ============================================
  {
    name: 'create_goal',
    description: 'Create a new goal (short-term, long-term, or daily habit). Use when user sets a goal or commits to something.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Goal title'
        },
        description: {
          type: 'string',
          description: 'Detailed goal description'
        },
        goal_type: {
          type: 'string',
          enum: ['short_term', 'long_term', 'daily_habit', 'weekly_habit', 'income_goal', 'savings_goal', 'learning_goal'],
          description: 'Type of goal'
        },
        target_value: {
          type: 'number',
          description: 'Target numeric value (e.g., 100000 for income goal)'
        },
        unit: {
          type: 'string',
          description: 'Unit of measurement (e.g., INR, hours, tasks)'
        },
        target_date: {
          type: 'string',
          description: 'Target completion date (YYYY-MM-DD)'
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'once'],
          description: 'Frequency for habit goals'
        },
        linked_income_source: {
          type: 'string',
          description: 'Income source this goal is linked to (for income goals)'
        },
        expected_roi: {
          type: 'string',
          description: 'Expected return on investment or benefit'
        }
      },
      required: ['title', 'goal_type']
    }
  },
  {
    name: 'log_goal_progress',
    description: 'Log progress on a goal or habit. Use when user reports progress or completing a habit.',
    input_schema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'ID of the goal to update'
        },
        goal_title: {
          type: 'string',
          description: 'Title of the goal (if ID not known)'
        },
        progress_value: {
          type: 'number',
          description: 'Progress amount to add'
        },
        notes: {
          type: 'string',
          description: 'Notes about this progress'
        }
      },
      required: ['progress_value']
    }
  },
  {
    name: 'get_my_goals',
    description: 'Get user goals with status and progress. Use when user asks about their goals.',
    input_schema: {
      type: 'object',
      properties: {
        goal_type: {
          type: 'string',
          description: 'Filter by goal type (optional)'
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'paused'],
          description: 'Filter by status (optional)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_daily_habits_status',
    description: 'Get status of daily habits for today (completed/pending). Use for daily check-ins.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ============================================
  // PRODUCTIVITY & TIME MANAGEMENT TOOLS
  // ============================================
  {
    name: 'create_protected_time_block',
    description: 'Create a protected time block for focused work (study, deep work, etc.). Use when user wants to protect time for important activities.',
    input_schema: {
      type: 'object',
      properties: {
        block_name: {
          type: 'string',
          description: 'Name of the time block (e.g., "Study Time", "Deep Work")'
        },
        purpose: {
          type: 'string',
          description: 'Purpose of this time block'
        },
        start_time: {
          type: 'string',
          description: 'Start time in HH:MM format (24h)'
        },
        end_time: {
          type: 'string',
          description: 'End time in HH:MM format (24h)'
        },
        days_of_week: {
          type: 'string',
          description: 'Comma-separated days: mon,tue,wed,thu,fri,sat,sun'
        },
        expected_roi: {
          type: 'string',
          description: 'Expected benefit of this time block'
        }
      },
      required: ['block_name', 'start_time', 'end_time']
    }
  },
  {
    name: 'get_daily_schedule',
    description: 'Get optimized daily schedule with prioritized tasks. Returns money-making tasks first, then time-sensitive, then others.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date for schedule (YYYY-MM-DD), defaults to today'
        }
      },
      required: []
    }
  },
  {
    name: 'get_my_priorities',
    description: 'Get prioritized task list based on money impact and time efficiency. Use when user asks what to do next.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of tasks to return (default 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'add_prioritized_task',
    description: 'Add a task with priority scoring based on money impact and deadline.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title'
        },
        task_type: {
          type: 'string',
          enum: ['income', 'deadline', 'maintenance', 'growth', 'personal'],
          description: 'Type of task for priority calculation'
        },
        money_impact: {
          type: 'number',
          description: 'Potential money impact in INR'
        },
        time_required_minutes: {
          type: 'number',
          description: 'Estimated time to complete in minutes'
        },
        deadline: {
          type: 'string',
          description: 'Deadline if any (YYYY-MM-DD HH:MM)'
        }
      },
      required: ['title', 'task_type']
    }
  },
  // ============================================
  // INCOME TRACKING TOOLS
  // ============================================
  {
    name: 'log_income',
    description: 'Log income earned from a source. Use when user mentions earning money.',
    input_schema: {
      type: 'object',
      properties: {
        source_name: {
          type: 'string',
          description: 'Name of income source (e.g., "Freelance Project", "YouTube")'
        },
        source_type: {
          type: 'string',
          enum: ['freelance', 'job', 'business', 'investment', 'side_hustle', 'passive', 'other'],
          description: 'Type of income source'
        },
        amount: {
          type: 'number',
          description: 'Amount earned in INR'
        },
        time_spent_hours: {
          type: 'number',
          description: 'Hours spent earning this (for hourly rate calculation)'
        },
        notes: {
          type: 'string',
          description: 'Additional notes'
        }
      },
      required: ['source_name', 'amount']
    }
  },
  {
    name: 'get_income_sources',
    description: 'Get list of income sources with earnings and hourly rates. Use for financial analysis.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'log_time_saved',
    description: 'Log when time is saved through optimization. Track efficiency wins.',
    input_schema: {
      type: 'object',
      properties: {
        action_type: {
          type: 'string',
          description: 'Type of action that saved time'
        },
        description: {
          type: 'string',
          description: 'What was done to save time'
        },
        time_saved_minutes: {
          type: 'number',
          description: 'Minutes saved'
        }
      },
      required: ['action_type', 'time_saved_minutes']
    }
  },
  // ============================================
  // WELLBEING TRACKING TOOLS
  // ============================================
  {
    name: 'log_mood',
    description: 'Log current mood. Use when user shares how they are feeling.',
    input_schema: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          enum: ['great', 'good', 'okay', 'stressed', 'tired', 'anxious', 'sad', 'motivated', 'focused'],
          description: 'Current mood'
        },
        notes: {
          type: 'string',
          description: 'Additional context about mood'
        }
      },
      required: ['mood']
    }
  },
  {
    name: 'log_sleep',
    description: 'Log sleep hours. Use when user mentions how much they slept.',
    input_schema: {
      type: 'object',
      properties: {
        hours: {
          type: 'number',
          description: 'Hours of sleep'
        },
        quality: {
          type: 'string',
          enum: ['great', 'good', 'okay', 'poor', 'terrible'],
          description: 'Sleep quality'
        },
        notes: {
          type: 'string',
          description: 'Additional notes'
        }
      },
      required: ['hours']
    }
  },
  {
    name: 'log_exercise',
    description: 'Log exercise activity. Use when user mentions working out or physical activity.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of exercise (e.g., running, gym, yoga)'
        },
        duration_minutes: {
          type: 'number',
          description: 'Duration in minutes'
        },
        notes: {
          type: 'string',
          description: 'Additional notes'
        }
      },
      required: ['type', 'duration_minutes']
    }
  },
  {
    name: 'get_wellbeing_summary',
    description: 'Get wellbeing summary including mood, sleep, and exercise patterns.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to summarize (default 7)'
        }
      },
      required: []
    }
  }
];

// Tool execution functions
async function executeSearchWeb(userId, args) {
  const { query } = args;
  const result = await searchWeb(query);

  if (result.success && result.results.length > 0) {
    // Store search in database
    const searchId = uuidv4();
    await client.execute({
      sql: 'INSERT INTO searches (id, user_id, query, results) VALUES (?, ?, ?, ?)',
      args: [searchId, userId, query, JSON.stringify(result.results)]
    });

    // Store embedding for semantic search later
    const embedding = await generateEmbedding(query);
    await upsertVector(`search_${searchId}`, embedding, {
      userId,
      searchId,
      type: 'search',
      query,
    });

    return {
      success: true,
      searchId,
      results: result.results.slice(0, 5).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content?.substring(0, 500) || r.description || ''
      }))
    };
  }

  return { success: false, error: result.error || 'No results found' };
}

async function executeSaveIdea(userId, args) {
  const { title, content, type = 'note' } = args;
  const ideaId = uuidv4();

  await client.execute({
    sql: 'INSERT INTO ideas (id, user_id, title, content, type) VALUES (?, ?, ?, ?, ?)',
    args: [ideaId, userId, title, content, type]
  });

  // Store embedding
  const embedding = await generateEmbedding(`${title} ${content}`);
  await upsertVector(`idea_${ideaId}`, embedding, {
    userId,
    ideaId,
    type: 'idea',
    title,
  });

  return { success: true, ideaId, message: `Saved idea: "${title}"` };
}

async function executeSaveTask(userId, args) {
  const { title, description = '' } = args;
  const taskId = uuidv4();

  await client.execute({
    sql: 'INSERT INTO tasks (id, user_id, title, description) VALUES (?, ?, ?, ?)',
    args: [taskId, userId, title, description]
  });

  return { success: true, taskId, message: `Created task: "${title}"` };
}

async function executeSetReminder(userId, args) {
  const { reminder_text, time_expression } = args;

  // If no time provided, return a message asking for time
  if (!time_expression) {
    return {
      success: false,
      needsTime: true,
      message: `When would you like me to remind you to "${reminder_text}"? (e.g., "tomorrow at 10am", "in 2 hours", "next Monday at 9am")`
    };
  }

  // Parse the time expression
  const timeData = parseTimeExpression(time_expression);

  if (!timeData || !timeData.time) {
    return {
      success: false,
      needsTime: true,
      message: `I couldn't understand "${time_expression}". Please specify when you'd like to be reminded (e.g., "tomorrow at 10am", "in 2 hours")`
    };
  }

  // Create a task for the reminder
  const taskId = uuidv4();
  await client.execute({
    sql: 'INSERT INTO tasks (id, user_id, title, description) VALUES (?, ?, ?, ?)',
    args: [taskId, userId, reminder_text, `Reminder created from: ${time_expression}`]
  });

  // Create the reminder
  const reminderId = uuidv4();
  await client.execute({
    sql: 'INSERT INTO reminders (id, user_id, task_id, scheduled_time, reminder_type) VALUES (?, ?, ?, ?, ?)',
    args: [reminderId, userId, taskId, timeData.time, 'popup']
  });

  return {
    success: true,
    reminderId,
    taskId,
    scheduledTime: timeData.time,
    description: timeData.description,
    message: `Reminder set for ${timeData.description}: "${reminder_text}"`
  };
}

async function executeSendEmail(userId, args) {
  const { to, subject, body } = args;

  try {
    const result = await sendEmail(to, subject, body);

    if (result.success) {
      // Log the email
      await client.execute({
        sql: 'INSERT INTO emails (id, user_id, from_address, to_address, subject, body) VALUES (?, ?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, 'me', to, subject, body]
      });

      return { success: true, message: `Email sent to ${to}` };
    }

    return { success: false, error: result.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeReadEmails(_userId, args) {
  const { count = 5 } = args;

  try {
    const result = await listEmails(count);

    if (result.success) {
      return {
        success: true,
        emails: result.emails.map(e => ({
          from: e.from,
          subject: e.subject,
          snippet: e.snippet,
          date: e.date
        }))
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeScrapeUrl(_userId, args) {
  const { url } = args;
  const result = await scrapeUrl(url);

  if (result.success) {
    return {
      success: true,
      title: result.data?.metadata?.title || 'Unknown',
      content: result.data?.content?.substring(0, 2000) || result.data?.markdown?.substring(0, 2000) || ''
    };
  }

  return { success: false, error: result.error };
}

async function executePostToLinkedIn(userId, args) {
  console.log('📱 LINKEDIN: Posting content...');
  const { content, article_url, article_title, visibility = 'PUBLIC' } = args;

  try {
    // Check rate limit first
    const rateLimit = getRateLimitStatus();
    if (rateLimit.remaining <= 0) {
      return {
        success: false,
        rateLimited: true,
        message: `Rate limit exceeded. You can post again in ${rateLimit.resetIn} hours.`
      };
    }

    // Get stored credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token, person_urn FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return {
        success: false,
        needsAuth: true,
        message: 'LinkedIn not connected. Please connect your LinkedIn account first by visiting /api/linkedin/auth'
      };
    }

    const { access_token, person_urn } = credResult.rows[0];
    const postVisibility = visibility === 'CONNECTIONS' ? LinkedInVisibility.CONNECTIONS : LinkedInVisibility.PUBLIC;

    let result;
    if (article_url) {
      result = await createArticlePost(access_token, person_urn, content, article_url, article_title || 'Shared Article', '', postVisibility);
    } else {
      result = await createTextPost(access_token, person_urn, content, postVisibility);
    }

    if (result.success) {
      // Log the post
      await client.execute({
        sql: 'INSERT INTO linkedin_posts (id, user_id, content, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, content, result.postId, new Date().toISOString()]
      });

      return {
        success: true,
        postId: result.postId,
        message: `Successfully posted to LinkedIn! (${result.remainingRequests} requests remaining today)`,
        visibility: visibility,
        remainingRequests: result.remainingRequests
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('LinkedIn post error:', error);
    return { success: false, error: error.message };
  }
}

async function executeCheckLinkedInStatus(userId) {
  console.log('📱 LINKEDIN: Checking status...');
  try {
    // Check rate limit
    const rateLimit = getRateLimitStatus();

    // Check if user has LinkedIn connected
    const credResult = await client.execute({
      sql: 'SELECT person_urn, profile_name, expires_at FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return {
        success: true,
        connected: false,
        message: 'LinkedIn not connected. Visit /api/linkedin/auth to connect your account.',
        rateLimit
      };
    }

    const credential = credResult.rows[0];
    const isExpired = new Date(credential.expires_at) < new Date();

    // Get recent post count
    const postResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM linkedin_posts WHERE user_id = ? AND created_at > datetime("now", "-24 hours")',
      args: [userId]
    });

    return {
      success: true,
      connected: !isExpired,
      profileName: credential.profile_name,
      expired: isExpired,
      postsLast24h: postResult.rows[0]?.count || 0,
      rateLimit: {
        used: rateLimit.used,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        resetInHours: rateLimit.resetIn
      },
      message: isExpired
        ? 'LinkedIn token expired. Please reconnect your account.'
        : `LinkedIn connected as ${credential.profile_name}. ${rateLimit.remaining} API requests remaining today.`
    };
  } catch (error) {
    console.error('LinkedIn status error:', error);
    return { success: false, error: error.message };
  }
}

// Image generation execution function
async function executeGenerateImage(_userId, args) {
  console.log('🎨 IMAGE: Generating image...');
  const { prompt, size = '1024x1024', style = 'vivid', quality = 'standard' } = args;

  try {
    const result = await generateImage(prompt, size, style, quality);
    if (result.success) {
      return {
        success: true,
        imageUrl: result.imageUrl,
        revisedPrompt: result.revisedPrompt,
        message: 'Image generated successfully!'
      };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Image generation error:', error);
    return { success: false, error: error.message };
  }
}

// LinkedIn post with AI-generated image
async function executePostToLinkedInWithImage(userId, args) {
  console.log('📱🎨 LINKEDIN+IMAGE: Creating post with generated image...');
  const { content, image_prompt, visibility = 'PUBLIC' } = args;

  try {
    // Step 1: Check LinkedIn credentials
    const credResult = await client.execute({
      sql: 'SELECT access_token, person_urn FROM linkedin_credentials WHERE user_id = ?',
      args: [userId]
    });

    if (credResult.rows.length === 0) {
      return {
        success: false,
        error: 'LinkedIn not connected. Please connect your LinkedIn account first.'
      };
    }

    const { access_token, person_urn } = credResult.rows[0];

    // Step 2: Generate the image
    console.log('🎨 Step 1: Generating image...');
    const imageResult = await generateImageBuffer(image_prompt, {
      size: '1024x1024',
      style: 'vivid',
      quality: 'standard'
    });

    if (!imageResult.success) {
      return {
        success: false,
        error: `Image generation failed: ${imageResult.error}`
      };
    }

    // Step 3: Upload image to LinkedIn
    console.log('📤 Step 2: Uploading image to LinkedIn...');
    const uploadResult = await uploadImage(access_token, person_urn, imageResult.buffer, 'generated-image.png');

    if (!uploadResult.success) {
      return {
        success: false,
        error: `Image upload failed: ${uploadResult.error}`
      };
    }

    // Step 4: Create the post with the image
    console.log('📝 Step 3: Creating LinkedIn post with image...');
    const postVisibility = visibility === 'CONNECTIONS' ? LinkedInVisibility.CONNECTIONS : LinkedInVisibility.PUBLIC;
    const postResult = await createImagePost(access_token, person_urn, content, uploadResult.asset, postVisibility);

    if (postResult.success) {
      // Log the post to database
      await client.execute({
        sql: 'INSERT INTO linkedin_posts (id, user_id, content, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [uuidv4(), userId, content, postResult.postId, new Date().toISOString()]
      });

      return {
        success: true,
        postId: postResult.postId,
        message: `Successfully posted to LinkedIn with AI-generated image! (${postResult.remainingRequests} requests remaining today)`,
        imagePromptUsed: imageResult.revisedPrompt || image_prompt
      };
    }

    return { success: false, error: postResult.error };
  } catch (error) {
    console.error('LinkedIn image post error:', error);
    return { success: false, error: error.message };
  }
}

// Google Sheets execution functions
async function executeCreateSpreadsheet(_userId, args) {
  console.log('📊 SHEETS: Creating spreadsheet...');
  const { title, sheet_names } = args;
  return await createSpreadsheet(title, sheet_names || ['Sheet1']);
}

async function executeReadSpreadsheet(_userId, args) {
  console.log('📊 SHEETS: Reading spreadsheet...');
  const { spreadsheet_id, range = 'Sheet1!A1:Z100' } = args;
  return await readRange(spreadsheet_id, range);
}

async function executeWriteSpreadsheet(_userId, args) {
  console.log('📊 SHEETS: Writing to spreadsheet...');
  const { spreadsheet_id, range, values } = args;
  return await writeRange(spreadsheet_id, range, values);
}

async function executeAppendToSpreadsheet(_userId, args) {
  console.log('📊 SHEETS: Appending to spreadsheet...');
  const { spreadsheet_id, range, values } = args;
  return await appendRows(spreadsheet_id, range, values);
}

async function executeDeleteSpreadsheetData(_userId, args) {
  console.log('📊 SHEETS: Deleting spreadsheet data...');
  const { spreadsheet_id, action, range, sheet_id, start_row, end_row } = args;

  switch (action) {
    case 'clear_range':
      if (!range) return { success: false, error: 'Range is required for clear_range action' };
      return await clearRange(spreadsheet_id, range);
    case 'delete_rows':
      if (sheet_id === undefined || start_row === undefined || end_row === undefined) {
        return { success: false, error: 'sheet_id, start_row, and end_row are required for delete_rows action' };
      }
      return await deleteRows(spreadsheet_id, sheet_id, start_row, end_row);
    case 'delete_sheet':
      if (sheet_id === undefined) return { success: false, error: 'sheet_id is required for delete_sheet action' };
      return await deleteSheet(spreadsheet_id, sheet_id);
    case 'delete_spreadsheet':
      return await deleteSpreadsheet(spreadsheet_id);
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

async function executeListSpreadsheets(_userId, args) {
  console.log('📊 SHEETS: Listing spreadsheets...');
  const { limit = 10 } = args;
  return await listSpreadsheets(limit);
}

async function executeSummarizeSpreadsheet(_userId, args) {
  console.log('📊 SHEETS: Summarizing spreadsheet...');
  const { spreadsheet_id } = args;
  return await getSpreadsheetSummary(spreadsheet_id);
}

async function executeAddSheet(_userId, args) {
  console.log('📊 SHEETS: Adding new sheet...');
  const { spreadsheet_id, sheet_title } = args;
  return await addSheet(spreadsheet_id, sheet_title);
}

async function executeSearchViralContent(_userId, args) {
  console.log('🔥 VIRAL: Searching for viral content...');
  const { topic, platform = 'general' } = args;

  // Build search queries for viral/trending content
  const queries = [
    `${topic} viral trending today ${new Date().getFullYear()}`,
    `${topic} most popular news today`,
    `${topic} trending tech news today`
  ];

  if (platform === 'hackernews') {
    queries.push(`site:news.ycombinator.com ${topic} trending`);
  } else if (platform === 'reddit') {
    queries.push(`site:reddit.com ${topic} viral trending`);
  }

  let allResults = [];

  for (const query of queries.slice(0, 2)) {
    const result = await searchWeb(query);
    if (result.success && result.results) {
      allResults.push(...result.results);
    }
  }

  // Remove duplicates based on URL
  const uniqueResults = allResults.filter((item, index, self) =>
    index === self.findIndex(t => t.url === item.url)
  ).slice(0, 10);

  if (uniqueResults.length > 0) {
    return {
      success: true,
      topic,
      results: uniqueResults.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.substring(0, 300) || r.description || ''
      }))
    };
  }

  return { success: false, error: 'No viral content found for this topic' };
}

// ============================================
// PERSONALIZATION & PROFILE EXECUTION FUNCTIONS
// ============================================

async function executeUpdateMyProfile(userId, args) {
  console.log('👤 PROFILE: Updating profile...');
  const { field, value } = args;
  try {
    const result = await updateProfile(userId, { [field]: value });
    return {
      success: true,
      message: `Profile updated: ${field} = ${value}`,
      profile: result
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeAddContact(userId, args) {
  console.log('👥 CONTACTS: Adding contact...');
  const { name, relationship, phone, email, birthday, notes, importance } = args;
  try {
    const result = await addOrUpdateContact(userId, {
      name,
      relationship,
      phone,
      email,
      birthday,
      notes,
      importance: importance || 3
    });
    return {
      success: true,
      contactId: result.contactId,
      message: `Added/updated contact: ${name} (${relationship})`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetMyContacts(userId, args) {
  console.log('👥 CONTACTS: Getting contacts...');
  const { relationship } = args;
  try {
    const contacts = await getContacts(userId, relationship);
    return {
      success: true,
      contacts,
      count: contacts.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// GOAL TRACKING EXECUTION FUNCTIONS
// ============================================

async function executeCreateGoal(userId, args) {
  console.log('🎯 GOALS: Creating goal...');
  const { title, description, goal_type, target_value, unit, target_date, frequency, linked_income_source, expected_roi } = args;
  try {
    const result = await createGoal(userId, {
      title,
      description,
      goal_type,
      target_value,
      unit,
      target_date,
      frequency,
      linked_income_source,
      expected_roi
    });
    return {
      success: true,
      goalId: result.goalId,
      message: `Created goal: "${title}" (${goal_type})`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeLogGoalProgress(userId, args) {
  console.log('📈 GOALS: Logging progress...');
  const { goal_id, goal_title, progress_value, notes } = args;
  try {
    // If goal_title is provided but not goal_id, find the goal
    let goalId = goal_id;
    if (!goalId && goal_title) {
      const goals = await getGoals(userId);
      const matchingGoal = goals.find(g => g.title.toLowerCase().includes(goal_title.toLowerCase()));
      if (matchingGoal) {
        goalId = matchingGoal.id;
      } else {
        return { success: false, error: `Could not find goal matching "${goal_title}"` };
      }
    }

    if (!goalId) {
      return { success: false, error: 'Please specify which goal to update' };
    }

    const result = await logProgress(goalId, userId, progress_value, notes);
    return {
      success: true,
      message: result.message || `Progress logged: +${progress_value}`,
      streakUpdated: result.streakUpdated,
      newStreak: result.newStreak
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetMyGoals(userId, args) {
  console.log('🎯 GOALS: Getting goals...');
  const { goal_type, status } = args;
  try {
    const goals = await getGoals(userId, goal_type, status);
    const summary = await getGoalsSummary(userId);
    return {
      success: true,
      goals,
      summary,
      count: goals.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetDailyHabitsStatus(userId) {
  console.log('📋 HABITS: Getting daily habits status...');
  try {
    const habits = await getDailyHabitsStatus(userId);
    const completed = habits.filter(h => h.completed_today).length;
    const total = habits.length;
    return {
      success: true,
      habits,
      completed,
      total,
      message: `Daily habits: ${completed}/${total} completed today`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// PRODUCTIVITY & TIME MANAGEMENT EXECUTION FUNCTIONS
// ============================================

async function executeCreateProtectedTimeBlock(userId, args) {
  console.log('🛡️ TIME: Creating protected time block...');
  const { block_name, purpose, start_time, end_time, days_of_week, expected_roi } = args;
  try {
    const result = await createProtectedTimeBlock(userId, {
      block_name,
      purpose,
      start_time,
      end_time,
      days_of_week: days_of_week || 'mon,tue,wed,thu,fri',
      expected_roi
    });
    return {
      success: true,
      blockId: result.blockId,
      message: `Protected time block created: "${block_name}" (${start_time} - ${end_time})`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetDailySchedule(userId, args) {
  console.log('📅 SCHEDULE: Getting optimized daily schedule...');
  const { date } = args;
  try {
    const schedule = await generateOptimizedSchedule(userId, date);
    return {
      success: true,
      schedule,
      message: `Here's your optimized schedule for ${date || 'today'}`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetMyPriorities(userId, args) {
  console.log('🔝 PRIORITIES: Getting prioritized tasks...');
  const { limit = 10 } = args;
  try {
    const tasks = await getPrioritizedTasks(userId, limit);
    return {
      success: true,
      tasks,
      count: tasks.length,
      message: `Here are your top ${tasks.length} priorities based on money impact and time efficiency`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeAddPrioritizedTask(userId, args) {
  console.log('➕ TASK: Adding prioritized task...');
  const { title, task_type, money_impact, time_required_minutes, deadline } = args;
  try {
    const result = await addPrioritizedTask(userId, {
      title,
      task_type,
      money_impact: money_impact || 0,
      time_required_minutes: time_required_minutes || 60,
      deadline
    });
    return {
      success: true,
      taskId: result.taskId,
      priorityScore: result.priorityScore,
      message: `Task added with priority score: ${result.priorityScore}/100`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// INCOME TRACKING EXECUTION FUNCTIONS
// ============================================

async function executeLogIncome(userId, args) {
  console.log('💰 INCOME: Logging income...');
  const { source_name, source_type, amount, time_spent_hours, notes } = args;
  try {
    const result = await recordIncomeSource(userId, {
      source_name,
      source_type: source_type || 'other',
      amount,
      time_spent_hours,
      notes
    });

    // Update daily metrics
    await updateDailyMetrics(userId, { money_earned: amount });

    return {
      success: true,
      message: `Logged income: ₹${amount} from ${source_name}`,
      hourlyRate: result.hourlyRate ? `₹${result.hourlyRate}/hour` : null,
      totalFromSource: result.totalEarned
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetIncomeSources(userId) {
  console.log('💰 INCOME: Getting income sources...');
  try {
    const sources = await getIncomeSources(userId);
    const totalEarned = sources.reduce((sum, s) => sum + (s.total_earned || 0), 0);
    const bestHourlyRate = sources.reduce((max, s) => Math.max(max, s.hourly_rate || 0), 0);

    return {
      success: true,
      sources,
      summary: {
        total_sources: sources.length,
        total_earned: totalEarned,
        best_hourly_rate: bestHourlyRate
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeLogTimeSaved(userId, args) {
  console.log('⏱️ TIME: Logging time saved...');
  const { action_type, description, time_saved_minutes } = args;
  try {
    const result = await logTimeSaving(userId, action_type, description, time_saved_minutes);
    return {
      success: true,
      message: `Logged ${time_saved_minutes} minutes saved through ${action_type}`,
      total_saved_today: result.total_saved_today
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// WELLBEING TRACKING EXECUTION FUNCTIONS
// ============================================

async function executeLogMood(userId, args) {
  console.log('😊 WELLBEING: Logging mood...');
  const { mood, notes } = args;
  try {
    await recordWellbeingLog(userId, 'mood', mood, notes);

    // Provide contextual response based on mood
    let feedback = '';
    if (['stressed', 'anxious', 'sad', 'tired'].includes(mood)) {
      feedback = " Remember to take breaks and prioritize self-care. I'm here if you need to talk.";
    } else if (['great', 'motivated', 'focused'].includes(mood)) {
      feedback = " Great time to tackle high-priority tasks!";
    }

    return {
      success: true,
      message: `Mood logged: ${mood}${feedback}`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeLogSleep(userId, args) {
  console.log('😴 WELLBEING: Logging sleep...');
  const { hours, quality, notes } = args;
  try {
    await recordWellbeingLog(userId, 'sleep', hours, notes);
    if (quality) {
      await recordWellbeingLog(userId, 'sleep_quality', quality, null);
    }

    let feedback = '';
    if (hours < 6) {
      feedback = " You need more sleep! Aim for 7-8 hours tonight.";
    } else if (hours >= 7 && hours <= 8) {
      feedback = " Great sleep! You're well-rested.";
    } else if (hours > 9) {
      feedback = " You slept a lot. Make sure you're feeling refreshed.";
    }

    return {
      success: true,
      message: `Sleep logged: ${hours} hours${quality ? ` (${quality} quality)` : ''}${feedback}`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeLogExercise(userId, args) {
  console.log('🏃 WELLBEING: Logging exercise...');
  const { type, duration_minutes, notes } = args;
  try {
    const exerciseData = { type, duration: duration_minutes };
    await recordWellbeingLog(userId, 'exercise', JSON.stringify(exerciseData), notes);

    return {
      success: true,
      message: `Exercise logged: ${duration_minutes} minutes of ${type}! Keep it up!`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeGetWellbeingSummary(userId, args) {
  console.log('📊 WELLBEING: Getting summary...');
  const { days = 7 } = args;
  try {
    const [moodLogs, sleepLogs, exerciseLogs] = await Promise.all([
      getWellbeingLogs(userId, 'mood', days),
      getWellbeingLogs(userId, 'sleep', days),
      getWellbeingLogs(userId, 'exercise', days)
    ]);

    // Calculate averages and patterns
    const sleepValues = sleepLogs.map(l => l.numeric_value).filter(v => v !== null);
    const avgSleep = sleepValues.length > 0
      ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
      : null;

    // Count mood occurrences
    const moodCounts = {};
    moodLogs.forEach(l => {
      moodCounts[l.value] = (moodCounts[l.value] || 0) + 1;
    });

    return {
      success: true,
      summary: {
        period_days: days,
        mood: {
          total_logs: moodLogs.length,
          distribution: moodCounts
        },
        sleep: {
          average_hours: avgSleep,
          total_logs: sleepLogs.length
        },
        exercise: {
          total_sessions: exerciseLogs.length,
          days_exercised: new Set(exerciseLogs.map(l => l.logged_at?.split('T')[0])).size
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Execute a tool by name
async function executeTool(userId, toolName, args) {
  switch (toolName) {
    case 'search_web':
      return await executeSearchWeb(userId, args);
    case 'save_idea':
      return await executeSaveIdea(userId, args);
    case 'save_task':
      return await executeSaveTask(userId, args);
    case 'set_reminder':
      return await executeSetReminder(userId, args);
    case 'send_email':
      return await executeSendEmail(userId, args);
    case 'read_emails':
      return await executeReadEmails(userId, args);
    case 'scrape_url':
      return await executeScrapeUrl(userId, args);
    case 'post_to_linkedin':
      return await executePostToLinkedIn(userId, args);
    case 'check_linkedin_status':
      return await executeCheckLinkedInStatus(userId);
    case 'generate_image':
      return await executeGenerateImage(userId, args);
    case 'post_to_linkedin_with_image':
      return await executePostToLinkedInWithImage(userId, args);
    case 'search_viral_content':
      return await executeSearchViralContent(userId, args);
    // Google Sheets tools
    case 'create_spreadsheet':
      return await executeCreateSpreadsheet(userId, args);
    case 'read_spreadsheet':
      return await executeReadSpreadsheet(userId, args);
    case 'write_spreadsheet':
      return await executeWriteSpreadsheet(userId, args);
    case 'append_to_spreadsheet':
      return await executeAppendToSpreadsheet(userId, args);
    case 'delete_spreadsheet_data':
      return await executeDeleteSpreadsheetData(userId, args);
    case 'list_spreadsheets':
      return await executeListSpreadsheets(userId, args);
    case 'summarize_spreadsheet':
      return await executeSummarizeSpreadsheet(userId, args);
    case 'add_sheet':
      return await executeAddSheet(userId, args);
    // Personalization & Profile tools
    case 'update_my_profile':
      return await executeUpdateMyProfile(userId, args);
    case 'add_contact':
      return await executeAddContact(userId, args);
    case 'get_my_contacts':
      return await executeGetMyContacts(userId, args);
    // Goal tracking tools
    case 'create_goal':
      return await executeCreateGoal(userId, args);
    case 'log_goal_progress':
      return await executeLogGoalProgress(userId, args);
    case 'get_my_goals':
      return await executeGetMyGoals(userId, args);
    case 'get_daily_habits_status':
      return await executeGetDailyHabitsStatus(userId);
    // Productivity & Time management tools
    case 'create_protected_time_block':
      return await executeCreateProtectedTimeBlock(userId, args);
    case 'get_daily_schedule':
      return await executeGetDailySchedule(userId, args);
    case 'get_my_priorities':
      return await executeGetMyPriorities(userId, args);
    case 'add_prioritized_task':
      return await executeAddPrioritizedTask(userId, args);
    // Income tracking tools
    case 'log_income':
      return await executeLogIncome(userId, args);
    case 'get_income_sources':
      return await executeGetIncomeSources(userId);
    case 'log_time_saved':
      return await executeLogTimeSaved(userId, args);
    // Wellbeing tracking tools
    case 'log_mood':
      return await executeLogMood(userId, args);
    case 'log_sleep':
      return await executeLogSleep(userId, args);
    case 'log_exercise':
      return await executeLogExercise(userId, args);
    case 'get_wellbeing_summary':
      return await executeGetWellbeingSummary(userId, args);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// Main agent execution function
export async function executeAgentTask(userId, userMessage, context = '') {
  console.log('🤖 AGENT: Processing message:', userMessage.substring(0, 100));
  try {
    // Store execution record
    const executionId = uuidv4();
    await client.execute({
      sql: 'INSERT INTO agent_executions (id, user_id, execution_type, status) VALUES (?, ?, ?, ?)',
      args: [executionId, userId, 'tool_use', 'running']
    });

    // Get personalized context for this user
    let personalizedContext = '';
    try {
      const userContext = await getPersonalizedContext(userId);
      if (userContext) {
        personalizedContext = `
USER CONTEXT (Use this to personalize your responses):
${userContext.profile ? `- Name: ${userContext.profile.preferred_name || userContext.profile.name || 'User'}` : ''}
${userContext.profile?.timezone ? `- Timezone: ${userContext.profile.timezone}` : ''}
${userContext.profile?.work_start_time ? `- Work hours: ${userContext.profile.work_start_time} to ${userContext.profile.work_end_time}` : ''}
${userContext.profile?.financial_goal ? `- Financial goal: ${userContext.profile.financial_goal}` : ''}
${userContext.profile?.short_term_goals ? `- Short-term goals: ${userContext.profile.short_term_goals}` : ''}
${userContext.topIncomeSources?.length > 0 ? `- Top income sources: ${userContext.topIncomeSources.map(s => `${s.source_name} (₹${s.hourly_rate}/hr)`).join(', ')}` : ''}
${userContext.protectedTimeBlocks?.length > 0 ? `- Protected time blocks: ${userContext.protectedTimeBlocks.map(b => `${b.block_name} (${b.start_time}-${b.end_time})`).join(', ')}` : ''}
${userContext.isInProtectedTime ? '⚠️ USER IS CURRENTLY IN PROTECTED TIME - Only interrupt for urgent matters!' : ''}
${userContext.pendingGoals?.length > 0 ? `- Active goals: ${userContext.pendingGoals.slice(0, 3).map(g => g.title).join(', ')}` : ''}
${userContext.recentMood ? `- Recent mood: ${userContext.recentMood}` : ''}
`;
      }
    } catch (err) {
      console.log('Could not fetch personalized context:', err.message);
    }

    // Learn from this conversation
    learnFromConversation(userId, userMessage, '').catch(err =>
      console.log('Background learning error:', err.message)
    );

    // Current date/time context
    const now = new Date();
    const dateContext = `
CURRENT DATE & TIME:
- Date: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Time: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
- Year: ${now.getFullYear()}
- Timezone: Asia/Kolkata (IST)
`;

    const systemPrompt = `You are Shree AI, a highly personalized proactive life assistant. You deeply care about the user's success, wellbeing, and financial growth.

${dateContext}
${personalizedContext}

CORE PHILOSOPHY - MONEY-TIME OPTIMIZATION:
You are acutely aware that the user is working hard to maximize their income while maintaining work-life balance. Your primary goal is to help them:
1. PRIORITIZE high-ROI tasks (money earned per hour spent)
2. PROTECT their study/focus time blocks
3. BATCH similar tasks to save time
4. IDENTIFY time-wasters and suggest optimizations
5. CELEBRATE wins and track progress

When the user mentions tasks or asks what to do:
- Always consider money impact and time required
- Suggest the highest priority task first
- Remind them of protected time blocks if relevant
- Offer to log time saved when you help them be more efficient

TOOL CATEGORIES:

Research & Content:
- search_web: Search the internet for information
- save_idea: Save ideas, notes, or research findings
- scrape_url: Extract content from a specific URL
- search_viral_content: Find trending/viral content

Tasks & Reminders:
- save_task: Create tasks or to-do items
- set_reminder: Set reminders for specific times
- add_prioritized_task: Add task with money impact and priority scoring
- get_my_priorities: Get prioritized task list based on money impact
- get_daily_schedule: Get optimized daily schedule

Communication:
- send_email: Send emails on the user's behalf
- read_emails: Read recent emails from the user's inbox

Social Media:
- post_to_linkedin: Post text content to LinkedIn
- post_to_linkedin_with_image: Post to LinkedIn with AI-generated image
- check_linkedin_status: Check LinkedIn connection and rate limits
- generate_image: Generate AI images using DALL-E 3

Google Sheets:
- create_spreadsheet, read_spreadsheet, write_spreadsheet, append_to_spreadsheet
- delete_spreadsheet_data, list_spreadsheets, summarize_spreadsheet, add_sheet

Profile & Personalization:
- update_my_profile: Update user preferences (name, schedule, goals, etc.)
- add_contact: Add/update a contact the AI should remember
- get_my_contacts: Get list of user's contacts

Goal Tracking:
- create_goal: Create a new goal (income, learning, habit, etc.)
- log_goal_progress: Log progress on a goal or habit
- get_my_goals: Get user goals with status and progress
- get_daily_habits_status: Get status of daily habits

Productivity & Time:
- create_protected_time_block: Create protected time for focus work
- log_time_saved: Log when time is saved through optimization

Income Tracking:
- log_income: Log income earned from a source
- get_income_sources: Get list of income sources with hourly rates

Wellbeing:
- log_mood: Log current mood
- log_sleep: Log sleep hours
- log_exercise: Log exercise activity
- get_wellbeing_summary: Get wellbeing patterns and insights

BEHAVIORAL GUIDELINES:

1. When user mentions earning money → Use log_income to track it
2. When user mentions a goal or commitment → Use create_goal
3. When user shares feelings → Use log_mood and offer support
4. When user mentions sleep/exercise → Log it for tracking
5. When user mentions someone important → Consider add_contact
6. When user shares preferences → Use update_my_profile
7. When user completes a task → Celebrate and suggest what's next
8. When user seems stressed → Show empathy, suggest breaks
9. When asking "what should I do?" → Use get_my_priorities or get_daily_schedule

PROACTIVE SUGGESTIONS:
- If you notice the user is working during their protected time, gently remind them
- Suggest batching similar tasks when you see patterns
- Celebrate streaks and progress on goals
- Remind about upcoming deadlines naturally in conversation

CRITICAL RULES - ALWAYS FOLLOW:

1. WEB SEARCH IS MANDATORY when user asks about:
   - "Latest", "recent", "current", "2024", "2025" anything
   - News, trends, research, updates
   - Any information that could have changed after your training
   - Facts you're not 100% sure about
   - ALWAYS use search_web tool for such queries - NEVER rely on training data alone!

2. RESPONSE FORMAT - Keep it simple:
   - NO markdown headers (no # or ##)
   - NO bullet points with asterisks
   - NO hashtags
   - Write in simple conversational style like WhatsApp chat
   - Use line breaks for separation
   - Emojis are okay but sparingly
   - Be direct and natural, like talking to a friend

3. DATE AWARENESS:
   - Always be aware of the current date provided above
   - Reference dates correctly (today, yesterday, next week etc.)
   - Never give outdated information - search if unsure

4. CONVERSATION CONTINUITY:
   - Each conversation is a new session
   - Previous context is provided if available
   - Ask for clarification if something is unclear from previous context

Always be supportive, personal, and focused on helping the user achieve their financial and personal goals while maintaining their wellbeing.`;

    const messages = [];

    if (context) {
      messages.push({
        role: 'user',
        content: `Previous context:\n${context}`
      });
      messages.push({
        role: 'assistant',
        content: 'I understand the context. How can I help you?'
      });
    }

    messages.push({
      role: 'user',
      content: userMessage
    });

    // Call Claude with tools
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools,
      messages: messages
    });

    // Process tool calls iteratively
    let toolResults = [];
    let iterations = 0;
    const maxIterations = 5;

    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
      iterations++;

      // Find tool use blocks
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`🔧 AGENT: Executing tool: ${toolUse.name}`, JSON.stringify(toolUse.input));

        const toolResult = await executeTool(userId, toolUse.name, toolUse.input);
        toolResults.push({
          tool: toolUse.name,
          input: toolUse.input,
          result: toolResult
        });

        // Add tool result to messages
        messages.push({
          role: 'assistant',
          content: response.content
        });
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult)
          }]
        });
      }

      // Continue the conversation
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools,
        messages: messages
      });
    }

    // Extract the final text response
    let finalResponse = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        finalResponse += block.text;
      }
    }

    // Update execution record
    await client.execute({
      sql: 'UPDATE agent_executions SET status = ?, result = ?, steps = ? WHERE id = ?',
      args: ['completed', finalResponse, JSON.stringify(toolResults), executionId]
    });

    // Store conversation embedding
    await storeConversationEmbedding(userId, executionId, `${userMessage} ${finalResponse}`, {
      executionId,
      toolsUsed: toolResults.map(t => t.tool),
    });

    return {
      success: true,
      result: finalResponse,
      toolResults,
      executionId,
    };
  } catch (error) {
    console.error('Agent execution error:', error);
    return {
      success: false,
      error: error.message,
      result: `I encountered an error: ${error.message}. Please try again.`
    };
  }
}

// Legacy function for compatibility
export async function createAgent(userId) {
  return {
    invoke: async (input) => {
      const result = await executeAgentTask(userId, input.input);
      return { output: result.result };
    }
  };
}
