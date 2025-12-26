'use client'

interface Message {
  id: string
  message: string
  response?: string
  role: 'user' | 'assistant'
  timestamp?: string
  created_at?: string
}

interface MessageBubbleProps {
  message: Message
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const content = message.response || message.message
  const timeStr = formatTime(message.timestamp || message.created_at)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-end space-x-2 max-w-[85%] lg:max-w-[70%] ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
        }`}>
          {isUser ? 'U' : 'AI'}
        </div>

        {/* Message Bubble */}
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-br-md'
              : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md'
          }`}
        >
          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
            isUser ? 'text-white' : 'text-gray-800'
          }`}>
            {content}
          </p>
          {timeStr && (
            <p className={`text-xs mt-2 ${
              isUser ? 'text-blue-100' : 'text-gray-400'
            }`}>
              {timeStr}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
