import React, { useEffect, useState } from 'react';

interface SettingsButtonProps {
  onClick: () => void;
  className?: string;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({ onClick, className = '' }) => {
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Check API key on mount and when localStorage changes
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('openai_api_key');
      setShowNotification(!apiKey);
    };

    // Initial check
    checkApiKey();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'openai_api_key') {
        checkApiKey();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-full hover:bg-gray-700 transition-colors relative ${className}`}
      aria-label="Settings"
    >
      <svg
        className="w-6 h-6 text-gray-400 hover:text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      {showNotification && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full"></span>
      )}
    </button>
  );
};

export default SettingsButton; 