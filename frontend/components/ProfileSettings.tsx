'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface UserProfile {
  name: string
  preferred_name: string
  timezone: string
  wake_time: string
  sleep_time: string
  work_start_time: string
  work_end_time: string
  communication_style: string
  interests: string
  short_term_goals: string
  long_term_goals: string
  financial_goal: string
  proactive_enabled: boolean
  wellbeing_enabled: boolean
  morning_briefing_enabled: boolean
  evening_summary_enabled: boolean
  money_focus_mode: boolean
}

interface TimeBlock {
  id: string
  block_name: string
  purpose: string
  start_time: string
  end_time: string
  days_of_week: string
  is_active: boolean
}

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    preferred_name: '',
    timezone: 'Asia/Kolkata',
    wake_time: '07:00',
    sleep_time: '23:00',
    work_start_time: '09:00',
    work_end_time: '18:00',
    communication_style: 'friendly',
    interests: '',
    short_term_goals: '',
    long_term_goals: '',
    financial_goal: '',
    proactive_enabled: true,
    wellbeing_enabled: true,
    morning_briefing_enabled: true,
    evening_summary_enabled: true,
    money_focus_mode: true
  })

  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule' | 'preferences'>('profile')

  const [newBlock, setNewBlock] = useState({
    block_name: '',
    purpose: '',
    start_time: '',
    end_time: '',
    days_of_week: 'mon,tue,wed,thu,fri'
  })

  useEffect(() => {
    loadProfile()
    loadTimeBlocks()
  }, [])

  const loadProfile = async () => {
    try {
      const response = await api.get('/profile')
      if (response.data.profile) {
        setProfile({ ...profile, ...response.data.profile })
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTimeBlocks = async () => {
    try {
      const response = await api.get('/profile/time-blocks')
      setTimeBlocks(response.data.blocks || [])
    } catch (error) {
      console.error('Failed to load time blocks:', error)
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      await api.put('/profile', profile)
      alert('Profile saved successfully!')
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const addTimeBlock = async () => {
    if (!newBlock.block_name || !newBlock.start_time || !newBlock.end_time) {
      alert('Please fill in all required fields')
      return
    }

    try {
      await api.post('/profile/time-blocks', newBlock)
      loadTimeBlocks()
      setNewBlock({
        block_name: '',
        purpose: '',
        start_time: '',
        end_time: '',
        days_of_week: 'mon,tue,wed,thu,fri'
      })
    } catch (error) {
      console.error('Failed to add time block:', error)
    }
  }

  const deleteTimeBlock = async (blockId: string) => {
    try {
      await api.delete(`/profile/time-blocks/${blockId}`)
      loadTimeBlocks()
    } catch (error) {
      console.error('Failed to delete time block:', error)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Profile Settings</h2>
              <p className="text-blue-100 text-sm">Mostly learned from conversations - edit only if needed</p>
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
            {(['profile', 'schedule', 'preferences'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-blue-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* AI Learning Notice */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
          <div className="flex items-center space-x-2 text-blue-700 text-sm">
            <span>🤖</span>
            <span>Your profile is automatically learned from conversations. Manual edits override AI learning.</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Name</label>
                  <input
                    type="text"
                    value={profile.preferred_name}
                    onChange={(e) => setProfile({ ...profile, preferred_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="What should I call you?"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Financial Goal</label>
                <textarea
                  value={profile.financial_goal}
                  onChange={(e) => setProfile({ ...profile, financial_goal: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="e.g., Earn 1 lakh per month through freelancing"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short-term Goals</label>
                <textarea
                  value={profile.short_term_goals}
                  onChange={(e) => setProfile({ ...profile, short_term_goals: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="Goals for next 1-3 months"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Long-term Goals</label>
                <textarea
                  value={profile.long_term_goals}
                  onChange={(e) => setProfile({ ...profile, long_term_goals: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="Goals for next 1-5 years"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interests</label>
                <input
                  type="text"
                  value={profile.interests}
                  onChange={(e) => setProfile({ ...profile, interests: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., AI, startups, coding, fitness"
                />
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wake Time</label>
                  <input
                    type="time"
                    value={profile.wake_time}
                    onChange={(e) => setProfile({ ...profile, wake_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep Time</label>
                  <input
                    type="time"
                    value={profile.sleep_time}
                    onChange={(e) => setProfile({ ...profile, sleep_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Start</label>
                  <input
                    type="time"
                    value={profile.work_start_time}
                    onChange={(e) => setProfile({ ...profile, work_start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work End</label>
                  <input
                    type="time"
                    value={profile.work_end_time}
                    onChange={(e) => setProfile({ ...profile, work_end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Protected Time Blocks */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Protected Time Blocks</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Set blocks of time that should be protected for focused work or study
                </p>

                {/* Existing blocks */}
                <div className="space-y-2 mb-4">
                  {timeBlocks.map((block) => (
                    <div key={block.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div>
                        <span className="font-medium text-gray-800">{block.block_name}</span>
                        <span className="text-gray-500 ml-2 text-sm">
                          {block.start_time} - {block.end_time}
                        </span>
                        {block.purpose && (
                          <span className="text-gray-400 ml-2 text-xs">({block.purpose})</span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteTimeBlock(block.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new block */}
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newBlock.block_name}
                    onChange={(e) => setNewBlock({ ...newBlock, block_name: e.target.value })}
                    placeholder="Block name (e.g., Study Time)"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={newBlock.purpose}
                    onChange={(e) => setNewBlock({ ...newBlock, purpose: e.target.value })}
                    placeholder="Purpose (optional)"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="time"
                    value={newBlock.start_time}
                    onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="time"
                    value={newBlock.end_time}
                    onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  onClick={addTimeBlock}
                  className="mt-3 w-full py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                >
                  + Add Protected Time Block
                </button>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-800">Money Focus Mode</h4>
                  <p className="text-sm text-gray-500">Prioritize income-generating tasks</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.money_focus_mode}
                    onChange={(e) => setProfile({ ...profile, money_focus_mode: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-800">Proactive Suggestions</h4>
                  <p className="text-sm text-gray-500">Get timely suggestions and reminders</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.proactive_enabled}
                    onChange={(e) => setProfile({ ...profile, proactive_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-800">Morning Briefings</h4>
                  <p className="text-sm text-gray-500">Daily briefing at wake time</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.morning_briefing_enabled}
                    onChange={(e) => setProfile({ ...profile, morning_briefing_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-800">Evening Summaries</h4>
                  <p className="text-sm text-gray-500">Daily summary before sleep</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.evening_summary_enabled}
                    onChange={(e) => setProfile({ ...profile, evening_summary_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-800">Wellbeing Check-ins</h4>
                  <p className="text-sm text-gray-500">Track mood, sleep, and exercise</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.wellbeing_enabled}
                    onChange={(e) => setProfile({ ...profile, wellbeing_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Communication Style</label>
                <select
                  value={profile.communication_style}
                  onChange={(e) => setProfile({ ...profile, communication_style: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="friendly">Friendly & Casual</option>
                  <option value="professional">Professional</option>
                  <option value="concise">Brief & Concise</option>
                  <option value="detailed">Detailed & Thorough</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
