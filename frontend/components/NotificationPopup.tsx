'use client'

interface NotificationPopupProps {
  notification: {
    id: string
    type: string
    message: string
    scheduledTime: string
  }
  onClose: () => void
}

export default function NotificationPopup({ notification, onClose }: NotificationPopupProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-xl font-bold mb-2">Reminder</h2>
        <p className="text-gray-700 mb-4">{notification.message}</p>
        <p className="text-sm text-gray-500 mb-4">
          Scheduled: {new Date(notification.scheduledTime).toLocaleString()}
        </p>
        <div className="flex space-x-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Acknowledge
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

