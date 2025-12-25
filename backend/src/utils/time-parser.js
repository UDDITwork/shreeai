import * as chrono from 'chrono-node';

export function parseTimeExpression(text) {
  const results = chrono.parse(text, new Date());
  
  if (results.length > 0) {
    const date = results[0].start.date();
    return {
      time: date.toISOString(),
      description: results[0].text,
    };
  }

  // Fallback: try to parse common patterns
  const lowerText = text.toLowerCase();
  const now = new Date();
  
  // Tomorrow
  if (lowerText.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Extract time if mentioned
    const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3]?.toLowerCase();
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      tomorrow.setHours(hours, minutes, 0, 0);
    } else {
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
    }
    
    return {
      time: tomorrow.toISOString(),
      description: 'tomorrow',
    };
  }

  // Today with time
  const todayTimeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
  if (todayTimeMatch) {
    let hours = parseInt(todayTimeMatch[1]);
    const minutes = todayTimeMatch[2] ? parseInt(todayTimeMatch[2]) : 0;
    const period = todayTimeMatch[3]?.toLowerCase();
    
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    const today = new Date(now);
    today.setHours(hours, minutes, 0, 0);
    
    // If time has passed, assume tomorrow
    if (today < now) {
      today.setDate(today.getDate() + 1);
    }
    
    return {
      time: today.toISOString(),
      description: `today at ${hours}:${minutes.toString().padStart(2, '0')}`,
    };
  }

  return null;
}

