'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setupAPI } from '@/lib/api'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const status = await setupAPI.checkStatus()
      if (!status.isSetupComplete) {
        router.push('/setup')
      } else {
        // Setup complete, redirect to login or dashboard
        router.push('/login')
      }
    } catch (error) {
      console.error('Failed to check setup status:', error)
      router.push('/setup')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return null
}
