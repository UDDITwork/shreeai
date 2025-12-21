'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
    if (isAuthenticated) {
      router.push('/chat')
    } else {
      router.push('/login')
    }
  }, [isAuthenticated, router, checkAuth])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Smart Idea Manager</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

