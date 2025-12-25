import OpenAI from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate an image using DALL-E 3
 * @param {string} prompt - Description of the image to generate
 * @param {string} size - Image size: '1024x1024', '1792x1024', '1024x1792'
 * @param {string} style - 'vivid' or 'natural'
 * @param {string} quality - 'standard' or 'hd'
 * @returns {Promise<{success: boolean, imageUrl?: string, revisedPrompt?: string, error?: string}>}
 */
export async function generateImage(prompt, size = '1024x1024', style = 'vivid', quality = 'standard') {
  console.log('🎨 DALLE: Generating image...');
  console.log('   Prompt:', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: size,
      style: style,
      quality: quality,
      response_format: 'url'
    });

    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;

    console.log('✅ DALLE: Image generated successfully');
    console.log('   Revised prompt:', revisedPrompt?.substring(0, 100) + '...');

    return {
      success: true,
      imageUrl,
      revisedPrompt
    };
  } catch (error) {
    console.error('❌ DALLE error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Download an image from URL and return as buffer
 * @param {string} imageUrl - URL of the image to download
 * @returns {Promise<{success: boolean, buffer?: Buffer, error?: string}>}
 */
export async function downloadImage(imageUrl) {
  console.log('📥 Downloading image...');

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    console.log('✅ Image downloaded, size:', Math.round(response.data.length / 1024), 'KB');

    return {
      success: true,
      buffer: Buffer.from(response.data)
    };
  } catch (error) {
    console.error('❌ Image download error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate image and return as buffer (ready for LinkedIn upload)
 * @param {string} prompt - Description of the image to generate
 * @param {object} options - Generation options
 * @returns {Promise<{success: boolean, buffer?: Buffer, revisedPrompt?: string, error?: string}>}
 */
export async function generateImageBuffer(prompt, options = {}) {
  const { size = '1024x1024', style = 'vivid', quality = 'standard' } = options;

  // Generate image
  const generateResult = await generateImage(prompt, size, style, quality);
  if (!generateResult.success) {
    return generateResult;
  }

  // Download image
  const downloadResult = await downloadImage(generateResult.imageUrl);
  if (!downloadResult.success) {
    return downloadResult;
  }

  return {
    success: true,
    buffer: downloadResult.buffer,
    revisedPrompt: generateResult.revisedPrompt,
    imageUrl: generateResult.imageUrl
  };
}

/**
 * Suggest an image prompt based on post content
 * @param {string} postContent - The LinkedIn post content
 * @returns {string} - Suggested image prompt
 */
export function suggestImagePrompt(postContent) {
  // Create a professional image prompt based on the post content
  const basePrompt = `Professional, modern, minimalist illustration for a LinkedIn post about: ${postContent.substring(0, 200)}.
Style: Clean corporate design, abstract tech elements, professional color palette (blues, whites, subtle gradients).
No text or words in the image. High quality, suitable for business social media.`;

  return basePrompt;
}
