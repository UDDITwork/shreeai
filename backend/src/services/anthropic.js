import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function analyzeMessage(message, context = '') {
  try {
    const systemPrompt = `You are an intelligent assistant that helps users manage ideas, tasks, and reminders. 
Analyze user messages to detect intent and extract information.

Possible intents:
- save: User wants to save information or ideas
- search: User wants to search the web for information
- remind: User wants to set a reminder
- postpone: User wants to postpone or delay something
- complete: User indicates a task is complete
- followup: User wants to send a follow-up email
- other: General conversation or unclear intent

Return a JSON object with:
{
  "intent": "detected_intent",
  "entities": {
    "time": "extracted time expression if any",
    "items": ["list of items mentioned"],
    "action": "specific action requested"
  },
  "confidence": 0.0-1.0
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: context ? `Context: ${context}\n\nUser message: ${message}` : message
        }
      ]
    });

    const content = response.content[0].text;
    
    // Try to parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // If JSON parsing fails, return structured response
    }

    return {
      intent: 'other',
      entities: {},
      confidence: 0.5,
      rawResponse: content
    };
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}

export async function processWithClaude(prompt, systemPrompt = '') {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}

export async function detectPostponement(message) {
  const postponementKeywords = [
    'not thinking about this',
    'later',
    'postpone',
    'not now',
    'maybe later',
    'remind me later',
    'skip',
    'ignore'
  ];

  const lowerMessage = message.toLowerCase();
  const hasKeyword = postponementKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );

  if (hasKeyword) {
    return { isPostponement: true, confidence: 0.8 };
  }

  // Use AI for more nuanced detection
  try {
    const result = await analyzeMessage(message);
    return {
      isPostponement: result.intent === 'postpone',
      confidence: result.confidence
    };
  } catch (error) {
    return { isPostponement: false, confidence: 0.5 };
  }
}

export async function extractTimeExpression(message) {
  try {
    const prompt = `Extract time expressions from this message and convert to ISO 8601 format. 
If no specific time is mentioned, return null.
Message: "${message}"
Return only a JSON object: {"time": "ISO8601 datetime or null", "description": "human readable time"}`;

    const response = await processWithClaude(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { time: null, description: null };
  } catch (error) {
    console.error('Time extraction error:', error);
    return { time: null, description: null };
  }
}

export { anthropic };

