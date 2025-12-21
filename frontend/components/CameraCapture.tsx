'use client'

import { useRef, useState } from 'react'
import api from '@/lib/api'

interface CameraCaptureProps {
  onCapture: (url: string) => void
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setIsActive(true)
    } catch (error) {
      console.error('Camera access error:', error)
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return

      const formData = new FormData()
      formData.append('file', blob, 'camera-photo.jpg')

      try {
        const response = await api.post('/uploads', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })

        onCapture(response.data.filePath)
        stopCamera()
      } catch (error) {
        console.error('Upload failed:', error)
      }
    })
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    setIsActive(false)
  }

  return (
    <div>
      {!isActive ? (
        <button
          onClick={startCamera}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          📸 Camera
        </button>
      ) : (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg">
            <video ref={videoRef} autoPlay className="max-w-full max-h-96" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex space-x-2 mt-4">
              <button
                onClick={capturePhoto}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Capture
              </button>
              <button
                onClick={stopCamera}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

