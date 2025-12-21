'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/websocket'
import ChatInterface from '@/components/ChatInterface'
import NotificationPopup from '@/components/NotificationPopup'

export default function ChatPage() {
  const router = useRouter()
  const { isAuthenticated, token, checkAuth } = useAuthStore()
  const [notification, setNotification] = useState<any>(null)
  const socketRef = useRef<any>(null)

  useEffect(() => {
    checkAuth()
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    // Connect WebSocket
    const socket = connectSocket(token)
    socketRef.current = socket

    // Listen for reminders
    socket.on('reminder', (data: any) => {
      setNotification(data)
    })

    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated, token, router, checkAuth])

  const handleNotificationClose = () => {
    setNotification(null)
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="h-screen flex flex-col">
      <ChatInterface />
      {notification && (
        <NotificationPopup
          notification={notification}
          onClose={handleNotificationClose}
        />
      )}
    </div>
  )
}

