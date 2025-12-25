import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import ideasRoutes from './routes/ideas.js';
import remindersRoutes from './routes/reminders.js';
import uploadsRoutes from './routes/uploads.js';
import searchRoutes from './routes/search.js';
import emailsRoutes from './routes/emails.js';
import summaryRoutes from './routes/summary.js';
import linkedinRoutes from './routes/linkedin.js';
import sheetsRoutes from './routes/sheets.js';
import googleAuthRoutes from './routes/google-auth.js';
import { initializeDatabase } from './models/database.js';
import { setupReminderScheduler } from './services/reminder.js';
import { initializeSummaryScheduler } from './services/summary-generator.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ideas', ideasRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/google', googleAuthRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized');
    
    // Setup reminder scheduler
    setupReminderScheduler(io);
    console.log('Reminder scheduler initialized');

    // Setup 12-hour summary scheduler
    initializeSummaryScheduler(io);
    console.log('Summary scheduler initialized');
    
    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { io };

