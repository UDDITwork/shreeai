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

    const systemPrompt = `You are an intelligent AI assistant that helps users manage ideas, tasks, reminders, research, social media, and Google Sheets.

You have access to these tools:
- search_web: Search the internet for information using Firecrawler
- save_idea: Save ideas, notes, or research findings
- save_task: Create tasks or to-do items
- set_reminder: Set reminders for specific times
- send_email: Send emails on the user's behalf
- read_emails: Read recent emails from the user's inbox
- scrape_url: Extract content from a specific URL
- post_to_linkedin: Post text content to LinkedIn (supports visibility: PUBLIC or CONNECTIONS)
- post_to_linkedin_with_image: Post to LinkedIn with AI-generated image (DALL-E 3)
- check_linkedin_status: Check if LinkedIn is connected and view rate limits
- generate_image: Generate AI images using DALL-E 3 (for any purpose)
- search_viral_content: Find trending/viral technical content

Google Sheets tools:
- create_spreadsheet: Create a new Google Spreadsheet
- read_spreadsheet: Read data from a spreadsheet (use A1 notation like "Sheet1!A1:D10")
- write_spreadsheet: Write/update data in a spreadsheet
- append_to_spreadsheet: Add new rows at the end of a sheet
- delete_spreadsheet_data: Clear cells, delete rows, sheets, or entire spreadsheet
- list_spreadsheets: List user's spreadsheets
- summarize_spreadsheet: Get AI-friendly summary of sheet structure and data
- add_sheet: Add a new sheet/tab to an existing spreadsheet

When the user asks to:
1. "Search for X" or "Find X" or "Look up X" → Use search_web tool
2. "Save this" or "Remember this" → Use save_idea tool
3. "Remind me" → Use set_reminder (ask for time if not provided)
4. "Email X" or "Send email" → Use send_email tool
5. "Check my emails" → Use read_emails tool
6. "Post on LinkedIn" or "Share on LinkedIn" → Use post_to_linkedin tool
7. "Find viral content" or "Trending content" → Use search_viral_content tool
8. "Check LinkedIn status" or before first LinkedIn post → Use check_linkedin_status

Google Sheets operations:
9. "Create a spreadsheet" or "Make a new sheet" → Use create_spreadsheet
10. "Read/show/get data from sheet" → Use read_spreadsheet (ask for spreadsheet ID if not provided)
11. "Update/write/add to sheet" → Use write_spreadsheet or append_to_spreadsheet
12. "Delete/clear/remove from sheet" → Use delete_spreadsheet_data
13. "Show my spreadsheets" or "List my sheets" → Use list_spreadsheets
14. "Summarize this spreadsheet" or "What's in this sheet?" → Use summarize_spreadsheet
15. "Add a new tab/sheet" → Use add_sheet

For Google Sheets workflow:
- When user provides a spreadsheet URL, extract the ID (the part between /d/ and /edit in the URL)
- Use A1 notation for ranges: "Sheet1!A1:D10", "A1:Z100", etc.
- For writing data, format as 2D array: [["Header1", "Header2"], ["Data1", "Data2"]]
- Always confirm what was written/modified after operations
- For summaries, analyze headers, data types, and provide insights

For LinkedIn posting workflow:
- ALWAYS check check_linkedin_status first to ensure the account is connected
- When user asks for viral/trending content, use search_viral_content first
- Present the content to the user
- If they want to post it, draft an engaging LinkedIn post
- For TEXT ONLY posts: Use post_to_linkedin
- For POSTS WITH IMAGE: Use post_to_linkedin_with_image with a creative image_prompt
- The post should be professional, engaging, include relevant hashtags
- Respect rate limits (150 posts/day max)

Image generation guidelines:
- For LinkedIn images, create professional, modern, visually appealing graphics
- Image prompts should describe: style (minimalist, corporate, tech), colors, composition
- Avoid text in images (DALL-E struggles with text)
- Good image prompts: "Modern abstract tech illustration showing interconnected nodes, blue gradient background, professional corporate style"
- Use generate_image tool for standalone image generation requests

LinkedIn visibility options:
- PUBLIC: Anyone on LinkedIn can see the post (default)
- CONNECTIONS: Only the user's connections can see the post

For search queries about startups, companies, etc:
- Use search_web to find the information
- Extract and format the data clearly (names, founders, headquarters, funding, etc.)
- Present results in a structured, readable format

Always be helpful and proactive. If a reminder doesn't have a time, ask when the user wants to be reminded.`;

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
