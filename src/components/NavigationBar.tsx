'use client';

import React, { useState } from 'react';
import Settings from './Settings';
import SettingsButton from './SettingsButton';

interface NavigationBarProps {
  mode: 'text' | 'audio' | 'video';
  onModeChange: (mode: 'text' | 'audio' | 'video') => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ mode, onModeChange }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <nav className="space-y-2">
        <button
          className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
            mode === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          onClick={() => onModeChange('text')}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span>Text Chat</span>
        </button>

        <button
          className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
            mode === 'audio' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          onClick={() => onModeChange('audio')}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span>Audio Chat</span>
        </button>

        <button
          className={`w-full flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
            mode === 'video' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          onClick={() => onModeChange('video')}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Video Chat</span>
        </button>

        <div className="mt-4 flex justify-center">
          <SettingsButton onClick={() => setIsSettingsOpen(true)} />
        </div>
      </nav>

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};

export default NavigationBar; 