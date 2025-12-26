/**
 * Personalization Service
 * Manages user profiles, preferences, and learns from conversations
 */

import { client } from '../models/database.js';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ============================================
// USER PROFILE MANAGEMENT
// ============================================

/**
 * Get or create user profile
 */
export async function getOrCreateProfile(userId) {
  try {
    // Try to get existing profile
    const result = await client.execute({
      sql: 'SELECT * FROM user_profiles WHERE user_id = ?',
      args: [userId]
    });

    if (result.rows.length > 0) {
      const profile = result.rows[0];
      return {
        ...profile,
        interests: profile.interests ? JSON.parse(profile.interests) : [],
        short_term_goals: profile.short_term_goals ? JSON.parse(profile.short_term_goals) : [],
        long_term_goals: profile.long_term_goals ? JSON.parse(profile.long_term_goals) : [],
        daily_habits: profile.daily_habits ? JSON.parse(profile.daily_habits) : [],
        important_dates: profile.important_dates ? JSON.parse(profile.important_dates) : [],
        health_preferences: profile.health_preferences ? JSON.parse(profile.health_preferences) : {},
        work_schedule: profile.work_schedule ? JSON.parse(profile.work_schedule) : {}
      };
    }

    // Create new profile with defaults
    const id = uuidv4();
    await client.execute({
      sql: `INSERT INTO user_profiles (id, user_id) VALUES (?, ?)`,
      args: [id, userId]
    });

    return {
      id,
      user_id: userId,
      name: null,
      preferred_name: null,
      timezone: 'Asia/Kolkata',
      wake_time: '07:00',
      sleep_time: '23:00',
      work_start_time: '09:00',
      work_end_time: '18:00',
      communication_style: 'friendly',
      interests: [],
      short_term_goals: [],
      long_term_goals: [],
      daily_habits: [],
      important_dates: [],
      health_preferences: {},
      work_schedule: {},
      personality_notes: null,
      financial_goal: null,
      proactive_enabled: 1,
      wellbeing_enabled: 1,
      morning_briefing_enabled: 1,
      evening_summary_enabled: 1,
      money_focus_mode: 1
    };
  } catch (error) {
    console.error('Error getting/creating profile:', error);
    throw error;
  }
}

/**
 * Update user profile
 */
export async function updateProfile(userId, updates) {
  try {
    const allowedFields = [
      'name', 'preferred_name', 'timezone', 'wake_time', 'sleep_time',
      'work_start_time', 'work_end_time', 'communication_style', 'interests',
      'short_term_goals', 'long_term_goals', 'daily_habits', 'important_dates',
      'health_preferences', 'work_schedule', 'personality_notes', 'financial_goal',
      'proactive_enabled', 'wellbeing_enabled', 'morning_briefing_enabled',
      'evening_summary_enabled', 'money_focus_mode'
    ];

    const fieldsToUpdate = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fieldsToUpdate.push(`${key} = ?`);
        // Serialize JSON fields
        if (['interests', 'short_term_goals', 'long_term_goals', 'daily_habits',
             'important_dates', 'health_preferences', 'work_schedule'].includes(key)) {
          values.push(typeof value === 'string' ? value : JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (fieldsToUpdate.length === 0) {
      return await getOrCreateProfile(userId);
    }

    fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    await client.execute({
      sql: `UPDATE user_profiles SET ${fieldsToUpdate.join(', ')} WHERE user_id = ?`,
      args: values
    });

    return await getOrCreateProfile(userId);
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
}

// ============================================
// LEARNING FROM CONVERSATIONS
// ============================================

/**
 * Analyze conversation and extract learnable information
 */
export async function learnFromConversation(userId, userMessage, assistantResponse) {
  try {
    const prompt = `Analyze this conversation and extract any personal information about the user that should be remembered for future interactions.

User message: "${userMessage}"
Assistant response: "${assistantResponse}"

Extract the following if present (return JSON):
{
  "name": "user's name if mentioned",
  "preferences": ["any stated preferences"],
  "goals": ["any goals mentioned"],
  "income_info": {
    "source": "source name if mentioned (freelance, job, client name, etc.)",
    "amount": "amount if mentioned",
    "time_spent": "hours if mentioned"
  },
  "schedule_info": {
    "event": "any scheduled event",
    "time": "when",
    "recurring": true/false
  },
  "contacts": [{
    "name": "contact name",
    "relationship": "relationship type"
  }],
  "mood": "current mood if detectable (happy, stressed, tired, motivated, etc.)",
  "personality_insight": "any insight about user's personality or work style"
}

Only include fields where information was actually found. Return empty object {} if nothing learnable.
Return ONLY valid JSON, no explanation.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text.trim();
    let learned;

    try {
      learned = JSON.parse(content);
    } catch {
      console.log('Could not parse learning response:', content);
      return null;
    }

    if (Object.keys(learned).length === 0) {
      return null;
    }

    // Apply learned information
    await applyLearnings(userId, learned, userMessage);

    return learned;
  } catch (error) {
    console.error('Error learning from conversation:', error);
    return null;
  }
}

/**
 * Apply learned information to user's profile and related tables
 */
async function applyLearnings(userId, learned, originalMessage) {
  try {
    const profile = await getOrCreateProfile(userId);
    const updates = {};

    // Update name if learned
    if (learned.name && !profile.name) {
      updates.name = learned.name;
      updates.preferred_name = learned.name.split(' ')[0]; // First name
    }

    // Add to goals
    if (learned.goals && learned.goals.length > 0) {
      const existingGoals = profile.short_term_goals || [];
      const newGoals = [...new Set([...existingGoals, ...learned.goals])];
      updates.short_term_goals = newGoals;
    }

    // Add personality insights
    if (learned.personality_insight) {
      const existingNotes = profile.personality_notes || '';
      const timestamp = new Date().toISOString().split('T')[0];
      updates.personality_notes = existingNotes
        ? `${existingNotes}\n[${timestamp}] ${learned.personality_insight}`
        : `[${timestamp}] ${learned.personality_insight}`;
    }

    // Update profile if we have changes
    if (Object.keys(updates).length > 0) {
      await updateProfile(userId, updates);
    }

    // Record income if mentioned
    if (learned.income_info && learned.income_info.source) {
      await recordIncomeSource(userId, learned.income_info);
    }

    // Add contacts if mentioned
    if (learned.contacts && learned.contacts.length > 0) {
      for (const contact of learned.contacts) {
        if (contact.name) {
          await addOrUpdateContact(userId, contact);
        }
      }
    }

    // Record mood for wellbeing tracking
    if (learned.mood) {
      await recordWellbeingLog(userId, 'mood', learned.mood, originalMessage);
    }

    // Store behavior pattern
    if (learned.preferences && learned.preferences.length > 0) {
      await recordBehaviorPattern(userId, 'preferences', {
        preferences: learned.preferences,
        observed_at: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error applying learnings:', error);
  }
}

// ============================================
// INCOME TRACKING
// ============================================

/**
 * Record or update an income source
 */
export async function recordIncomeSource(userId, incomeInfo) {
  try {
    const { source, amount, time_spent } = incomeInfo;

    // Check if source exists
    const existing = await client.execute({
      sql: 'SELECT * FROM income_sources WHERE user_id = ? AND LOWER(source_name) = LOWER(?)',
      args: [userId, source]
    });

    const parsedAmount = parseInt(String(amount).replace(/[^0-9]/g, '')) || 0;
    const parsedHours = parseFloat(time_spent) || 0;

    if (existing.rows.length > 0) {
      // Update existing source
      const current = existing.rows[0];
      const newTotal = (current.total_earned || 0) + parsedAmount;
      const newCount = (current.occurrence_count || 0) + 1;
      const newAverage = Math.round(newTotal / newCount);
      const hourlyRate = parsedHours > 0 ? Math.round(parsedAmount / parsedHours) : current.hourly_rate;

      await client.execute({
        sql: `UPDATE income_sources SET
              total_earned = ?, occurrence_count = ?, average_amount = ?,
              hourly_rate = COALESCE(?, hourly_rate),
              time_investment_hours = COALESCE(?, time_investment_hours),
              last_earned = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [newTotal, newCount, newAverage, hourlyRate, parsedHours, current.id]
      });

      // Update priority score based on hourly rate
      await updateIncomeSourcePriority(current.id);
    } else {
      // Create new source
      const id = uuidv4();
      const hourlyRate = parsedHours > 0 ? Math.round(parsedAmount / parsedHours) : null;

      await client.execute({
        sql: `INSERT INTO income_sources
              (id, user_id, source_name, average_amount, total_earned,
               time_investment_hours, hourly_rate, last_earned)
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [id, userId, source, parsedAmount, parsedAmount, parsedHours, hourlyRate]
      });
    }

    // Update daily metrics
    await updateDailyMetrics(userId, { money_earned: parsedAmount });

  } catch (error) {
    console.error('Error recording income source:', error);
  }
}

/**
 * Update income source priority based on hourly rate
 */
async function updateIncomeSourcePriority(sourceId) {
  try {
    // Get all sources for comparison
    const source = await client.execute({
      sql: 'SELECT * FROM income_sources WHERE id = ?',
      args: [sourceId]
    });

    if (source.rows.length === 0) return;

    const current = source.rows[0];
    const allSources = await client.execute({
      sql: 'SELECT * FROM income_sources WHERE user_id = ? ORDER BY hourly_rate DESC',
      args: [current.user_id]
    });

    // Calculate priority score (1-100) based on relative hourly rate
    const maxRate = allSources.rows[0]?.hourly_rate || 1;
    const priorityScore = Math.round((current.hourly_rate / maxRate) * 100);

    await client.execute({
      sql: 'UPDATE income_sources SET priority_score = ? WHERE id = ?',
      args: [priorityScore, sourceId]
    });
  } catch (error) {
    console.error('Error updating income source priority:', error);
  }
}

/**
 * Get income sources ranked by priority
 */
export async function getIncomeSources(userId) {
  try {
    const result = await client.execute({
      sql: `SELECT * FROM income_sources WHERE user_id = ?
            ORDER BY priority_score DESC, hourly_rate DESC`,
      args: [userId]
    });
    return result.rows;
  } catch (error) {
    console.error('Error getting income sources:', error);
    return [];
  }
}

// ============================================
// CONTACTS MANAGEMENT
// ============================================

/**
 * Add or update a contact
 */
export async function addOrUpdateContact(userId, contactInfo) {
  try {
    const { name, relationship, phone, email, birthday, notes } = contactInfo;

    // Check if contact exists
    const existing = await client.execute({
      sql: 'SELECT * FROM user_contacts WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      args: [userId, name]
    });

    if (existing.rows.length > 0) {
      // Update existing contact
      const updates = [];
      const values = [];

      if (relationship) { updates.push('relationship = ?'); values.push(relationship); }
      if (phone) { updates.push('phone = ?'); values.push(phone); }
      if (email) { updates.push('email = ?'); values.push(email); }
      if (birthday) { updates.push('birthday = ?'); values.push(birthday); }
      if (notes) {
        updates.push('notes = COALESCE(notes || ?, ?)');
        values.push('\n' + notes, notes);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(existing.rows[0].id);

        await client.execute({
          sql: `UPDATE user_contacts SET ${updates.join(', ')} WHERE id = ?`,
          args: values
        });
      }

      return existing.rows[0].id;
    } else {
      // Create new contact
      const id = uuidv4();
      await client.execute({
        sql: `INSERT INTO user_contacts
              (id, user_id, name, relationship, phone, email, birthday, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, userId, name, relationship || null, phone || null,
               email || null, birthday || null, notes || null]
      });
      return id;
    }
  } catch (error) {
    console.error('Error adding/updating contact:', error);
    return null;
  }
}

/**
 * Get all contacts for a user
 */
export async function getContacts(userId) {
  try {
    const result = await client.execute({
      sql: 'SELECT * FROM user_contacts WHERE user_id = ? ORDER BY importance DESC, name',
      args: [userId]
    });
    return result.rows;
  } catch (error) {
    console.error('Error getting contacts:', error);
    return [];
  }
}

/**
 * Find contact by name
 */
export async function findContact(userId, name) {
  try {
    const result = await client.execute({
      sql: `SELECT * FROM user_contacts WHERE user_id = ?
            AND (LOWER(name) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?))`,
      args: [userId, `%${name}%`, name]
    });
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error finding contact:', error);
    return null;
  }
}

// ============================================
// WELLBEING TRACKING
// ============================================

/**
 * Record a wellbeing log entry
 */
export async function recordWellbeingLog(userId, logType, value, notes = null) {
  try {
    const id = uuidv4();

    // Try to parse numeric value for things like sleep hours
    let numericValue = null;
    if (typeof value === 'number') {
      numericValue = value;
    } else if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) numericValue = parsed;
    }

    await client.execute({
      sql: `INSERT INTO wellbeing_logs (id, user_id, log_type, value, numeric_value, notes)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, userId, logType, String(value), numericValue, notes]
    });

    return id;
  } catch (error) {
    console.error('Error recording wellbeing log:', error);
    return null;
  }
}

/**
 * Get wellbeing logs for a period
 */
export async function getWellbeingLogs(userId, logType = null, days = 7) {
  try {
    let sql = `SELECT * FROM wellbeing_logs WHERE user_id = ?
               AND logged_at >= datetime('now', '-${days} days')`;
    const args = [userId];

    if (logType) {
      sql += ' AND log_type = ?';
      args.push(logType);
    }

    sql += ' ORDER BY logged_at DESC';

    const result = await client.execute({ sql, args });
    return result.rows;
  } catch (error) {
    console.error('Error getting wellbeing logs:', error);
    return [];
  }
}

// ============================================
// BEHAVIOR PATTERNS
// ============================================

/**
 * Record a behavior pattern
 */
export async function recordBehaviorPattern(userId, patternType, patternData) {
  try {
    // Check for existing similar pattern
    const existing = await client.execute({
      sql: 'SELECT * FROM behavior_patterns WHERE user_id = ? AND pattern_type = ?',
      args: [userId, patternType]
    });

    if (existing.rows.length > 0) {
      // Update existing pattern
      const current = existing.rows[0];
      const existingData = JSON.parse(current.pattern_data || '{}');
      const mergedData = { ...existingData, ...patternData };
      const newConfidence = Math.min((current.confidence || 0.5) + 0.1, 1.0);

      await client.execute({
        sql: `UPDATE behavior_patterns SET
              pattern_data = ?, confidence = ?, occurrences = occurrences + 1,
              last_observed = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [JSON.stringify(mergedData), newConfidence, current.id]
      });
    } else {
      // Create new pattern
      const id = uuidv4();
      await client.execute({
        sql: `INSERT INTO behavior_patterns
              (id, user_id, pattern_type, pattern_data, last_observed)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [id, userId, patternType, JSON.stringify(patternData)]
      });
    }
  } catch (error) {
    console.error('Error recording behavior pattern:', error);
  }
}

/**
 * Get behavior patterns for a user
 */
export async function getBehaviorPatterns(userId, patternType = null) {
  try {
    let sql = 'SELECT * FROM behavior_patterns WHERE user_id = ?';
    const args = [userId];

    if (patternType) {
      sql += ' AND pattern_type = ?';
      args.push(patternType);
    }

    sql += ' ORDER BY confidence DESC, occurrences DESC';

    const result = await client.execute({ sql, args });
    return result.rows.map(row => ({
      ...row,
      pattern_data: JSON.parse(row.pattern_data || '{}')
    }));
  } catch (error) {
    console.error('Error getting behavior patterns:', error);
    return [];
  }
}

// ============================================
// DAILY METRICS
// ============================================

/**
 * Update daily metrics
 */
export async function updateDailyMetrics(userId, updates) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if today's record exists
    const existing = await client.execute({
      sql: 'SELECT * FROM daily_metrics WHERE user_id = ? AND date = ?',
      args: [userId, today]
    });

    if (existing.rows.length > 0) {
      // Update existing record
      const current = existing.rows[0];
      const fieldsToUpdate = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'money_earned' || key === 'time_saved_minutes' ||
            key === 'tasks_completed' || key === 'goals_progressed') {
          fieldsToUpdate.push(`${key} = ${key} + ?`);
          values.push(value);
        } else {
          fieldsToUpdate.push(`${key} = ?`);
          values.push(value);
        }
      }

      fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
      values.push(current.id);

      await client.execute({
        sql: `UPDATE daily_metrics SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
        args: values
      });
    } else {
      // Create new record
      const id = uuidv4();
      const columns = ['id', 'user_id', 'date', ...Object.keys(updates)];
      const placeholders = columns.map(() => '?').join(', ');
      const values = [id, userId, today, ...Object.values(updates)];

      await client.execute({
        sql: `INSERT INTO daily_metrics (${columns.join(', ')}) VALUES (${placeholders})`,
        args: values
      });
    }
  } catch (error) {
    console.error('Error updating daily metrics:', error);
  }
}

/**
 * Get daily metrics for a period
 */
export async function getDailyMetrics(userId, days = 7) {
  try {
    const result = await client.execute({
      sql: `SELECT * FROM daily_metrics WHERE user_id = ?
            AND date >= date('now', '-${days} days')
            ORDER BY date DESC`,
      args: [userId]
    });
    return result.rows;
  } catch (error) {
    console.error('Error getting daily metrics:', error);
    return [];
  }
}

// ============================================
// PERSONALIZED CONTEXT FOR AGENT
// ============================================

/**
 * Get full personalized context for the AI agent
 */
export async function getPersonalizedContext(userId) {
  try {
    const [profile, incomeSources, contacts, patterns, recentWellbeing, metrics] = await Promise.all([
      getOrCreateProfile(userId),
      getIncomeSources(userId),
      getContacts(userId),
      getBehaviorPatterns(userId),
      getWellbeingLogs(userId, null, 3),
      getDailyMetrics(userId, 7)
    ]);

    // Get protected time blocks
    const timeBlocks = await client.execute({
      sql: 'SELECT * FROM protected_time_blocks WHERE user_id = ? AND is_active = 1',
      args: [userId]
    });

    // Get active goals
    const goals = await client.execute({
      sql: `SELECT * FROM user_goals WHERE user_id = ? AND status = 'active'
            ORDER BY priority DESC LIMIT 10`,
      args: [userId]
    });

    // Build context object
    const context = {
      profile: {
        name: profile.preferred_name || profile.name,
        timezone: profile.timezone,
        schedule: {
          wake_time: profile.wake_time,
          sleep_time: profile.sleep_time,
          work_start: profile.work_start_time,
          work_end: profile.work_end_time
        },
        communication_style: profile.communication_style,
        money_focus_mode: profile.money_focus_mode === 1,
        financial_goal: profile.financial_goal
      },
      income_sources: incomeSources.slice(0, 5).map(s => ({
        name: s.source_name,
        hourly_rate: s.hourly_rate,
        priority: s.priority_score,
        total_earned: s.total_earned
      })),
      top_contacts: contacts.slice(0, 5).map(c => ({
        name: c.name,
        relationship: c.relationship
      })),
      protected_time_blocks: timeBlocks.rows.map(b => ({
        name: b.block_name,
        time: `${b.start_time} - ${b.end_time}`,
        days: b.days_of_week ? JSON.parse(b.days_of_week) : ['daily'],
        purpose: b.purpose
      })),
      active_goals: goals.rows.slice(0, 5).map(g => ({
        title: g.title,
        type: g.goal_type,
        progress: g.target_value ? `${g.current_value}/${g.target_value}` : null,
        streak: g.streak_count
      })),
      recent_mood: recentWellbeing.find(w => w.log_type === 'mood')?.value,
      personality_notes: profile.personality_notes,
      weekly_stats: metrics.length > 0 ? {
        total_earned: metrics.reduce((sum, m) => sum + (m.money_earned || 0), 0),
        time_saved: metrics.reduce((sum, m) => sum + (m.time_saved_minutes || 0), 0),
        tasks_completed: metrics.reduce((sum, m) => sum + (m.tasks_completed || 0), 0)
      } : null
    };

    return context;
  } catch (error) {
    console.error('Error getting personalized context:', error);
    return null;
  }
}

export default {
  getOrCreateProfile,
  updateProfile,
  learnFromConversation,
  recordIncomeSource,
  getIncomeSources,
  addOrUpdateContact,
  getContacts,
  findContact,
  recordWellbeingLog,
  getWellbeingLogs,
  recordBehaviorPattern,
  getBehaviorPatterns,
  updateDailyMetrics,
  getDailyMetrics,
  getPersonalizedContext
};
