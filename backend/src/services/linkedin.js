import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2';

// Rate limiting tracking
const rateLimitState = {
  memberRequests: 0,
  lastReset: Date.now(),
  maxPerDay: 150 // LinkedIn limit: 150 requests per day per member
};

// Check and track rate limits
function checkRateLimit() {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  // Reset counter if 24 hours have passed
  if (now - rateLimitState.lastReset > dayInMs) {
    rateLimitState.memberRequests = 0;
    rateLimitState.lastReset = now;
  }

  if (rateLimitState.memberRequests >= rateLimitState.maxPerDay) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: dayInMs - (now - rateLimitState.lastReset)
    };
  }

  rateLimitState.memberRequests++;
  return {
    allowed: true,
    remaining: rateLimitState.maxPerDay - rateLimitState.memberRequests,
    resetIn: dayInMs - (now - rateLimitState.lastReset)
  };
}

// Visibility options enum
export const LinkedInVisibility = {
  PUBLIC: 'PUBLIC',           // Anyone on LinkedIn
  CONNECTIONS: 'CONNECTIONS'  // Only connections
};

// Get authorization URL for user to grant access
export function getAuthorizationUrl() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3001/api/linkedin/callback';
  const scope = 'openid profile w_member_social';
  const state = Math.random().toString(36).substring(7);

  const authUrl = `${LINKEDIN_AUTH_URL}/authorization?` +
    `response_type=code&` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scope)}&` +
    `state=${state}`;

  return { authUrl, state };
}

// Exchange authorization code for access token
export async function getAccessToken(code) {
  try {
    const response = await axios.post(
      `${LINKEDIN_AUTH_URL}/accessToken`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3001/api/linkedin/callback'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ LinkedIn access token obtained');
    return {
      success: true,
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in
    };
  } catch (error) {
    console.error('❌ LinkedIn token error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error_description || error.message
    };
  }
}

// Get user's LinkedIn profile (to get the person URN for posting)
export async function getProfile(accessToken) {
  try {
    const response = await axios.get(
      `${LINKEDIN_API_URL}/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    console.log('✅ LinkedIn profile retrieved');
    return {
      success: true,
      profile: response.data,
      personUrn: `urn:li:person:${response.data.sub}`
    };
  } catch (error) {
    console.error('❌ LinkedIn profile error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Create a text post on LinkedIn
export async function createTextPost(accessToken, personUrn, text, visibility = LinkedInVisibility.PUBLIC) {
  console.log('📝 LINKEDIN: Creating text post...');

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    console.warn('⚠️ LINKEDIN: Rate limit exceeded');
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    const response = await axios.post(
      `${LINKEDIN_API_URL}/ugcPosts`,
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    console.log('✅ LINKEDIN: Post created successfully');
    return {
      success: true,
      postId: response.headers['x-restli-id'] || response.data.id,
      message: 'Post published successfully!',
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN post error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Detect content type from filename
function getContentType(fileName) {
  const ext = fileName?.toLowerCase().split('.').pop();
  const contentTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return contentTypes[ext] || 'image/png';
}

// Upload image to LinkedIn (returns asset URN) - 3-step process per API docs
export async function uploadImage(accessToken, personUrn, imageBuffer, fileName = 'image.png') {
  console.log('📷 LINKEDIN: Uploading image:', fileName);

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    // Step 1: Register upload request
    console.log('📷 LINKEDIN: Step 1 - Registering upload...');
    const registerResponse = await axios.post(
      `${LINKEDIN_API_URL}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerResponse.data.value.asset;

    // Step 2: Upload the binary image
    console.log('📷 LINKEDIN: Step 2 - Uploading binary...');
    const contentType = getContentType(fileName);
    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': contentType
      }
    });

    // Step 3: Asset is now ready to be used in a post
    console.log('✅ LINKEDIN: Step 3 - Image uploaded, asset:', asset);
    return {
      success: true,
      asset: asset,
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN image upload error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Create a post with image
export async function createImagePost(accessToken, personUrn, text, imageAsset, visibility = LinkedInVisibility.PUBLIC) {
  console.log('📝 LINKEDIN: Creating image post...');

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    const response = await axios.post(
      `${LINKEDIN_API_URL}/ugcPosts`,
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'IMAGE',
            media: [
              {
                status: 'READY',
                media: imageAsset
              }
            ]
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    console.log('✅ LINKEDIN: Image post created successfully');
    return {
      success: true,
      postId: response.headers['x-restli-id'] || response.data.id,
      message: 'Image post published successfully!',
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN image post error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Create a post with article/link
export async function createArticlePost(accessToken, personUrn, text, articleUrl, title, description, visibility = LinkedInVisibility.PUBLIC) {
  console.log('📝 LINKEDIN: Creating article post...');

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    const response = await axios.post(
      `${LINKEDIN_API_URL}/ugcPosts`,
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'ARTICLE',
            media: [
              {
                status: 'READY',
                originalUrl: articleUrl,
                title: {
                  text: title || ''
                },
                description: {
                  text: description || ''
                }
              }
            ]
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    console.log('✅ LINKEDIN: Article post created successfully');
    return {
      success: true,
      postId: response.headers['x-restli-id'] || response.data.id,
      message: 'Article post published successfully!',
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN article post error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Upload video to LinkedIn (similar 3-step process)
export async function uploadVideo(accessToken, personUrn, videoBuffer, fileName = 'video.mp4') {
  console.log('🎥 LINKEDIN: Uploading video:', fileName);

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    // Step 1: Register upload request for video
    console.log('🎥 LINKEDIN: Step 1 - Registering video upload...');
    const registerResponse = await axios.post(
      `${LINKEDIN_API_URL}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerResponse.data.value.asset;

    // Step 2: Upload the binary video
    console.log('🎥 LINKEDIN: Step 2 - Uploading video binary...');
    await axios.put(uploadUrl, videoBuffer, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'video/mp4'
      }
    });

    // Step 3: Asset ready
    console.log('✅ LINKEDIN: Step 3 - Video uploaded, asset:', asset);
    return {
      success: true,
      asset: asset,
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN video upload error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Create a post with video
export async function createVideoPost(accessToken, personUrn, text, videoAsset, visibility = LinkedInVisibility.PUBLIC) {
  console.log('📝 LINKEDIN: Creating video post...');

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    const response = await axios.post(
      `${LINKEDIN_API_URL}/ugcPosts`,
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'VIDEO',
            media: [
              {
                status: 'READY',
                media: videoAsset
              }
            ]
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    console.log('✅ LINKEDIN: Video post created successfully');
    return {
      success: true,
      postId: response.headers['x-restli-id'] || response.data.id,
      message: 'Video post published successfully!',
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN video post error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Delete a post from LinkedIn
export async function deletePost(accessToken, postUrn) {
  console.log('🗑️ LINKEDIN: Deleting post:', postUrn);

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets in ${Math.ceil(rateCheck.resetIn / 3600000)} hours.`,
      rateLimited: true
    };
  }

  try {
    await axios.delete(
      `${LINKEDIN_API_URL}/ugcPosts/${encodeURIComponent(postUrn)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    console.log('✅ LINKEDIN: Post deleted successfully');
    return {
      success: true,
      message: 'Post deleted successfully!',
      remainingRequests: rateCheck.remaining
    };
  } catch (error) {
    console.error('❌ LINKEDIN delete error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Get rate limit status
export function getRateLimitStatus() {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  // Reset counter if 24 hours have passed
  if (now - rateLimitState.lastReset > dayInMs) {
    rateLimitState.memberRequests = 0;
    rateLimitState.lastReset = now;
  }

  return {
    used: rateLimitState.memberRequests,
    remaining: rateLimitState.maxPerDay - rateLimitState.memberRequests,
    limit: rateLimitState.maxPerDay,
    resetIn: Math.ceil((dayInMs - (now - rateLimitState.lastReset)) / 3600000) // hours
  };
}
