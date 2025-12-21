import { processWithClaude } from './anthropic.js';

export async function isJobRelated(emailContent) {
  try {
    const prompt = `Analyze this email and determine if it's job-related (job applications, interviews, offers, rejections, recruiter messages).

Email Subject: ${emailContent.subject || 'N/A'}
Email Body: ${emailContent.body || emailContent.text || 'N/A'}

Return only JSON: {"isJobRelated": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}`;

    const response = await processWithClaude(prompt);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result.isJobRelated === true;
      }
    } catch (e) {
      // Fallback to keyword matching
    }

    // Fallback keyword matching
    const jobKeywords = [
      'job', 'position', 'role', 'interview', 'application', 'resume', 'cv',
      'recruiter', 'hiring', 'offer', 'rejection', 'candidate', 'opportunity'
    ];

    const content = `${emailContent.subject} ${emailContent.body || emailContent.text}`.toLowerCase();
    return jobKeywords.some(keyword => content.includes(keyword));
  } catch (error) {
    console.error('Job filter error:', error);
    return false;
  }
}

