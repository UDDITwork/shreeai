'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'

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
  const [activeTab, setActiveTab] = useState<'today' | 'summary'>('today')

  const moodEmojis: Record<string, string> = {
    great: '😄',
    good: '🙂',
    okay: '😐',
    stressed: '😰',
    tired: '😴',
    anxious: '😟',
    sad: '😢',
    motivated: '💪',
    focused: '🎯',
    happy: '😊',
    excited: '🤩'
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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  const hasAnyData = (todayStatus?.mood || todayStatus?.sleep || todayStatus?.exercise) ||
    (summary?.summary?.mood?.total_logs || summary?.summary?.sleep?.total_logs || summary?.summary?.exercise?.total_logs)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Wellbeing Tracker</h2>
              <p className="text-purple-100 text-sm">Auto-tracked from your conversations</p>
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
            {(['today', 'summary'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-purple-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {tab === 'today' ? "Today's Status" : '7-Day Summary'}
              </button>
            ))}
          </div>
        </div>

        {/* AI Learning Notice */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
          <div className="flex items-center space-x-2 text-blue-700 text-sm">
            <span>🤖</span>
            <span>Wellbeing data is automatically captured when you mention it in chat. Just talk naturally!</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!hasAnyData ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-4">💚</p>
              <p className="font-medium mb-2">No wellbeing data tracked yet</p>
              <p className="text-sm text-gray-400">
                Just tell Shree AI things like:
              </p>
              <div className="mt-4 space-y-2 text-sm text-gray-500">
                <p>"I'm feeling stressed today"</p>
                <p>"Slept only 5 hours last night"</p>
                <p>"Just finished a 30 minute workout"</p>
                <p>"Feeling motivated and energetic!"</p>
              </div>
              <p className="mt-4 text-xs text-gray-400">Your wellbeing stats will automatically appear here!</p>
            </div>
          ) : (
            <>
              {activeTab === 'today' && todayStatus && (
                <div className="space-y-6">
                  {/* Today's Status Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Mood */}
                    <div className="p-4 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border border-yellow-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-600">Mood</span>
                        <span className="text-2xl">{todayStatus.mood ? (moodEmojis[todayStatus.mood] || '🙂') : '❓'}</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-800 capitalize">
                        {todayStatus.mood || 'Not detected'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">From your conversations</p>
                    </div>

                    {/* Sleep */}
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-600">Sleep</span>
                        <span className="text-2xl">😴</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-800">
                        {todayStatus.sleep ? `${todayStatus.sleep} hours` : 'Not mentioned'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">From your conversations</p>
                    </div>

                    {/* Exercise */}
                    <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-600">Exercise</span>
                        <span className="text-2xl">🏃</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-800">
                        {todayStatus.exercise ? 'Yes!' : 'Not logged'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">From your conversations</p>
                    </div>

                    {/* Hydration */}
                    <div className="p-4 bg-gradient-to-br from-cyan-50 to-sky-50 rounded-xl border border-cyan-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-600">Water</span>
                        <span className="text-2xl">💧</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-800">
                        {todayStatus.hydration_glasses || 0} glasses
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Mentioned today</p>
                    </div>
                  </div>

                  {/* Tip */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <p className="text-sm text-purple-700">
                      <span className="font-medium">Tip:</span> Just chat naturally! Say things like "I slept badly" or "feeling great today" and I'll track it automatically.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'summary' && summary && (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-xl">
                      <p className="text-3xl font-bold text-purple-600">
                        {summary.summary.mood.dominant ? (moodEmojis[summary.summary.mood.dominant] || '🙂') : '-'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">Dominant Mood</p>
                      <p className="text-xs text-gray-400 capitalize">{summary.summary.mood.dominant || 'N/A'}</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-xl">
                      <p className="text-3xl font-bold text-blue-600">
                        {summary.summary.sleep.average_hours ? summary.summary.sleep.average_hours.toFixed(1) : '-'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">Avg Sleep</p>
                      <p className="text-xs text-gray-400">hours/night</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-xl">
                      <p className="text-3xl font-bold text-green-600">
                        {summary.summary.exercise.days_exercised || 0}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">Exercise Days</p>
                      <p className="text-xs text-gray-400">out of 7</p>
                    </div>
                  </div>

                  {/* Mood Distribution */}
                  {summary.summary.mood.distribution && Object.keys(summary.summary.mood.distribution).length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Mood Distribution (7 days)</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(summary.summary.mood.distribution).map(([mood, count]) => (
                          <div key={mood} className="px-3 py-1 bg-white rounded-full text-sm border">
                            {moodEmojis[mood] || '🙂'} {mood}: {count}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Data Count */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Data Points Collected</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xl font-bold text-purple-600">{summary.summary.mood.total_logs || 0}</p>
                        <p className="text-xs text-gray-500">Mood logs</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-blue-600">{summary.summary.sleep.total_logs || 0}</p>
                        <p className="text-xs text-gray-500">Sleep logs</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-green-600">{summary.summary.exercise.total_logs || 0}</p>
                        <p className="text-xs text-gray-500">Exercise logs</p>
                      </div>
                    </div>
                  </div>

                  {/* Insights */}
                  {summary.insights && summary.insights.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-700">AI Insights</h3>
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
                  {summary.summary.productivity && (summary.summary.productivity.average_hours > 0 || summary.summary.productivity.total_tasks_completed > 0) && (
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
