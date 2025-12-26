'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface WellbeingLog {
  id: string
  log_type: string
  value: string
  numeric_value: number
  logged_at: string
}

interface WellbeingSummary {
  period_days: number
  summary: {
    mood: {
      dominant: string
      distribution: Record<string, number>
      total_logs: number
    }
    sleep: {
      average_hours: number
      total_logs: number
    }
    exercise: {
      days_exercised: number
      frequency_percent: number
      total_logs: number
    }
    productivity: {
      average_hours: number
      total_tasks_completed: number
    }
  }
  insights: {
    type: string
    area: string
    message: string
  }[]
}

interface TodayStatus {
  date: string
  mood: string | null
  sleep: number | null
  exercise: boolean
  hydration_glasses: number
}

export default function WellbeingDashboard({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState<WellbeingSummary | null>(null)
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'today' | 'summary' | 'log'>('today')

  // Log mood/sleep/exercise forms
  const [showMoodLog, setShowMoodLog] = useState(false)
  const [showSleepLog, setShowSleepLog] = useState(false)
  const [showExerciseLog, setShowExerciseLog] = useState(false)

  const moods = ['great', 'good', 'okay', 'stressed', 'tired', 'anxious', 'sad', 'motivated', 'focused']
  const moodEmojis: Record<string, string> = {
    great: '😄',
    good: '🙂',
    okay: '😐',
    stressed: '😰',
    tired: '😴',
    anxious: '😟',
    sad: '😢',
    motivated: '💪',
    focused: '🎯'
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [summaryRes, todayRes] = await Promise.all([
        api.get('/wellbeing/summary?days=7'),
        api.get('/wellbeing/today')
      ])
      setSummary(summaryRes.data)
      setTodayStatus(todayRes.data)
    } catch (error) {
      console.error('Failed to load wellbeing data:', error)
    } finally {
      setLoading(false)
    }
  }

  const logMood = async (mood: string, notes?: string) => {
    try {
      await api.post('/wellbeing/mood', { mood, notes })
      loadData()
      setShowMoodLog(false)
    } catch (error) {
      console.error('Failed to log mood:', error)
    }
  }

  const logSleep = async (hours: number, quality?: string) => {
    try {
      await api.post('/wellbeing/sleep', { hours, quality })
      loadData()
      setShowSleepLog(false)
    } catch (error) {
      console.error('Failed to log sleep:', error)
    }
  }

  const logExercise = async (type: string, duration: number) => {
    try {
      await api.post('/wellbeing/exercise', { type, duration_minutes: duration })
      loadData()
      setShowExerciseLog(false)
    } catch (error) {
      console.error('Failed to log exercise:', error)
    }
  }

  const logHydration = async () => {
    try {
      await api.post('/wellbeing/hydration', { glasses: 1 })
      loadData()
    } catch (error) {
      console.error('Failed to log hydration:', error)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Wellbeing</h2>
              <p className="text-purple-100 text-sm">Track your mood, sleep, and health</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-2 mt-4">
            {(['today', 'summary', 'log'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-purple-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {tab === 'today' ? "Today's Status" : tab === 'summary' ? '7-Day Summary' : 'Quick Log'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'today' && todayStatus && (
            <div className="space-y-6">
              {/* Today's Status Cards */}
              <div className="grid grid-cols-2 gap-4">
                {/* Mood */}
                <div
                  className="p-4 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border border-yellow-200 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setShowMoodLog(true)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Mood</span>
                    <span className="text-2xl">{todayStatus.mood ? moodEmojis[todayStatus.mood] : '❓'}</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-800 capitalize">
                    {todayStatus.mood || 'Not logged'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Tap to update</p>
                </div>

                {/* Sleep */}
                <div
                  className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setShowSleepLog(true)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Sleep</span>
                    <span className="text-2xl">😴</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-800">
                    {todayStatus.sleep ? `${todayStatus.sleep} hours` : 'Not logged'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Tap to update</p>
                </div>

                {/* Exercise */}
                <div
                  className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setShowExerciseLog(true)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Exercise</span>
                    <span className="text-2xl">🏃</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-800">
                    {todayStatus.exercise ? 'Done!' : 'Not yet'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Tap to log workout</p>
                </div>

                {/* Hydration */}
                <div
                  className="p-4 bg-gradient-to-br from-cyan-50 to-sky-50 rounded-xl border border-cyan-200 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={logHydration}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Water</span>
                    <span className="text-2xl">💧</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-800">
                    {todayStatus.hydration_glasses}/8 glasses
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Tap to add glass</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-600 mb-3">Quick Log</h3>
                <div className="flex flex-wrap gap-2">
                  {moods.slice(0, 5).map((mood) => (
                    <button
                      key={mood}
                      onClick={() => logMood(mood)}
                      className={`px-3 py-2 rounded-full text-sm font-medium transition-all ${
                        todayStatus.mood === mood
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-purple-100'
                      }`}
                    >
                      {moodEmojis[mood]} {mood}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'summary' && summary && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-3xl font-bold text-purple-600">
                    {summary.summary.mood.dominant ? moodEmojis[summary.summary.mood.dominant] : '-'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Dominant Mood</p>
                  <p className="text-xs text-gray-400 capitalize">{summary.summary.mood.dominant || 'N/A'}</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">
                    {summary.summary.sleep.average_hours || '-'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Avg Sleep</p>
                  <p className="text-xs text-gray-400">hours/night</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-3xl font-bold text-green-600">
                    {summary.summary.exercise.days_exercised}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Exercise Days</p>
                  <p className="text-xs text-gray-400">out of 7</p>
                </div>
              </div>

              {/* Mood Distribution */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Mood Distribution (7 days)</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(summary.summary.mood.distribution || {}).map(([mood, count]) => (
                    <div key={mood} className="px-3 py-1 bg-white rounded-full text-sm border">
                      {moodEmojis[mood]} {mood}: {count}
                    </div>
                  ))}
                </div>
              </div>

              {/* Insights */}
              {summary.insights && summary.insights.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">Insights</h3>
                  {summary.insights.map((insight, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg ${
                        insight.type === 'success'
                          ? 'bg-green-50 border border-green-200'
                          : insight.type === 'warning'
                          ? 'bg-yellow-50 border border-yellow-200'
                          : 'bg-blue-50 border border-blue-200'
                      }`}
                    >
                      <p className="text-sm text-gray-700">{insight.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Productivity Correlation */}
              {summary.summary.productivity && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Productivity Correlation</h3>
                  <div className="flex justify-between">
                    <div>
                      <p className="text-2xl font-bold text-purple-600">
                        {summary.summary.productivity.average_hours || 0}
                      </p>
                      <p className="text-xs text-gray-500">Avg productive hours/day</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-pink-600">
                        {summary.summary.productivity.total_tasks_completed || 0}
                      </p>
                      <p className="text-xs text-gray-500">Tasks completed</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'log' && (
            <div className="space-y-4">
              {/* Mood Quick Log */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">How are you feeling?</h3>
                <div className="grid grid-cols-3 gap-2">
                  {moods.map((mood) => (
                    <button
                      key={mood}
                      onClick={() => logMood(mood)}
                      className="p-3 bg-white rounded-lg border hover:border-purple-400 hover:shadow transition-all text-center"
                    >
                      <span className="text-2xl block">{moodEmojis[mood]}</span>
                      <span className="text-xs text-gray-600 capitalize">{mood}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sleep Quick Log */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">How many hours did you sleep?</h3>
                <div className="flex flex-wrap gap-2">
                  {[4, 5, 6, 7, 8, 9, 10].map((hours) => (
                    <button
                      key={hours}
                      onClick={() => logSleep(hours)}
                      className="px-4 py-2 bg-white rounded-lg border hover:border-blue-400 hover:shadow transition-all"
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Exercise Quick Log */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Exercise Log</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { type: 'Walking', duration: 30 },
                    { type: 'Running', duration: 30 },
                    { type: 'Gym', duration: 60 },
                    { type: 'Yoga', duration: 30 },
                  ].map(({ type, duration }) => (
                    <button
                      key={type}
                      onClick={() => logExercise(type, duration)}
                      className="p-3 bg-white rounded-lg border hover:border-green-400 hover:shadow transition-all text-left"
                    >
                      <span className="font-medium">{type}</span>
                      <span className="text-xs text-gray-500 block">{duration} min</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mood Log Modal */}
        {showMoodLog && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold mb-4">How are you feeling?</h3>
              <div className="grid grid-cols-3 gap-2">
                {moods.map((mood) => (
                  <button
                    key={mood}
                    onClick={() => logMood(mood)}
                    className="p-3 bg-gray-50 rounded-lg hover:bg-purple-100 transition-colors text-center"
                  >
                    <span className="text-2xl block">{moodEmojis[mood]}</span>
                    <span className="text-xs text-gray-600 capitalize">{mood}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowMoodLog(false)}
                className="w-full mt-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sleep Log Modal */}
        {showSleepLog && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold mb-4">How many hours did you sleep?</h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {[4, 5, 6, 7, 8, 9, 10].map((hours) => (
                  <button
                    key={hours}
                    onClick={() => logSleep(hours)}
                    className="w-14 h-14 bg-gray-50 rounded-lg hover:bg-blue-100 transition-colors text-lg font-medium"
                  >
                    {hours}h
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowSleepLog(false)}
                className="w-full mt-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Exercise Log Modal */}
        {showExerciseLog && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold mb-4">Log Exercise</h3>
              <div className="space-y-2">
                {[
                  { type: 'Walking', icon: '🚶', duration: 30 },
                  { type: 'Running', icon: '🏃', duration: 30 },
                  { type: 'Gym', icon: '🏋️', duration: 60 },
                  { type: 'Yoga', icon: '🧘', duration: 30 },
                  { type: 'Cycling', icon: '🚴', duration: 45 },
                  { type: 'Swimming', icon: '🏊', duration: 30 },
                ].map(({ type, icon, duration }) => (
                  <button
                    key={type}
                    onClick={() => logExercise(type, duration)}
                    className="w-full p-3 bg-gray-50 rounded-lg hover:bg-green-100 transition-colors flex items-center"
                  >
                    <span className="text-xl mr-3">{icon}</span>
                    <span className="font-medium">{type}</span>
                    <span className="ml-auto text-sm text-gray-500">{duration} min</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowExerciseLog(false)}
                className="w-full mt-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
