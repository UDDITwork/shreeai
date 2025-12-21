import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FIRECRAWLER_API_URL = 'https://api.firecrawl.dev/v1';

export async function searchWeb(query) {
  try {
    const response = await axios.post(
      `${FIRECRAWLER_API_URL}/search`,
      {
        query,
        pageOptions: {
          onlyMainContent: true,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWLER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      results: response.data.data || [],
    };
  } catch (error) {
    console.error('Firecrawler API error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      results: [],
    };
  }
}

export async function scrapeUrl(url) {
  try {
    const response = await axios.post(
      `${FIRECRAWLER_API_URL}/scrape`,
      {
        url,
        pageOptions: {
          onlyMainContent: true,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWLER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      data: response.data.data,
    };
  } catch (error) {
    console.error('Firecrawler scrape error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      data: null,
    };
  }
}

