import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEmotionDetection } from '@/hooks/useEmotionDetection';

export type Emotion = 'calm' | 'happy' | 'sad' | 'angry' | 'neutral';

interface EmotionConfig {
  emoji: string;
  color: string;
  label: string;
  description: string;
}

const emotionConfigs: Record<Emotion, EmotionConfig> = {
  calm: {
    emoji: '😌',
    color: 'bg-blue-500',
    label: 'Calm',
    description: 'Feeling relaxed and composed'
  },
  happy: {
    emoji: '😊',
    color: 'bg-yellow-500',
    label: 'Happy',
    description: 'Expressing joy and positivity'
  },
  sad: {
    emoji: '😢',
    color: 'bg-slate-500',
    label: 'Sad',
    description: 'Showing signs of sadness'
  },
  angry: {
    emoji: '😠',
    color: 'bg-red-500',
    label: 'Angry',
    description: 'Displaying frustration or anger'
  },
  neutral: {
    emoji: '😐',
    color: 'bg-gray-500',
    label: 'Neutral',
    description: 'Maintaining a neutral expression'
  }
};

interface TaraEmotionIndicatorProps {
  showTimeline?: boolean;
  conversationId?: string;
  className?: string;
}

export const TaraEmotionIndicator: React.FC<TaraEmotionIndicatorProps> = ({
  showTimeline = false,
  conversationId,
  className = ''
}) => {
  const { currentEmotion, emotionHistory, analysis, suggestions } = useEmotionDetection(conversationId);
  const [showTooltip, setShowTooltip] = useState(false);

  const config = emotionConfigs[currentEmotion];

  return (
    <div className={`relative ${className}`}>
      {/* Main Emotion Indicator */}
      <motion.div
        className="relative cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className={`rounded-full p-2 shadow-lg ${config.color} bg-opacity-20 dark:bg-opacity-30`}
        >
          <motion.span
            className="text-2xl select-none"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            key={currentEmotion}
          >
            {config.emoji}
          </motion.span>
        </div>

        {/* Pulse Animation Ring */}
        <motion.div
          className={`absolute inset-0 rounded-full ${config.color} bg-opacity-30 dark:bg-opacity-20`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 0 }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeOut"
          }}
        />

        {/* Enhanced Tooltip with Analysis */}
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 z-50 min-w-[250px]"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col gap-2">
                <div className="font-medium text-gray-900 dark:text-white">
                  {config.label}
                </div>
                {analysis && (
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {analysis}
                  </div>
                )}
                {suggestions && suggestions.length > 0 && (
                  <div className="mt-1">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Suggestions:
                    </div>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                      {suggestions.map((suggestion: string, index: number) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Timeline removed as requested */}
    </div>
  );
};

export default TaraEmotionIndicator; 