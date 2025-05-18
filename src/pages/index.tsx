import { useEffect, useState, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Head from 'next/head';
import { RootState } from '@/store';
import { setMode, setActive } from '@/store/slices/communicationSlice';
import TextChat from '@/components/TextChat';
import AudioChat from '@/components/AudioChat';
import VideoChat from '@/components/VideoChat';
import NavigationBar from '@/components/NavigationBar';
import EmotionAnalysisVisualizer from '@/components/EmotionAnalysisVisualizer';
import DebugPanel from '@/components/DebugPanel';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { EmotionalState } from '@/types/emotions';

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

export default function Home() {
  const dispatch = useDispatch();
  const { mode, isActive, emotionalStates } = useSelector((state: RootState) => state.communication);
  
  // Add local state for navigation
  const [localMode, setLocalMode] = useState<'text' | 'audio' | 'video'>('text');
  const [localActive, setLocalActive] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(DEBUG_MODE);
  
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<{
    emotionalState: any;
    confidence: number;
    activeModalities: string[];
  }>({
    emotionalState: {
      stress: 50,
      clarity: 50,
      engagement: 50
    },
    confidence: 0,
    activeModalities: []
  });

  // Sync Redux state with local state
  useEffect(() => {
    setLocalMode(mode);
    setLocalActive(isActive);
    console.log('State synchronized - mode:', mode, 'isActive:', isActive);
  }, [mode, isActive]);

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

  useEffect(() => {
    const updateAnalysis = async () => {
      if (emotionService) {
        try {
          console.log('Updating analysis after emotional state change');
          const analysis = emotionService.getCurrentAnalysis();
          
          // Ensure we have default values in case of undefined or NaN values
          const safeEmotionalState = {
            stress: isNaN(analysis.emotionalState?.stress) ? 50 : analysis.emotionalState.stress,
            clarity: isNaN(analysis.emotionalState?.clarity) ? 50 : analysis.emotionalState.clarity,
            engagement: isNaN(analysis.emotionalState?.engagement) ? 50 : analysis.emotionalState.engagement
          };
          
          // Always update the UI regardless of whether values have changed
          console.log('Updating emotion display with values:', safeEmotionalState);
          setCurrentAnalysis({
            ...analysis,
            emotionalState: safeEmotionalState
          });
          
        } catch (error) {
          console.error('Error getting current analysis:', error);
          // Fallback to default values on error
          setCurrentAnalysis(prev => ({
            ...prev,
            emotionalState: {
              stress: 50,
              clarity: 50,
              engagement: 50
            }
          }));
        }
      }
    };
    
    // Initial update
    updateAnalysis();
    
    // Setup interval for less frequent updates (1000ms is enough)
    // This reduces potential flickering between states
    const interval = setInterval(updateAnalysis, 1000);
    
    return () => clearInterval(interval);
  }, [emotionService, emotionalStates]);

  const handleModeSelect = (selectedMode: 'text' | 'audio' | 'video') => {
    console.log('Mode selected:', selectedMode);
    
    // Update both Redux and local state
    try {
      // Update local state immediately for faster UI response
      setLocalMode(selectedMode);
      setLocalActive(true);
      
      // Update Redux state
      dispatch(setActive(true));
      dispatch(setMode(selectedMode));
      console.log('Mode selection complete:', selectedMode);
    } catch (error) {
      console.error('Error during mode selection:', error);
    }
  };

  // Direct function to go to audio chat
  const goToAudioChat = () => {
    console.log('Going directly to audio chat');
    setLocalMode('audio');
    setLocalActive(true);
    dispatch(setActive(true));
    dispatch(setMode('audio'));
  };

  const renderCommunicationInterface = () => {
    console.log('Rendering interface for mode:', localMode);
    switch (localMode) {
      case 'text':
        return <TextChat />;
      case 'audio':
        return <AudioChat />;
      case 'video':
        return <VideoChat />;
      default:
        return <TextChat />; // Default to text chat
    }
  };

  // Calculate active modalities and their weights dynamically
  const getModalitiesWithWeights = () => {
    // Count active modalities
    const activeModalities = Object.entries(emotionalStates).filter(([_, state]) => {
      const emotionState = state as EmotionalState;
      return emotionState.stress !== 50 || emotionState.clarity !== 50 || emotionState.engagement !== 50;
    }).map(([key]) => key);
    
    const activeCount = activeModalities.length;
    console.log('Active modalities:', activeModalities, 'count:', activeCount);
    
    if (activeCount === 0) {
      return {}; // No active modalities
    }
    
    // Calculate weights based on active modalities
    let weights: Record<string, number> = {};
    
    if (activeCount === 1) {
      // If only one modality is active, give it 100% weight
      weights[activeModalities[0]] = 1.0;
    } else if (activeCount === 2) {
      // If two modalities are active, distribute based on reliability (text less reliable)
      activeModalities.forEach(modality => {
        weights[modality] = modality === 'text' ? 0.4 : 0.6;
      });
    } else {
      // Default distribution for all three modalities
      weights['text'] = 0.3;
      weights['audio'] = 0.35;
      weights['video'] = 0.35;
    }
    
    return weights;
  };
  
  // Calculate confidence based on modalities
  const calculateConfidence = () => {
    // First determine which modalities are active
    const activeModalities = Object.entries(emotionalStates).filter(([_, state]) => {
      // Check if state has non-default values
      const emotionState = state as EmotionalState;
      return emotionState.stress !== 50 || emotionState.clarity !== 50 || emotionState.engagement !== 50;
    }).map(([key]) => key);
    
    const activeCount = activeModalities.length;
    
    // Base confidence is higher when using more modalities
    let baseConfidence = 0;
    
    if (activeCount === 1) {
      // Single modality - if it's text only, boost confidence a bit
      baseConfidence = activeModalities[0] === 'text' ? 0.65 : 0.5;
    } else if (activeCount === 2) {
      baseConfidence = 0.75; // Two modalities
    } else if (activeCount === 3) {
      baseConfidence = 0.85; // All modalities
    }
    
    // If we're in text mode specifically, further boost confidence
    if (mode === 'text' && activeModalities.includes('text')) {
      baseConfidence = Math.min(0.85, baseConfidence + 0.15);
    }
    
    return baseConfidence;
  };

  const modalityWeights = getModalitiesWithWeights();
  const calculatedConfidence = calculateConfidence();
  
  const modalityStates = {
    text: emotionalStates.text && modalityWeights['text'] ? {
      emotionalState: {
        stress: emotionalStates.text.stress,
        clarity: emotionalStates.text.clarity,
        engagement: emotionalStates.text.engagement
      },
      confidence: calculatedConfidence,
      weight: modalityWeights['text'],
    } : undefined,
    audio: emotionalStates.audio && modalityWeights['audio'] ? {
      emotionalState: {
        stress: emotionalStates.audio.stress,
        clarity: emotionalStates.audio.clarity,
        engagement: emotionalStates.audio.engagement
      },
      confidence: calculatedConfidence,
      weight: modalityWeights['audio'],
    } : undefined,
    video: emotionalStates.video && modalityWeights['video'] ? {
      emotionalState: {
        stress: emotionalStates.video.stress,
        clarity: emotionalStates.video.clarity,
        engagement: emotionalStates.video.engagement
      },
      confidence: calculatedConfidence,
      weight: modalityWeights['video'],
    } : undefined,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>AI Communication Companion</title>
        <meta name="description" content="Enhance your communication with AI-powered emotional intelligence" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Debug info - only shown in development mode */}
      {DEBUG_MODE && (
        <div className="bg-yellow-200 p-2 text-black text-sm flex justify-between items-center">
          <div>
            Debug: Redux Mode: {mode} | Redux Active: {isActive.toString()} | Local Mode: {localMode} | Local Active: {localActive.toString()}
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={goToAudioChat}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-xs"
            >
              Go To Audio Chat
            </button>
            <button 
              onClick={() => {
                const debugBanner = document.querySelector('.bg-yellow-200');
                if (debugBanner) {
                  debugBanner.classList.add('hidden');
                }
              }}
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-2 rounded text-xs"
            >
              Hide Debug
            </button>
          </div>
        </div>
      )}

      {localActive ? (
        <>
          <NavigationBar />
          <main className="container mx-auto px-4 pb-12">
            <div className="max-w-4xl mx-auto">
              <div className="mb-16">
                {renderCommunicationInterface()}
              </div>
              <div className="mt-16 pb-8">
                <MemoizedEmotionVisualizer
                  modalityStates={modalityStates}
                  emotionalState={emotionalStates[mode]}
                  confidence={calculatedConfidence}
                />
                
                {/* Toggle button for debug panel */}
                {DEBUG_MODE && (
                  <div className="text-center mt-4">
                    <button
                      onClick={() => setShowDebugPanel(!showDebugPanel)}
                      className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      {showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel'}
                    </button>
                  </div>
                )}
              </div>
              
              {showDebugPanel && (
                <div className="mb-16">
                  <DebugPanel />
                </div>
              )}
            </div>
          </main>
        </>
      ) : (
        <main className="container mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-center text-gray-900 mb-8">
            AI Communication Companion
          </h1>

          <div className="max-w-2xl mx-auto">
            <div className="card p-6">
              <h2 className="text-2xl font-semibold mb-4">Choose Communication Mode</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  className="btn-primary flex items-center justify-center space-x-2"
                  onClick={() => handleModeSelect('text')}
                >
                  <span>Text Chat</span>
                </button>
                <button
                  className="btn-primary flex items-center justify-center space-x-2"
                  onClick={() => handleModeSelect('audio')}
                >
                  <span>Audio Chat</span>
                </button>
                <button
                  className="btn-primary flex items-center justify-center space-x-2"
                  onClick={() => handleModeSelect('video')}
                >
                  <span>Video Call</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              <div className="card p-6">
                <h3 className="text-xl font-semibold mb-3">Emotion-Aware</h3>
                <p className="text-gray-600">
                  Real-time detection of emotional states and conversation dynamics
                </p>
              </div>
              <div className="card p-6">
                <h3 className="text-xl font-semibold mb-3">Privacy-First</h3>
                <p className="text-gray-600">
                  Local processing with user-controlled data sharing
                </p>
              </div>
              <div className="card p-6">
                <h3 className="text-xl font-semibold mb-3">Smart Insights</h3>
                <p className="text-gray-600">
                  Automated summaries and actionable communication suggestions
                </p>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
} 