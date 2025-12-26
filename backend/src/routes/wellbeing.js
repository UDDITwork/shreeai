/**
 * Wellbeing API Routes
 * Handles mood, sleep, exercise, and health tracking
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { recordWellbeingLog, getWellbeingLogs, getDailyMetrics } from '../services/personalization.js';
import { client } from '../models/database.js';

const router = express.Router();

// ============================================
// MOOD TRACKING
// ============================================

/**
 * POST /api/wellbeing/mood
 * Log current mood
 */
router.post('/mood', authenticateToken, async (req, res) => {
  try {
    const { mood, notes } = req.body;

    if (!mood) {
      return res.status(400).json({ error: 'Mood is required' });
    }

    // Validate mood values
    const validMoods = ['great', 'good', 'okay', 'stressed', 'tired', 'anxious', 'sad', 'motivated', 'focused'];
    if (!validMoods.includes(mood.toLowerCase())) {
      // Allow custom moods too
    }

    const logId = await recordWellbeingLog(req.user.id, 'mood', mood.toLowerCase(), notes);
    res.json({ success: true, logId, message: `Mood logged: ${mood}` });
  } catch (error) {
    console.error('Error logging mood:', error);
    res.status(500).json({ error: 'Failed to log mood' });
  }
});

/**
 * GET /api/wellbeing/mood
 * Get mood history
 */
router.get('/mood', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const logs = await getWellbeingLogs(req.user.id, 'mood', days);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error getting mood logs:', error);
    res.status(500).json({ error: 'Failed to get mood logs' });
  }
});

// ============================================
// SLEEP TRACKING
// ============================================

/**
 * POST /api/wellbeing/sleep
 * Log sleep hours
 */
router.post('/sleep', authenticateToken, async (req, res) => {
  try {
    const { hours, quality, notes } = req.body;

    if (hours === undefined) {
      return res.status(400).json({ error: 'Sleep hours is required' });
    }

    const sleepHours = parseFloat(hours);
    if (isNaN(sleepHours) || sleepHours < 0 || sleepHours > 24) {
      return res.status(400).json({ error: 'Invalid sleep hours' });
    }

    // Log hours
    await recordWellbeingLog(req.user.id, 'sleep', sleepHours, notes);

    // Log quality if provided
    if (quality) {
      await recordWellbeingLog(req.user.id, 'sleep_quality', quality, null);
    }

    // Provide feedback
    let feedback = '';
    if (sleepHours >= 7 && sleepHours <= 9) {
      feedback = 'Great! You got optimal sleep.';
    } else if (sleepHours < 6) {
      feedback = 'You need more sleep. Aim for 7-8 hours tonight.';
    } else if (sleepHours > 9) {
      feedback = 'You slept a lot! Make sure you\'re feeling refreshed.';
    } else {
      feedback = 'Almost there! Try to get a bit more sleep.';
    }

    res.json({ success: true, hours: sleepHours, feedback });
  } catch (error) {
    console.error('Error logging sleep:', error);
    res.status(500).json({ error: 'Failed to log sleep' });
  }
});

/**
 * GET /api/wellbeing/sleep
 * Get sleep history
 */
router.get('/sleep', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const logs = await getWellbeingLogs(req.user.id, 'sleep', days);

    // Calculate averages
    const sleepValues = logs.map(l => l.numeric_value).filter(v => v !== null);
    const avgSleep = sleepValues.length > 0
      ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
      : null;

    res.json({
      success: true,
      logs,
      stats: {
        average_hours: avgSleep,
        total_logs: logs.length
      }
    });
  } catch (error) {
    console.error('Error getting sleep logs:', error);
    res.status(500).json({ error: 'Failed to get sleep logs' });
  }
});

// ============================================
// EXERCISE TRACKING
// ============================================

/**
 * POST /api/wellbeing/exercise
 * Log exercise
 */
router.post('/exercise', authenticateToken, async (req, res) => {
  try {
    const { type, duration_minutes, notes } = req.body;

    if (!type && !duration_minutes) {
      return res.status(400).json({ error: 'Exercise type or duration is required' });
    }

    const exerciseLog = {
      type: type || 'general',
      duration: duration_minutes || 30
    };

    await recordWellbeingLog(req.user.id, 'exercise', JSON.stringify(exerciseLog), notes);

    res.json({
      success: true,
      message: `Logged ${exerciseLog.duration} minutes of ${exerciseLog.type}!`,
      exercise: exerciseLog
    });
  } catch (error) {
    console.error('Error logging exercise:', error);
    res.status(500).json({ error: 'Failed to log exercise' });
  }
});

/**
 * GET /api/wellbeing/exercise
 * Get exercise history
 */
router.get('/exercise', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const logs = await getWellbeingLogs(req.user.id, 'exercise', days);

    // Parse exercise data and calculate totals
    const parsedLogs = logs.map(l => {
      try {
        const data = JSON.parse(l.value);
        return { ...l, exercise_data: data };
      } catch {
        return { ...l, exercise_data: { type: 'unknown', duration: 0 } };
      }
    });

    const totalMinutes = parsedLogs.reduce((sum, l) => sum + (l.exercise_data.duration || 0), 0);
    const exerciseDays = new Set(parsedLogs.map(l => l.logged_at.split('T')[0])).size;

    res.json({
      success: true,
      logs: parsedLogs,
      stats: {
        total_minutes: totalMinutes,
        total_hours: Math.round(totalMinutes / 60 * 10) / 10,
        days_exercised: exerciseDays
      }
    });
  } catch (error) {
    console.error('Error getting exercise logs:', error);
    res.status(500).json({ error: 'Failed to get exercise logs' });
  }
});

// ============================================
// HYDRATION TRACKING
// ============================================

/**
 * POST /api/wellbeing/hydration
 * Log water intake
 */
router.post('/hydration', authenticateToken, async (req, res) => {
  try {
    const { glasses, ml } = req.body;

    const amount = glasses ? glasses * 250 : (ml || 250);
    await recordWellbeingLog(req.user.id, 'hydration', amount, null);

    // Get today's total
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = await client.execute({
      sql: `SELECT SUM(numeric_value) as total FROM wellbeing_logs
            WHERE user_id = ? AND log_type = 'hydration'
            AND date(logged_at) = ?`,
      args: [req.user.id, today]
    });

    const totalMl = todayLogs.rows[0]?.total || amount;
    const totalGlasses = Math.round(totalMl / 250);
    const targetGlasses = 8;

    res.json({
      success: true,
      logged_ml: amount,
      today_total_ml: totalMl,
      today_glasses: totalGlasses,
      target_glasses: targetGlasses,
      message: totalGlasses >= targetGlasses
        ? `Great! You've hit your water goal for today (${totalGlasses}/${targetGlasses} glasses)!`
        : `${totalGlasses}/${targetGlasses} glasses today. Keep drinking!`
    });
  } catch (error) {
    console.error('Error logging hydration:', error);
    res.status(500).json({ error: 'Failed to log hydration' });
  }
});

// ============================================
// WELLBEING SUMMARY
// ============================================

/**
 * GET /api/wellbeing/summary
 * Get overall wellbeing summary
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    const [moodLogs, sleepLogs, exerciseLogs, dailyMetrics] = await Promise.all([
      getWellbeingLogs(req.user.id, 'mood', days),
      getWellbeingLogs(req.user.id, 'sleep', days),
      getWellbeingLogs(req.user.id, 'exercise', days),
      getDailyMetrics(req.user.id, days)
    ]);

    // Mood analysis
    const moodCounts = {};
    moodLogs.forEach(l => {
      moodCounts[l.value] = (moodCounts[l.value] || 0) + 1;
    });
    const dominantMood = Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])[0];

    // Sleep analysis
    const sleepValues = sleepLogs.map(l => l.numeric_value).filter(v => v !== null);
    const avgSleep = sleepValues.length > 0
      ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
      : null;

    // Exercise analysis
    const exerciseDays = new Set(exerciseLogs.map(l => l.logged_at.split('T')[0])).size;
    const exerciseFrequency = days > 0 ? Math.round((exerciseDays / days) * 100) : 0;

    // Productivity correlation
    const productiveHours = dailyMetrics.reduce((sum, m) => sum + (m.productive_hours || 0), 0);
    const avgProductivity = dailyMetrics.length > 0
      ? Math.round(productiveHours / dailyMetrics.length * 10) / 10
      : null;

    // Generate insights
    const insights = [];

    if (avgSleep !== null) {
      if (avgSleep < 6) {
        insights.push({
          type: 'warning',
          area: 'sleep',
          message: `Your average sleep is ${avgSleep} hours. Try to get at least 7 hours for better productivity.`
        });
      } else if (avgSleep >= 7 && avgSleep <= 8) {
        insights.push({
          type: 'success',
          area: 'sleep',
          message: `Great sleep habits! Averaging ${avgSleep} hours.`
        });
      }
    }

    if (exerciseFrequency < 40) {
      insights.push({
        type: 'suggestion',
        area: 'exercise',
        message: `You exercised ${exerciseDays} days out of ${days}. Try to aim for at least 3-4 days per week.`
      });
    }

    if (dominantMood && ['stressed', 'anxious', 'tired'].includes(dominantMood[0])) {
      insights.push({
        type: 'warning',
        area: 'mood',
        message: `Your dominant mood has been "${dominantMood[0]}". Consider taking breaks and prioritizing self-care.`
      });
    }

    res.json({
      success: true,
      period_days: days,
      summary: {
        mood: {
          dominant: dominantMood ? dominantMood[0] : null,
          distribution: moodCounts,
          total_logs: moodLogs.length
        },
        sleep: {
          average_hours: avgSleep,
          total_logs: sleepLogs.length
        },
        exercise: {
          days_exercised: exerciseDays,
          frequency_percent: exerciseFrequency,
          total_logs: exerciseLogs.length
        },
        productivity: {
          average_hours: avgProductivity,
          total_tasks_completed: dailyMetrics.reduce((sum, m) => sum + (m.tasks_completed || 0), 0)
        }
      },
      insights
    });
  } catch (error) {
    console.error('Error getting wellbeing summary:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

/**
 * GET /api/wellbeing/today
 * Get today's wellbeing status
 */
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todayLogs = await client.execute({
      sql: `SELECT * FROM wellbeing_logs
            WHERE user_id = ? AND date(logged_at) = ?
            ORDER BY logged_at DESC`,
      args: [req.user.id, today]
    });

    // Group by type
    const byType = {};
    for (const log of todayLogs.rows) {
      if (!byType[log.log_type]) {
        byType[log.log_type] = [];
      }
      byType[log.log_type].push(log);
    }

    // Calculate hydration total
    const hydrationTotal = byType.hydration?.reduce((sum, l) => sum + (l.numeric_value || 0), 0) || 0;

    res.json({
      success: true,
      date: today,
      mood: byType.mood?.[0]?.value || null,
      sleep: byType.sleep?.[0]?.numeric_value || null,
      exercise: byType.exercise?.length > 0,
      hydration_ml: hydrationTotal,
      hydration_glasses: Math.round(hydrationTotal / 250),
      all_logs: todayLogs.rows
    });
  } catch (error) {
    console.error('Error getting today\'s wellbeing:', error);
    res.status(500).json({ error: 'Failed to get today\'s status' });
  }
});

export default router;
