import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { client } from '../models/database.js';
import sharp from 'sharp';
import { randomUUID as uuidv4 } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const userId = req.user.userId;
    const filePath = req.file.path;

    // Process image if it's an image
    let metadata = {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };

    if (req.file.mimetype.startsWith('image/')) {
      try {
        const imageInfo = await sharp(filePath).metadata();
        metadata = {
          ...metadata,
          width: imageInfo.width,
          height: imageInfo.height,
          format: imageInfo.format,
        };
      } catch (error) {
        console.error('Image processing error:', error);
      }
    }

    const uploadId = uuidv4();
    
    await client.execute({
      sql: 'INSERT INTO uploads (id, user_id, filename, file_path, file_type, file_size, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        uploadId,
        userId,
        req.file.filename,
        filePath,
        req.file.mimetype,
        req.file.size,
        JSON.stringify(metadata)
      ]
    });

    res.json({
      success: true,
      uploadId,
      filePath: `/uploads/${req.file.filename}`,
      metadata,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;

