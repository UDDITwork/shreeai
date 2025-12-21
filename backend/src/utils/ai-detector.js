import { analyzeMessage } from '../services/anthropic.js';

export async function detectIntent(message, context = '') {
  try {
    const analysis = await analyzeMessage(message, context);
    return analysis;
  } catch (error) {
    console.error('Intent detection error:', error);
    // Fallback to simple keyword matching
    return fallbackIntentDetection(message);
  }
}

function fallbackIntentDetection(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('save') || lowerMessage.includes('remember')) {
    return { intent: 'save', confidence: 0.7 };
  }
  
  if (lowerMessage.includes('search') || lowerMessage.includes('find')) {
    return { intent: 'search', confidence: 0.7 };
  }
  
  if (lowerMessage.includes('remind') || lowerMessage.includes('reminder')) {
    return { intent: 'remind', confidence: 0.7 };
  }
  
  if (lowerMessage.includes('done') || lowerMessage.includes('complete') || lowerMessage.includes('finished')) {
    return { intent: 'complete', confidence: 0.7 };
  }
  
  return { intent: 'other', confidence: 0.5 };
}

