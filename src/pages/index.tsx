'use client';

import { useEffect, useState, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Head from 'next/head';
import { RootState } from '@/store';
import { setMode } from '@/store/slices/communicationSlice';
import TextChat from '@/components/TextChat';
import AudioChat from '@/components/AudioChat';
import VideoChat from '@/components/VideoChat';
import NavigationBar from '@/components/NavigationBar';
import EmotionAnalysisVisualizer from '@/components/EmotionAnalysisVisualizer';
import DebugPanel from '@/components/DebugPanel';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { EmotionalState } from '@/types/emotions';
import Settings from '@/components/Settings';

// Environment variable to control debug mode (defaults to true in development)
const DEBUG_MODE = false;

// Define types for memoized component props
interface MemoizedEmotionVisualizerProps {
  modalityStates: {
    text?: { emotionalState: EmotionalState; confidence: number; weight: number };
    audio?: { emotionalState: EmotionalState; confidence: number; weight: number };
    video?: { emotionalState: EmotionalState; confidence: number; weight: number };
  };
  emotionalState: EmotionalState;
  confidence: number;
}

// Memoized EmotionAnalysisVisualizer wrapper to prevent unnecessary rerenders
const MemoizedEmotionVisualizer = memo(function MemoizedEmotionVisualizer({
  modalityStates,
  emotionalState,
  confidence
}: MemoizedEmotionVisualizerProps) {
  return (
    <EmotionAnalysisVisualizer
      activeModalities={modalityStates}
      integratedState={emotionalState}
      overallConfidence={confidence}
    />
  );
});

// Dynamic confidence calculation for each modality
function getModalityConfidence(emotionalState: EmotionalState | undefined, modality: 'text' | 'audio' | 'video'): number {
  if (!emotionalState) return 0;
  
  // Base confidence calculation
  const { stress, clarity, engagement } = emotionalState;
  const avgDeviation = (Math.abs(stress - 50) + Math.abs(clarity - 50) + Math.abs(engagement - 50)) / 3;
  
  // Modality-specific adjustments
  let modalityFactor = 1.0;
  switch (modality) {
    case 'audio':
      // Audio confidence is based more heavily on clarity and engagement
      const audioDeviation = (Math.abs(clarity - 50) * 1.2 + Math.abs(engagement - 50) * 1.2 + Math.abs(stress - 50) * 0.6) / 3;
      return Math.min(1, 0.6 + audioDeviation / 100);
    case 'video':
      // Video confidence is based more on engagement and stress
      const videoDeviation = (Math.abs(engagement - 50) * 1.2 + Math.abs(stress - 50) * 1.2 + Math.abs(clarity - 50) * 0.6) / 3;
      return Math.min(1, 0.6 + videoDeviation / 100);
    case 'text':
      // Text confidence is based equally on all metrics
      return Math.min(1, 0.5 + avgDeviation / 100);
    default:
      return Math.min(1, 0.5 + avgDeviation / 100);
  }
}

// Calculate simple insights for audio messages
const getAudioInsights = (messages: any[]) => {
  if (!messages || messages.length === 0) return null;
  const last5 = messages.slice(-5);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stress = avg(last5.map(m => m.emotionalState?.stress ?? 50));
  const clarity = avg(last5.map(m => m.emotionalState?.clarity ?? 50));
  const engagement = avg(last5.map(m => m.emotionalState?.engagement ?? 50));
  return { stress, clarity, engagement, count: last5.length };
};

export default function Home() {
  const dispatch = useDispatch();
  const { mode, emotionalStates, overallConfidence } = useSelector((state: RootState) => state.communication);
  
  // Add local state for navigation
  const [localMode, setLocalMode] = useState<'text' | 'audio' | 'video'>('text');
  const [showDebugPanel, setShowDebugPanel] = useState(DEBUG_MODE);
  
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);

  // Sync Redux state with local state
  useEffect(() => {
    setLocalMode(mode);
  }, [mode]);

  useEffect(() => {
    const initializeService = async () => {
      try {
        const service = await EmotionAnalysisService.getInstance();
        setEmotionService(service);
      } catch (error) {
        console.error('Failed to initialize emotion service:', error);
      }
    };
    initializeService();
  }, []);

  // Calculate integrated emotional state from active modalities
  const calculateIntegratedState = (): EmotionalState => {
    const activeModalities = Object.entries(emotionalStates).filter(([_, state]) => {
      const isRecent = Date.now() - state.lastUpdated < 5000;
      const hasConfidence = state.confidence > 0;
      return isRecent && hasConfidence;
    });

    if (activeModalities.length === 0) {
      return { stress: 50, clarity: 50, engagement: 50 };
    }

    const totalWeight = activeModalities.reduce((sum, [_, state]) => sum + state.weight, 0);
    
    return {
      stress: Math.round(
        activeModalities.reduce((sum, [_, state]) => 
          sum + state.emotionalState.stress * state.weight, 0
        ) / totalWeight
      ),
      clarity: Math.round(
        activeModalities.reduce((sum, [_, state]) => 
          sum + state.emotionalState.clarity * state.weight, 0
        ) / totalWeight
      ),
      engagement: Math.round(
        activeModalities.reduce((sum, [_, state]) => 
          sum + state.emotionalState.engagement * state.weight, 0
        ) / totalWeight
      )
    };
  };

  // Prepare modality states for visualizer
  const modalityStates = {
    text: emotionalStates.text && {
      emotionalState: emotionalStates.text.emotionalState,
      confidence: emotionalStates.text.confidence,
      weight: emotionalStates.text.weight
    },
    audio: emotionalStates.audio && {
      emotionalState: emotionalStates.audio.emotionalState,
      confidence: emotionalStates.audio.confidence,
      weight: emotionalStates.audio.weight
    },
    video: emotionalStates.video && {
      emotionalState: emotionalStates.video.emotionalState,
      confidence: emotionalStates.video.confidence,
      weight: emotionalStates.video.weight
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>AI Communication Companion</title>
        <meta name="description" content="AI-powered communication analysis and feedback" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">AI Communication Companion</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sidebar */}
          <div className="space-y-8">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Communication Mode</h2>
              <NavigationBar
                mode={localMode}
                onModeChange={(newMode) => {
                  setLocalMode(newMode);
                  dispatch(setMode(newMode));
                }}
              />
            </div>

            {/* Emotion Analysis */}
            <MemoizedEmotionVisualizer
              modalityStates={modalityStates}
              emotionalState={calculateIntegratedState()}
              confidence={overallConfidence}
            />
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {localMode === 'text' && <TextChat />}
            {localMode === 'audio' && <AudioChat />}
            {localMode === 'video' && <VideoChat />}
          </div>
        </div>

        {/* Debug Panel */}
        {showDebugPanel && <DebugPanel />}
      </main>
    </div>
  );
} 