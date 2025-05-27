'use client';

import { useState, useEffect } from 'react';
import { Emotion } from '@/components/TARA/TaraEmotionIndicator';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

interface EmotionHistoryEntry {
  emotion: Emotion;
  timestamp: number;
  confidence: number;
}

const EMOTION_HISTORY_KEY = 'emotion_history';
const MAX_HISTORY_ITEMS = 20;

const mapEmotionalStateToEmotion = (
  emotionalState: { 
    stress: number; 
    clarity: number; 
    engagement: number;
  },
  emotionalFeedback?: {
    analysis: string;
    suggestions: string[];
    confidence: number;
  }
): Emotion => {
  const { stress, clarity, engagement } = emotionalState;

  // If stress is very high, indicate anger
  if (stress > 75) {
    return 'angry';
  }

  // If engagement and clarity are both high, indicate happiness
  if (clarity > 65 && engagement > 65) {
    return 'happy';
  }

  // If stress is low and clarity is moderate/high, indicate calmness
  if (stress < 35 && clarity > 50) {
    return 'calm';
  }

  // If engagement is low and stress is moderate/high, indicate sadness
  if (engagement < 40 && stress > 50) {
    return 'sad';
  }

  // Default to neutral
  return 'neutral';
};

export const useEmotionDetection = (conversationId?: string) => {
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('neutral');
  const [emotionHistory, setEmotionHistory] = useState<EmotionHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(EMOTION_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [lastUpdateTime, setLastUpdateTime] = useState(0);

  // Get both emotional state and feedback from Redux store
  const emotionalState = useSelector((state: RootState) => 
    state.communication.emotionalStates.audio?.emotionalState
  );
  
  const audioState = useSelector((state: RootState) => 
    state.communication.audioState
  );

  useEffect(() => {
    if (!emotionalState) return;

    const now = Date.now();
    // Only update every 3 seconds instead of 5 for more responsive updates
    if (now - lastUpdateTime < 3000) return;

    const detectedEmotion = mapEmotionalStateToEmotion(
      emotionalState,
      audioState?.emotionalFeedback
    );
    
    setCurrentEmotion(detectedEmotion);
    setLastUpdateTime(now);

    // Add to history and save to local storage
    setEmotionHistory(prev => {
      const newEntry: EmotionHistoryEntry = {
        emotion: detectedEmotion,
        timestamp: now,
        confidence: audioState?.emotionalFeedback?.confidence || 0.8
      };

      const updatedHistory = [...prev, newEntry].slice(-MAX_HISTORY_ITEMS);
      localStorage.setItem(EMOTION_HISTORY_KEY, JSON.stringify(updatedHistory));
      return updatedHistory;
    });
  }, [emotionalState, audioState?.emotionalFeedback, lastUpdateTime]);

  return {
    currentEmotion,
    emotionHistory,
    isDetecting: !!emotionalState,
    analysis: audioState?.emotionalFeedback?.analysis,
    suggestions: audioState?.emotionalFeedback?.suggestions
  };
};

export default useEmotionDetection; 