import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getSpreadsheet,
  createSpreadsheet,
  readRange,
  writeRange,
  appendRows,
  clearRange,
  deleteRows,
  addSheet,
  deleteSheet,
  listSpreadsheets,
  deleteSpreadsheet,
  getSpreadsheetSummary,
  batchUpdate,
  formatCells
} from '../services/google-sheets.js';

const router = express.Router();

// List user's spreadsheets
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const result = await listSpreadsheets(parseInt(limit));
    res.json(result);
  } catch (error) {
    console.error('List spreadsheets error:', error);
    res.status(500).json({ error: 'Failed to list spreadsheets' });
  }
});

// Get a spreadsheet
router.get('/:spreadsheetId', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { ranges } = req.query;
    const rangeArray = ranges ? ranges.split(',') : [];
    const result = await getSpreadsheet(spreadsheetId, rangeArray);
    res.json(result);
  } catch (error) {
    console.error('Get spreadsheet error:', error);
    res.status(500).json({ error: 'Failed to get spreadsheet' });
  }
});

// Get spreadsheet summary for AI analysis
router.get('/:spreadsheetId/summary', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const result = await getSpreadsheetSummary(spreadsheetId);
    res.json(result);
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// Create a new spreadsheet
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { title, sheetNames } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const result = await createSpreadsheet(title, sheetNames);
    res.json(result);
  } catch (error) {
    console.error('Create spreadsheet error:', error);
    res.status(500).json({ error: 'Failed to create spreadsheet' });
  }
});

// Read values from a range
router.get('/:spreadsheetId/read', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { range } = req.query;
    if (!range) {
      return res.status(400).json({ error: 'Range is required' });
    }
    const result = await readRange(spreadsheetId, range);
    res.json(result);
  } catch (error) {
    console.error('Read range error:', error);
    res.status(500).json({ error: 'Failed to read range' });
  }
});

// Write values to a range
router.post('/:spreadsheetId/write', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { range, values } = req.body;
    if (!range || !values) {
      return res.status(400).json({ error: 'Range and values are required' });
    }
    const result = await writeRange(spreadsheetId, range, values);
    res.json(result);
  } catch (error) {
    console.error('Write range error:', error);
    res.status(500).json({ error: 'Failed to write range' });
  }
});

// Append rows to a sheet
router.post('/:spreadsheetId/append', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { range, values } = req.body;
    if (!range || !values) {
      return res.status(400).json({ error: 'Range and values are required' });
    }
    const result = await appendRows(spreadsheetId, range, values);
    res.json(result);
  } catch (error) {
    console.error('Append rows error:', error);
    res.status(500).json({ error: 'Failed to append rows' });
  }
});

// Clear a range
router.post('/:spreadsheetId/clear', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { range } = req.body;
    if (!range) {
      return res.status(400).json({ error: 'Range is required' });
    }
    const result = await clearRange(spreadsheetId, range);
    res.json(result);
  } catch (error) {
    console.error('Clear range error:', error);
    res.status(500).json({ error: 'Failed to clear range' });
  }
});

// Delete rows
router.delete('/:spreadsheetId/rows', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { sheetId, startIndex, endIndex } = req.body;
    if (sheetId === undefined || startIndex === undefined || endIndex === undefined) {
      return res.status(400).json({ error: 'sheetId, startIndex, and endIndex are required' });
    }
    const result = await deleteRows(spreadsheetId, sheetId, startIndex, endIndex);
    res.json(result);
  } catch (error) {
    console.error('Delete rows error:', error);
    res.status(500).json({ error: 'Failed to delete rows' });
  }
});

// Add a new sheet
router.post('/:spreadsheetId/sheet', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Sheet title is required' });
    }
    const result = await addSheet(spreadsheetId, title);
    res.json(result);
  } catch (error) {
    console.error('Add sheet error:', error);
    res.status(500).json({ error: 'Failed to add sheet' });
  }
});

// Delete a sheet
router.delete('/:spreadsheetId/sheet/:sheetId', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId, sheetId } = req.params;
    const result = await deleteSheet(spreadsheetId, parseInt(sheetId));
    res.json(result);
  } catch (error) {
    console.error('Delete sheet error:', error);
    res.status(500).json({ error: 'Failed to delete sheet' });
  }
});

// Delete entire spreadsheet
router.delete('/:spreadsheetId', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const result = await deleteSpreadsheet(spreadsheetId);
    res.json(result);
  } catch (error) {
    console.error('Delete spreadsheet error:', error);
    res.status(500).json({ error: 'Failed to delete spreadsheet' });
  }
});

// Batch update multiple ranges
router.post('/:spreadsheetId/batch', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates array is required' });
    }
    const result = await batchUpdate(spreadsheetId, updates);
    res.json(result);
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Failed to batch update' });
  }
});

// Format cells
router.post('/:spreadsheetId/format', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { sheetId, startRow, endRow, startCol, endCol, format } = req.body;
    const result = await formatCells(spreadsheetId, sheetId, startRow, endRow, startCol, endCol, format);
    res.json(result);
  } catch (error) {
    console.error('Format cells error:', error);
    res.status(500).json({ error: 'Failed to format cells' });
  }
});

export default router;
