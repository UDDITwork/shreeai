import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FIRECRAWLER_API_URL = 'https://api.firecrawl.dev/v1';

export async function searchWeb(query) {
  console.log('🔍 FIRECRAWLER: Searching for:', query);
  try {
    const response = await axios.post(
      `${FIRECRAWLER_API_URL}/search`,
      {
        query,
        limit: 5,
        scrapeOptions: {
          onlyMainContent: true
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWLER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ FIRECRAWLER: Found', response.data.data?.length || 0, 'results');
    return {
      success: true,
      results: response.data.data || [],
    };
  } catch (error) {
    console.error('❌ FIRECRAWLER API error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      results: [],
    };
  }
}

export async function scrapeUrl(url) {
  console.log('🔍 FIRECRAWLER: Scraping URL:', url);
  try {
    const response = await axios.post(
      `${FIRECRAWLER_API_URL}/scrape`,
      {
        url,
        formats: ['markdown', 'html']
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWLER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ FIRECRAWLER: Scraped successfully');
    return {
      success: true,
      data: response.data.data,
    };
  } catch (error) {
    console.error('❌ FIRECRAWLER scrape error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      data: null,
    };
  }
}

