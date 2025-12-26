'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface Goal {
  id: string
  title: string
  description: string
  goal_type: string
  target_value: number
  current_value: number
  unit: string
  target_date: string
  frequency: string
  status: string
  streak_count: number
  best_streak: number
  priority: number
}

interface DailyHabit {
  id: string
  title: string
  completed_today: boolean
  streak_count: number
}

interface IncomeSummary {
  total_earned: number
  best_hourly_rate: number
  top_source: string
}

export default function GoalsDashboard({ onClose }: { onClose: () => void }) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [dailyHabits, setDailyHabits] = useState<DailyHabit[]>([])
  const [incomeSummary, setIncomeSummary] = useState<IncomeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'habits' | 'income'>('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [goalsRes, habitsRes, incomeRes] = await Promise.all([
        api.get('/goals'),
        api.get('/goals/daily-habits'),
        api.get('/profile/income-sources')
      ])

      setGoals(goalsRes.data.goals || [])
      setDailyHabits(habitsRes.data.habits || [])

      if (incomeRes.data.sources?.length > 0) {
        const sources = incomeRes.data.sources
        setIncomeSummary({
          total_earned: sources.reduce((sum: number, s: { total_earned: number }) => sum + (s.total_earned || 0), 0),
          best_hourly_rate: Math.max(...sources.map((s: { hourly_rate: number }) => s.hourly_rate || 0)),
          top_source: sources[0]?.source_name || 'None'
        })
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const logProgress = async (goalId: string, value: number) => {
    try {
      await api.post(`/goals/${goalId}/progress`, { value })
      loadData()
    } catch (error) {
      console.error('Failed to log progress:', error)
    }
  }

  const getProgressPercent = (goal: Goal) => {
    if (!goal.target_value) return 0
    return Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
  }

  const getGoalTypeIcon = (type: string) => {
    switch (type) {
      case 'income_goal': return '💰'
      case 'daily_habit': return '📅'
      case 'weekly_habit': return '📆'
      case 'learning_goal': return '📚'
      case 'savings_goal': return '🏦'
      default: return '🎯'
    }
  }

  const filteredGoals = goals.filter(goal => {
    if (activeTab === 'habits') {
      return goal.goal_type.includes('habit')
    }
    if (activeTab === 'income') {
      return goal.goal_type === 'income_goal' || goal.goal_type === 'savings_goal'
    }
    return true
  })

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Goals & Progress</h2>
              <p className="text-green-100 text-sm">Auto-tracked from your conversations</p>
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
            {(['all', 'habits', 'income'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-green-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {tab === 'all' ? 'All Goals' : tab === 'habits' ? 'Daily Habits' : 'Income Goals'}
              </button>
            ))}
          </div>
        </div>

        {/* AI Learning Notice */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
          <div className="flex items-center space-x-2 text-blue-700 text-sm">
            <span>🤖</span>
            <span>Goals are automatically captured when you mention them in chat. Just talk naturally!</span>
          </div>
        </div>

        {/* Daily Habits Quick View */}
        {activeTab === 'habits' && dailyHabits.length > 0 && (
          <div className="p-4 bg-green-50 border-b">
            <h3 className="text-sm font-medium text-green-800 mb-3">Today's Habits</h3>
            <div className="flex flex-wrap gap-2">
              {dailyHabits.map((habit) => (
                <button
                  key={habit.id}
                  onClick={() => !habit.completed_today && logProgress(habit.id, 1)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    habit.completed_today
                      ? 'bg-green-500 text-white'
                      : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {habit.completed_today ? '✓' : '○'} {habit.title}
                  {habit.streak_count > 0 && (
                    <span className="ml-2 text-xs opacity-75">🔥 {habit.streak_count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Income Summary for Income Tab */}
        {activeTab === 'income' && incomeSummary && (
          <div className="p-4 bg-yellow-50 border-b">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-yellow-700">₹{incomeSummary.total_earned.toLocaleString()}</p>
                <p className="text-xs text-yellow-600">Total Earned</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-700">₹{incomeSummary.best_hourly_rate}/hr</p>
                <p className="text-xs text-yellow-600">Best Rate</p>
              </div>
              <div>
                <p className="text-lg font-bold text-yellow-700">{incomeSummary.top_source}</p>
                <p className="text-xs text-yellow-600">Top Source</p>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Goals List */}
          <div className="space-y-4">
            {filteredGoals.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-4">🎯</p>
                <p className="font-medium mb-2">No goals tracked yet</p>
                <p className="text-sm text-gray-400">
                  Just tell Shree AI things like:
                </p>
                <div className="mt-4 space-y-2 text-sm text-gray-500">
                  <p>"I want to earn 1 lakh this month"</p>
                  <p>"My goal is to exercise daily"</p>
                  <p>"I'm planning to learn Python"</p>
                </div>
                <p className="mt-4 text-xs text-gray-400">Goals will automatically appear here!</p>
              </div>
            ) : (
              filteredGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{getGoalTypeIcon(goal.goal_type)}</span>
                        <h3 className="font-semibold text-gray-800">{goal.title}</h3>
                        {goal.streak_count > 0 && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">
                            🔥 {goal.streak_count} day streak
                          </span>
                        )}
                      </div>
                      {goal.description && (
                        <p className="text-sm text-gray-500 mt-1">{goal.description}</p>
                      )}

                      {/* Progress Bar */}
                      {goal.target_value > 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between text-sm text-gray-500 mb-1">
                            <span>
                              {goal.current_value.toLocaleString()} / {goal.target_value.toLocaleString()} {goal.unit}
                            </span>
                            <span>{getProgressPercent(goal)}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                              style={{ width: `${getProgressPercent(goal)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Target Date */}
                      {goal.target_date && (
                        <p className="text-xs text-gray-400 mt-2">
                          Target: {new Date(goal.target_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Quick Progress Buttons */}
                    <div className="ml-4 flex flex-col space-y-2">
                      {goal.goal_type.includes('habit') ? (
                        <button
                          onClick={() => logProgress(goal.id, 1)}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                        >
                          ✓ Done
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const value = prompt('Enter progress value:')
                            if (value) logProgress(goal.id, parseInt(value))
                          }}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                        >
                          + Update
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Summary Footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-gray-800">{goals.length}</p>
              <p className="text-xs text-gray-500">Goals Tracked</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {goals.filter(g => g.status === 'completed').length}
              </p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-500">
                {Math.max(...goals.map(g => g.streak_count), 0)}
              </p>
              <p className="text-xs text-gray-500">Best Streak</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
