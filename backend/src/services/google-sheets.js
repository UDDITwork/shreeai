import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Create OAuth2 client (reusing Gmail credentials)
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback'
);

// Set credentials if refresh token exists
if (process.env.GMAIL_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  });
}

// Initialize Sheets API
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Get a spreadsheet by ID
 */
export async function getSpreadsheet(spreadsheetId, ranges = []) {
  console.log('📊 SHEETS: Getting spreadsheet:', spreadsheetId);
  try {
    const params = {
      spreadsheetId,
      includeGridData: true
    };

    if (ranges.length > 0) {
      params.ranges = ranges;
    }

    const response = await sheets.spreadsheets.get(params);

    console.log('✅ SHEETS: Retrieved spreadsheet:', response.data.properties.title);
    return {
      success: true,
      spreadsheet: {
        id: response.data.spreadsheetId,
        title: response.data.properties.title,
        sheets: response.data.sheets?.map(sheet => ({
          id: sheet.properties.sheetId,
          title: sheet.properties.title,
          rowCount: sheet.properties.gridProperties?.rowCount,
          columnCount: sheet.properties.gridProperties?.columnCount
        })),
        data: response.data
      }
    };
  } catch (error) {
    console.error('❌ SHEETS get error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new spreadsheet
 */
export async function createSpreadsheet(title, sheetNames = ['Sheet1']) {
  console.log('📊 SHEETS: Creating spreadsheet:', title);
  try {
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title
        },
        sheets: sheetNames.map((name, index) => ({
          properties: {
            sheetId: index,
            title: name
          }
        }))
      }
    });

    console.log('✅ SHEETS: Created spreadsheet:', response.data.spreadsheetId);
    return {
      success: true,
      spreadsheetId: response.data.spreadsheetId,
      spreadsheetUrl: response.data.spreadsheetUrl,
      title: response.data.properties.title,
      sheets: response.data.sheets.map(s => s.properties.title)
    };
  } catch (error) {
    console.error('❌ SHEETS create error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Read values from a range
 */
export async function readRange(spreadsheetId, range) {
  console.log('📊 SHEETS: Reading range:', range);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    console.log('✅ SHEETS: Read', response.data.values?.length || 0, 'rows');
    return {
      success: true,
      range: response.data.range,
      values: response.data.values || [],
      rowCount: response.data.values?.length || 0
    };
  } catch (error) {
    console.error('❌ SHEETS read error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Write values to a range
 */
export async function writeRange(spreadsheetId, range, values, inputOption = 'USER_ENTERED') {
  console.log('📊 SHEETS: Writing to range:', range);
  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: inputOption,
      requestBody: {
        values
      }
    });

    console.log('✅ SHEETS: Updated', response.data.updatedCells, 'cells');
    return {
      success: true,
      updatedRange: response.data.updatedRange,
      updatedRows: response.data.updatedRows,
      updatedColumns: response.data.updatedColumns,
      updatedCells: response.data.updatedCells
    };
  } catch (error) {
    console.error('❌ SHEETS write error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Append values to a sheet
 */
export async function appendRows(spreadsheetId, range, values, inputOption = 'USER_ENTERED') {
  console.log('📊 SHEETS: Appending rows to:', range);
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: inputOption,
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values
      }
    });

    console.log('✅ SHEETS: Appended', response.data.updates?.updatedRows, 'rows');
    return {
      success: true,
      updatedRange: response.data.updates?.updatedRange,
      updatedRows: response.data.updates?.updatedRows,
      updatedCells: response.data.updates?.updatedCells
    };
  } catch (error) {
    console.error('❌ SHEETS append error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clear values in a range
 */
export async function clearRange(spreadsheetId, range) {
  console.log('📊 SHEETS: Clearing range:', range);
  try {
    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range
    });

    console.log('✅ SHEETS: Cleared range:', response.data.clearedRange);
    return {
      success: true,
      clearedRange: response.data.clearedRange
    };
  } catch (error) {
    console.error('❌ SHEETS clear error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete rows from a sheet
 */
export async function deleteRows(spreadsheetId, sheetId, startIndex, endIndex) {
  console.log('📊 SHEETS: Deleting rows', startIndex, 'to', endIndex);
  try {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex
            }
          }
        }]
      }
    });

    console.log('✅ SHEETS: Deleted rows');
    return {
      success: true,
      message: `Deleted rows ${startIndex + 1} to ${endIndex}`
    };
  } catch (error) {
    console.error('❌ SHEETS delete rows error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add a new sheet to existing spreadsheet
 */
export async function addSheet(spreadsheetId, sheetTitle) {
  console.log('📊 SHEETS: Adding sheet:', sheetTitle);
  try {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetTitle
            }
          }
        }]
      }
    });

    const newSheet = response.data.replies[0].addSheet;
    console.log('✅ SHEETS: Added sheet:', newSheet.properties.title);
    return {
      success: true,
      sheetId: newSheet.properties.sheetId,
      sheetTitle: newSheet.properties.title
    };
  } catch (error) {
    console.error('❌ SHEETS add sheet error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a sheet from spreadsheet
 */
export async function deleteSheet(spreadsheetId, sheetId) {
  console.log('📊 SHEETS: Deleting sheet ID:', sheetId);
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteSheet: {
            sheetId
          }
        }]
      }
    });

    console.log('✅ SHEETS: Deleted sheet');
    return {
      success: true,
      message: 'Sheet deleted successfully'
    };
  } catch (error) {
    console.error('❌ SHEETS delete sheet error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List user's spreadsheets from Drive
 */
export async function listSpreadsheets(maxResults = 10) {
  console.log('📊 SHEETS: Listing spreadsheets');
  try {
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      pageSize: maxResults,
      fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc'
    });

    console.log('✅ SHEETS: Found', response.data.files?.length || 0, 'spreadsheets');
    return {
      success: true,
      spreadsheets: response.data.files?.map(file => ({
        id: file.id,
        name: file.name,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        url: file.webViewLink
      })) || []
    };
  } catch (error) {
    console.error('❌ SHEETS list error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a spreadsheet
 */
export async function deleteSpreadsheet(spreadsheetId) {
  console.log('📊 SHEETS: Deleting spreadsheet:', spreadsheetId);
  try {
    await drive.files.delete({
      fileId: spreadsheetId
    });

    console.log('✅ SHEETS: Deleted spreadsheet');
    return {
      success: true,
      message: 'Spreadsheet deleted successfully'
    };
  } catch (error) {
    console.error('❌ SHEETS delete error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get spreadsheet summary for AI analysis
 */
export async function getSpreadsheetSummary(spreadsheetId) {
  console.log('📊 SHEETS: Getting summary for:', spreadsheetId);
  try {
    // Get spreadsheet metadata
    const metaResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false
    });

    const spreadsheet = metaResponse.data;
    const sheetSummaries = [];

    // Get data from each sheet
    for (const sheet of spreadsheet.sheets || []) {
      const sheetTitle = sheet.properties.title;
      const rowCount = sheet.properties.gridProperties?.rowCount || 0;
      const colCount = sheet.properties.gridProperties?.columnCount || 0;

      // Read first 100 rows to analyze
      const range = `${sheetTitle}!A1:Z100`;
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const values = dataResponse.data.values || [];
      const headers = values[0] || [];
      const dataRows = values.slice(1);

      // Analyze data types and content
      const columnAnalysis = headers.map((header, idx) => {
        const columnValues = dataRows.map(row => row[idx]).filter(v => v);
        const numericCount = columnValues.filter(v => !isNaN(parseFloat(v))).length;
        const isNumeric = numericCount > columnValues.length * 0.7;

        return {
          header,
          type: isNumeric ? 'numeric' : 'text',
          sampleValues: columnValues.slice(0, 3),
          uniqueCount: new Set(columnValues).size,
          emptyCount: dataRows.length - columnValues.length
        };
      });

      sheetSummaries.push({
        title: sheetTitle,
        totalRows: rowCount,
        totalColumns: colCount,
        dataRows: dataRows.length,
        headers,
        columnAnalysis,
        sampleData: dataRows.slice(0, 5)
      });
    }

    console.log('✅ SHEETS: Summary generated');
    return {
      success: true,
      spreadsheetTitle: spreadsheet.properties.title,
      spreadsheetId,
      sheetCount: spreadsheet.sheets?.length || 0,
      sheets: sheetSummaries
    };
  } catch (error) {
    console.error('❌ SHEETS summary error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Batch update multiple ranges
 */
export async function batchUpdate(spreadsheetId, updates) {
  console.log('📊 SHEETS: Batch updating', updates.length, 'ranges');
  try {
    const response = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map(u => ({
          range: u.range,
          values: u.values
        }))
      }
    });

    console.log('✅ SHEETS: Batch updated', response.data.totalUpdatedCells, 'cells');
    return {
      success: true,
      totalUpdatedCells: response.data.totalUpdatedCells,
      totalUpdatedRows: response.data.totalUpdatedRows,
      totalUpdatedSheets: response.data.totalUpdatedSheets
    };
  } catch (error) {
    console.error('❌ SHEETS batch update error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format cells (bold, colors, etc.)
 */
export async function formatCells(spreadsheetId, sheetId, startRow, endRow, startCol, endCol, format) {
  console.log('📊 SHEETS: Formatting cells');
  try {
    const requests = [];

    if (format.bold !== undefined || format.fontSize || format.textColor) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: format.bold,
                fontSize: format.fontSize,
                foregroundColor: format.textColor
              },
              backgroundColor: format.backgroundColor
            }
          },
          fields: 'userEnteredFormat(textFormat,backgroundColor)'
        }
      });
    }

    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });

    console.log('✅ SHEETS: Cells formatted');
    return {
      success: true,
      message: 'Cells formatted successfully'
    };
  } catch (error) {
    console.error('❌ SHEETS format error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export { oauth2Client };
