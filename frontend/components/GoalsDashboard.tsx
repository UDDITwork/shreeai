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

export default function GoalsDashboard({ onClose }: { onClose: () => void }) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [dailyHabits, setDailyHabits] = useState<DailyHabit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'habits' | 'income'>('all')
  const [showAddGoal, setShowAddGoal] = useState(false)

  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    goal_type: 'short_term',
    target_value: 0,
    unit: '',
    target_date: '',
    frequency: 'once'
  })

  useEffect(() => {
    loadGoals()
    loadDailyHabits()
  }, [])

  const loadGoals = async () => {
    try {
      const response = await api.get('/goals')
      setGoals(response.data.goals || [])
    } catch (error) {
      console.error('Failed to load goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDailyHabits = async () => {
    try {
      const response = await api.get('/goals/daily-habits')
      setDailyHabits(response.data.habits || [])
    } catch (error) {
      console.error('Failed to load daily habits:', error)
    }
  }

  const addGoal = async () => {
    if (!newGoal.title) {
      alert('Please enter a goal title')
      return
    }

    try {
      await api.post('/goals', newGoal)
      loadGoals()
      setShowAddGoal(false)
      setNewGoal({
        title: '',
        description: '',
        goal_type: 'short_term',
        target_value: 0,
        unit: '',
        target_date: '',
        frequency: 'once'
      })
    } catch (error) {
      console.error('Failed to add goal:', error)
      alert('Failed to add goal')
    }
  }

  const logProgress = async (goalId: string, value: number) => {
    try {
      await api.post(`/goals/${goalId}/progress`, { value })
      loadGoals()
      loadDailyHabits()
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
              <h2 className="text-2xl font-bold">Goals & Habits</h2>
              <p className="text-green-100 text-sm">Track your progress and build streaks</p>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Add Goal Button */}
          {!showAddGoal && (
            <button
              onClick={() => setShowAddGoal(true)}
              className="w-full mb-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors"
            >
              + Add New Goal
            </button>
          )}

          {/* Add Goal Form */}
          {showAddGoal && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="font-medium text-gray-800 mb-4">Add New Goal</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  placeholder="Goal title"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <textarea
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  placeholder="Description (optional)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newGoal.goal_type}
                    onChange={(e) => setNewGoal({ ...newGoal, goal_type: e.target.value })}
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="short_term">Short-term Goal</option>
                    <option value="long_term">Long-term Goal</option>
                    <option value="daily_habit">Daily Habit</option>
                    <option value="weekly_habit">Weekly Habit</option>
                    <option value="income_goal">Income Goal</option>
                    <option value="savings_goal">Savings Goal</option>
                    <option value="learning_goal">Learning Goal</option>
                  </select>
                  <input
                    type="date"
                    value={newGoal.target_date}
                    onChange={(e) => setNewGoal({ ...newGoal, target_date: e.target.value })}
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={newGoal.target_value || ''}
                    onChange={(e) => setNewGoal({ ...newGoal, target_value: parseInt(e.target.value) || 0 })}
                    placeholder="Target value (e.g., 100000)"
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={newGoal.unit}
                    onChange={(e) => setNewGoal({ ...newGoal, unit: e.target.value })}
                    placeholder="Unit (e.g., INR, hours)"
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setShowAddGoal(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addGoal}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Add Goal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Goals List */}
          <div className="space-y-4">
            {filteredGoals.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-4">🎯</p>
                <p>No goals yet. Add your first goal to get started!</p>
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
                              {goal.current_value} / {goal.target_value} {goal.unit}
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
                        <>
                          <button
                            onClick={() => {
                              const value = prompt('Enter progress value:')
                              if (value) logProgress(goal.id, parseInt(value))
                            }}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                          >
                            + Add
                          </button>
                        </>
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
              <p className="text-xs text-gray-500">Total Goals</p>
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
