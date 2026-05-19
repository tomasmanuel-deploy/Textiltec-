import { useState, useEffect } from 'react';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const { language } = useAppSettings();

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium border border-green-200 dark:border-green-800 transition-all duration-300">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 bg-green-500"></span>
        </span>
        <span className="hidden sm:inline">{t('app.status.online', language)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-800 transition-all duration-300">
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex h-2 w-2 bg-red-500"></span>
      </span>
      <span>{t('app.status.offline', language)}</span>
    </div>
  );
}
