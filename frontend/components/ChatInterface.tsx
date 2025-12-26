'use client'

import { useState, useEffect, useRef } from 'react'
import { getSocket } from '@/lib/websocket'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import MessageBubble from './MessageBubble'
import ImageUpload from './ImageUpload'
import ProfileSettings from './ProfileSettings'
import GoalsDashboard from './GoalsDashboard'
import WellbeingDashboard from './WellbeingDashboard'

interface Message {
  id: string
  message: string
  response?: string
  role: 'user' | 'assistant'
  timestamp?: string
  created_at?: string
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [showWellbeing, setShowWellbeing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const socket = getSocket()
  const { user, clearAuth } = useAuthStore()

  useEffect(() => {
    loadHistory()

    if (socket) {
      socket.on('chat_message', (data: Message) => {
        setMessages(prev => [...prev, data])
      })
    }

    return () => {
      if (socket) {
        socket.off('chat_message')
      }
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadHistory = async () => {
    try {
      const response = await api.get('/chat/history')
      setMessages(response.data.conversations || [])
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      message: input,
      role: 'user',
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await api.post('/chat', { message: input })

      const assistantMessage: Message = {
        id: response.data.conversationId,
        message: input,
        response: response.data.response,
        role: 'assistant',
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Failed to send message:', error)
      // Add error message
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        message: '',
        response: 'Sorry, something went wrong. Please try again.',
        role: 'assistant',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    window.location.href = '/login'
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Professional Header */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Shree AI</h1>
                <p className="text-xs text-blue-200">Your Intelligent Assistant</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Quick Access Buttons */}
              <div className="hidden md:flex items-center space-x-2">
                <button
                  onClick={() => setShowGoals(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Goals & Habits"
                >
                  <span className="text-lg">🎯</span>
                </button>
                <button
                  onClick={() => setShowWellbeing(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Wellbeing"
                >
                  <span className="text-lg">💚</span>
                </button>
                <button
                  onClick={() => setShowProfile(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Profile Settings"
                >
                  <span className="text-lg">⚙️</span>
                </button>
              </div>

              {/* Status Indicator */}
              <div className="hidden sm:flex items-center space-x-2 bg-white/10 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-blue-100">Online</span>
              </div>

              {/* User Profile */}
              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium">{user?.email?.split('@')[0] || 'User'}</p>
                  <p className="text-xs text-blue-200">{user?.email}</p>
                </div>
                <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Logout"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Pills */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 py-2 px-4 overflow-x-auto">
        <div className="max-w-6xl mx-auto flex items-center space-x-2">
          <span className="text-xs text-gray-500 mr-2 whitespace-nowrap">Capabilities:</span>
          {['Goals', 'Wellbeing', 'Productivity', 'LinkedIn', 'Sheets', 'Search', 'Email'].map((feature) => (
            <span key={feature} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full whitespace-nowrap border border-blue-100">
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Shree AI</h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Your intelligent assistant for managing ideas, posting to LinkedIn, creating spreadsheets, and more.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                {[
                  { icon: '📝', text: 'Post on LinkedIn about AI trends' },
                  { icon: '📊', text: 'Create a spreadsheet for expenses' },
                  { icon: '🔍', text: 'Search for latest tech news' },
                  { icon: '🎨', text: 'Generate an image for my post' },
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(suggestion.text)}
                    className="flex items-center space-x-2 p-3 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
                  >
                    <span className="text-xl">{suggestion.icon}</span>
                    <span className="text-sm text-gray-700 group-hover:text-blue-700">{suggestion.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 max-w-xs">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  </div>
                  <span className="text-sm text-gray-500">Shree AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form onSubmit={handleSend} className="flex items-center space-x-3">
            <ImageUpload onImageUpload={(url) => {
              setMessages(prev => [...prev, {
                id: Date.now().toString(),
                message: `[Image uploaded]`,
                role: 'user',
                timestamp: new Date().toISOString(),
              }])
            }} />

            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-base transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center space-x-2 font-medium"
            >
              <span>Send</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-3">
            Shree AI can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>

      {/* Modal Dashboards */}
      {showProfile && <ProfileSettings onClose={() => setShowProfile(false)} />}
      {showGoals && <GoalsDashboard onClose={() => setShowGoals(false)} />}
      {showWellbeing && <WellbeingDashboard onClose={() => setShowWellbeing(false)} />}
    </div>
  )
}
