import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import { generateEmbedding } from './embeddings.js';

dotenv.config();

let pineconeClient = null;
let index = null;

export async function initializePinecone() {
  if (pineconeClient) {
    return;
  }

  try {
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'smart-idea-manager';
    index = pineconeClient.index(indexName);

    console.log('Pinecone initialized');
  } catch (error) {
    console.error('Pinecone initialization error:', error);
    throw error;
  }
}

export async function upsertVector(id, embedding, metadata) {
  try {
    await initializePinecone();
    
    await index.upsert([
      {
        id,
        values: embedding,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
      },
    ]);
  } catch (error) {
    console.error('Pinecone upsert error:', error);
    throw error;
  }
}

export async function queryVectors(embedding, topK = 5, filter = {}) {
  try {
    await initializePinecone();

    const queryResponse = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter,
    });

    return queryResponse.matches || [];
  } catch (error) {
    console.error('Pinecone query error:', error);
    throw error;
  }
}

export async function deleteVector(id) {
  try {
    await initializePinecone();
    await index.deleteOne(id);
  } catch (error) {
    console.error('Pinecone delete error:', error);
    throw error;
  }
}

export async function storeConversationEmbedding(userId, conversationId, text, metadata = {}) {
  try {
    const embedding = await generateEmbedding(text);
    const vectorId = `conv_${userId}_${conversationId}`;
    
    await upsertVector(vectorId, embedding, {
      userId,
      conversationId,
      type: 'conversation',
      text: text.substring(0, 500), // Store first 500 chars as metadata
      ...metadata,
    });

    return vectorId;
  } catch (error) {
    console.error('Store conversation embedding error:', error);
    throw error;
  }
}

export async function searchSimilarConversations(userId, queryText, topK = 5) {
  try {
    const queryEmbedding = await generateEmbedding(queryText);
    
    const results = await queryVectors(queryEmbedding, topK, {
      userId: { $eq: userId },
      type: { $eq: 'conversation' },
    });

    return results;
  } catch (error) {
    console.error('Search similar conversations error:', error);
    return [];
  }
}

