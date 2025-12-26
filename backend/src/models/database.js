import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

export async function initializeDatabase() {
  // Create users table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create ideas table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      type TEXT,
      status TEXT DEFAULT 'active',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create tasks table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create reminders table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT,
      idea_id TEXT,
      scheduled_time DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      reminder_type TEXT DEFAULT 'popup',
      escalation_count INTEGER DEFAULT 0,
      last_reminder_sent DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (idea_id) REFERENCES ideas(id)
    )
  `);

  // Create conversations table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      response TEXT,
      role TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create uploads table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create searches table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      results TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create memory_context table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memory_context (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      context_type TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create emails table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_id TEXT UNIQUE,
      from_address TEXT,
      to_address TEXT,
      subject TEXT,
      body TEXT,
      is_job_related INTEGER DEFAULT 0,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create email_followups table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS email_followups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_id TEXT,
      draft TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (email_id) REFERENCES emails(id)
    )
  `);

  // Create agent_executions table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS agent_executions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      execution_type TEXT,
      steps TEXT,
      status TEXT,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create vector_metadata table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS vector_metadata (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      pinecone_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create summaries table for 12-hour briefings
  await client.execute(`
    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      period_start DATETIME NOT NULL,
      period_end DATETIME NOT NULL,
      summary_text TEXT,
      data TEXT,
      sent_via TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create research_data table for storing extracted startup/company info
  await client.execute(`
    CREATE TABLE IF NOT EXISTS research_data (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      search_id TEXT,
      entity_type TEXT,
      entity_name TEXT,
      data TEXT,
      source_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (search_id) REFERENCES searches(id)
    )
  `);

  // Create linkedin_credentials table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS linkedin_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      person_urn TEXT NOT NULL,
      profile_name TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create linkedin_posts table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS linkedin_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT,
      post_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ============================================
  // PERSONALIZATION & PROACTIVE ASSISTANT TABLES
  // ============================================

  // User profiles - comprehensive user preferences and personality
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT,
      preferred_name TEXT,
      timezone TEXT DEFAULT 'Asia/Kolkata',
      wake_time TEXT DEFAULT '07:00',
      sleep_time TEXT DEFAULT '23:00',
      work_start_time TEXT DEFAULT '09:00',
      work_end_time TEXT DEFAULT '18:00',
      communication_style TEXT DEFAULT 'friendly',
      interests TEXT,
      short_term_goals TEXT,
      long_term_goals TEXT,
      daily_habits TEXT,
      important_dates TEXT,
      health_preferences TEXT,
      work_schedule TEXT,
      personality_notes TEXT,
      financial_goal TEXT,
      proactive_enabled INTEGER DEFAULT 1,
      wellbeing_enabled INTEGER DEFAULT 1,
      morning_briefing_enabled INTEGER DEFAULT 1,
      evening_summary_enabled INTEGER DEFAULT 1,
      money_focus_mode INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // User contacts - relationships the AI should know about
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      email TEXT,
      whatsapp_id TEXT,
      birthday TEXT,
      notes TEXT,
      last_interaction DATETIME,
      communication_frequency TEXT,
      importance INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Life events - calendar, deadlines, birthdays, etc.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS life_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time DATETIME,
      end_time DATETIME,
      all_day INTEGER DEFAULT 0,
      location TEXT,
      participants TEXT,
      importance INTEGER DEFAULT 3,
      recurring TEXT,
      reminder_before INTEGER DEFAULT 30,
      source TEXT DEFAULT 'manual',
      external_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // User goals - short-term, long-term, daily habits with tracking
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      goal_type TEXT NOT NULL,
      target_value INTEGER,
      current_value INTEGER DEFAULT 0,
      unit TEXT,
      target_date DATE,
      frequency TEXT,
      priority INTEGER DEFAULT 3,
      parent_goal_id TEXT,
      linked_income_source TEXT,
      expected_roi TEXT,
      status TEXT DEFAULT 'active',
      streak_count INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      last_progress_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_goal_id) REFERENCES user_goals(id)
    )
  `);

  // Goal progress tracking
  await client.execute(`
    CREATE TABLE IF NOT EXISTS goal_progress (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      progress_value INTEGER,
      notes TEXT,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES user_goals(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Income sources learned from conversations
  await client.execute(`
    CREATE TABLE IF NOT EXISTS income_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT,
      income_type TEXT,
      average_amount INTEGER,
      currency TEXT DEFAULT 'INR',
      time_investment_hours REAL,
      hourly_rate REAL,
      last_earned DATETIME,
      total_earned INTEGER DEFAULT 0,
      occurrence_count INTEGER DEFAULT 1,
      priority_score INTEGER DEFAULT 50,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Protected time blocks - study, deep work, etc.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS protected_time_blocks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      block_name TEXT NOT NULL,
      purpose TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      days_of_week TEXT,
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 100,
      expected_roi TEXT,
      interruption_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Time savings log - track optimization wins
  await client.execute(`
    CREATE TABLE IF NOT EXISTS time_savings_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT,
      time_saved_minutes INTEGER NOT NULL,
      suggestion_source TEXT,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Behavior patterns - AI learning about user habits
  await client.execute(`
    CREATE TABLE IF NOT EXISTS behavior_patterns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_data TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      occurrences INTEGER DEFAULT 1,
      last_observed DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Wellbeing logs - mood, sleep, exercise tracking
  await client.execute(`
    CREATE TABLE IF NOT EXISTS wellbeing_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      log_type TEXT NOT NULL,
      value TEXT,
      numeric_value REAL,
      notes TEXT,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Proactive messages sent - to avoid duplicates and track acknowledgments
  await client.execute(`
    CREATE TABLE IF NOT EXISTS proactive_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content TEXT,
      trigger_reason TEXT,
      priority INTEGER DEFAULT 50,
      channel TEXT DEFAULT 'websocket',
      acknowledged INTEGER DEFAULT 0,
      action_taken TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      acknowledged_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Task priorities - calculated priority scores for tasks
  await client.execute(`
    CREATE TABLE IF NOT EXISTS task_priorities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT,
      goal_id TEXT,
      reminder_id TEXT,
      title TEXT NOT NULL,
      task_type TEXT,
      priority_score INTEGER DEFAULT 50,
      money_impact INTEGER DEFAULT 0,
      time_required_minutes INTEGER,
      deadline DATETIME,
      is_during_protected_time INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Daily productivity metrics
  await client.execute(`
    CREATE TABLE IF NOT EXISTS daily_metrics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date DATE NOT NULL,
      productive_hours REAL DEFAULT 0,
      study_hours REAL DEFAULT 0,
      money_earned INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      goals_progressed INTEGER DEFAULT 0,
      time_saved_minutes INTEGER DEFAULT 0,
      focus_score INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, date)
    )
  `);

  console.log('All tables created/verified (including personalization & productivity tables)');
}

export { client };

