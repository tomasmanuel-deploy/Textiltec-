import React from 'react';
import { useNotification } from '@/context/NotificationContext';

export function NotificationToast() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 sm:px-0">
      {notifications.map(notification => (
        <div 
          key={notification.id}
          className={`pointer-events-auto w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden transform transition-all duration-300 ease-in-out translate-x-0 opacity-100 mb-2
            ${notification.type === 'error' ? 'border-l-4 border-red-500' : 
              notification.type === 'success' ? 'border-l-4 border-green-500' : 
              notification.type === 'warning' ? 'border-l-4 border-yellow-500' : 
              'border-l-4 border-blue-500'
            }
          `}
        >
          <div className="p-4 w-full">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                {notification.type === 'success' && <span className="text-green-500 text-xl">✓</span>}
                {notification.type === 'error' && <span className="text-red-500 text-xl">⚠</span>}
                {notification.type === 'warning' && <span className="text-yellow-500 text-xl">!</span>}
                {notification.type === 'info' && <span className="text-blue-500 text-xl">ℹ</span>}
              </div>
              <div className="ml-3 w-0 flex-1">
                {notification.title && (
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {notification.title}
                  </p>
                )}
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 break-words">
                  {notification.message}
                </p>
                {notification.action && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={notification.action.onClick}
                      className="bg-white dark:bg-gray-700 rounded-md text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 px-2 py-1 border border-indigo-100"
                    >
                      {notification.action.label}
                    </button>
                  </div>
                )}
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  className="bg-transparent rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
                  onClick={() => removeNotification(notification.id)}
                >
                  <span className="sr-only">Close</span>
                  <span className="text-2xl leading-none">&times;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
