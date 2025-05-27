'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, addToHistory, setMode, resetEmotionalStates } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService, IEmotionAnalysisService } from '@/services/emotionAnalysis';
import { EmotionalState } from '@/types/emotions';
import { TrainingDataService } from '@/services/trainingDataService';
import { createPortal } from 'react-dom';
import { debounce } from 'lodash';
import { debugLog, measurePerformance, validateEmotionalState } from '@/utils/debugUtils';
import { TaraEmotionIndicator } from './TARA/TaraEmotionIndicator';

// Extend MediaRecorder type to include durationInterval and stream
declare global {
  interface MediaRecorder {
    readonly stream: MediaStream;
    durationInterval?: NodeJS.Timeout;
  }
  interface Window {
    webkitAudioContext: typeof AudioContext;
    SpeechRecognition: {
      prototype: SpeechRecognition;
      new(): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      prototype: SpeechRecognition;
      new(): SpeechRecognition;
    };
  }
}

interface EmotionalFeedback {
  analysis: string;
  suggestions: string[];
  confidence: number;
}

interface AudioState {
  isRecording: boolean;
  isPlaying: boolean;
  duration: number;
  audioLevel: number;
  timeRemaining: number;
  transcription: string;
  isAnalyzing: boolean;
  emotionalFeedback?: EmotionalFeedback;
  currentlyPlayingId?: string;
  isPlaybackLocked: boolean;
  confidence: number;
}

interface AudioMessage {
  id: string;
  buffer: ArrayBuffer;
  duration: number;
  timestamp: number;
  emotionalState: EmotionalState;
  transcription?: string;
  analysis?: EmotionalFeedback;
  valid?: boolean;
}

// Add TypeScript definitions for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechGrammarList {
  length: number;
  addFromString(string: string, weight?: number): void;
  addFromURI(src: string, weight?: number): void;
  item(index: number): SpeechGrammar;
  [index: number]: SpeechGrammar;
}

interface SpeechGrammar {
  src: string;
  weight: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: SpeechGrammarList;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// Threshold constants for emotional metrics
const EMOTION_THRESHOLDS = {
  stress: {
    low: 35,
    high: 65,
    optimal: { min: 40, max: 55 }
  },
  clarity: {
    low: 45,
    high: 75,
    optimal: { min: 55, max: 70 }
  },
  engagement: {
    low: 40,
    high: 70,
    optimal: { min: 50, max: 65 }
  }
};

const getMetricIndicator = (value: number, metric: keyof typeof EMOTION_THRESHOLDS) => {
  const thresholds = EMOTION_THRESHOLDS[metric];
  if (value < thresholds.low) return "Too Low";
  if (value > thresholds.high) return "Too High";
  if (value >= thresholds.optimal.min && value <= thresholds.optimal.max) return "Good";
  return "Moderate";
};

// Add helper functions for level descriptions
const getStressLevel = (stress: number): string => {
  if (stress < 30) return "Very Relaxed";
  if (stress < 45) return "Relaxed";
  if (stress < 55) return "Moderate";
  if (stress < 70) return "Elevated";
  return "High";
};

const getClarityLevel = (clarity: number): string => {
  if (clarity < 30) return "Unclear";
  if (clarity < 45) return "Somewhat Clear";
  if (clarity < 65) return "Clear";
  if (clarity < 80) return "Very Clear";
  return "Excellent";
};

const getEngagementLevel = (engagement: number): string => {
  if (engagement < 30) return "Low";
  if (engagement < 45) return "Moderate";
  if (engagement < 65) return "Good";
  if (engagement < 80) return "High";
  return "Excellent";
};

// Add MessageSummary component after the interface definitions
interface MessageSummaryProps {
  message: AudioMessage;
  isPlaying: boolean;
}

const MessageSummary: React.FC<MessageSummaryProps> = ({ message, isPlaying }) => {
  const { emotionalState } = message;
  const { stress, clarity, engagement } = emotionalState;

  return (
    <div className="bg-gray-50 p-4 rounded-lg shadow-sm mt-2">
      {/* Emotional Metrics */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm">Stress</span>
            <span className="text-sm">{stress}% - {getStressLevel(stress)}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-300"
              style={{ width: `${stress}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm">Clarity</span>
            <span className="text-sm">{clarity}% - {getClarityLevel(clarity)}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${clarity}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm">Engagement</span>
            <span className="text-sm">{engagement}% - {getEngagementLevel(engagement)}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${engagement}%` }}
            />
          </div>
        </div>
      </div>

      {/* Transcription if available */}
      {message.transcription && (
        <div className="mt-3">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Transcription</h4>
          <p className="text-sm text-gray-600 italic">{message.transcription}</p>
        </div>
      )}

      {/* Analysis and Suggestions */}
      {message.analysis && (
        <div className="mt-3">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Analysis</h4>
          <p className="text-sm text-gray-600">{message.analysis.analysis}</p>
          
          {message.analysis.suggestions.length > 0 && (
            <div className="mt-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Suggestions</h4>
              <ul className="list-disc list-inside text-sm text-gray-600">
                {message.analysis.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Add type declarations at the top of the file
interface CustomMediaRecorder extends MediaRecorder {
  durationInterval?: NodeJS.Timeout;
}

// Constants
const MAX_CHUNKS_STORED = 150; // Store 15 seconds max (at 100ms chunks)
const ANALYSIS_INTERVAL = 500; // Analyze every 500ms
const CHUNK_INTERVAL = 100; // 100ms chunks for smoother analysis
const VISUALIZATION_UPDATE_INTERVAL = 16; // ~60fps for smooth visualization
const generateUniqueId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Component definition
const AudioChat: React.FC = () => {
  const dispatch = useDispatch();
  const { emotionalStates } = useSelector((state: RootState) => state.communication);
  const [audioState, setAudioState] = useState<AudioState>({
    isRecording: false,
    isPlaying: false,
    duration: 0,
    audioLevel: 0,
    timeRemaining: 60,
    transcription: '',
    isAnalyzing: false,
    isPlaybackLocked: false,
    confidence: 0
  });

  const [messages, setMessages] = useState<AudioMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emotionService, setEmotionService] = useState<IEmotionAnalysisService | null>(null);
  const [trainingService, setTrainingService] = useState<TrainingDataService | null>(null);
  const [showTrainingPrompt, setShowTrainingPrompt] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Use refs for values that don't need to trigger re-renders
  const lastAnalysisTimeRef = useRef<number>(0);
  const lastEmotionalStateRef = useRef<EmotionalState>({ stress: 50, clarity: 50, engagement: 50 });
  const analysisInProgressRef = useRef<boolean>(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<CustomMediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerNodeRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add state update debouncing
  const debouncedStateUpdate = useCallback(
    debounce((newState: Partial<AudioState>) => {
      setAudioState(prev => ({ ...prev, ...newState }));
    }, 50),
    []
  );

  // Add emotional state update debouncing
  const debouncedEmotionalStateUpdate = useCallback(
    debounce((state: { emotionalState: EmotionalState; confidence: number; weight: number }) => {
      dispatch(updateEmotionalState(state));
    }, 100),
    [dispatch]
  );

  // Add confidence ref
  const confidenceRef = useRef<number>(30);
  const analysisCountRef = useRef<number>(0);

  // Update the useEffect that syncs emotional state
  useEffect(() => {
    if (audioState.isRecording && emotionalStates.audio) {
      lastEmotionalStateRef.current = emotionalStates.audio.emotionalState;
      
      // Update confidence based on analysis count and duration
      const newConfidence = Math.min(95, Math.max(30,
        30 + // Base confidence
        (analysisCountRef.current * 3) + // More weight on analysis count
        (audioState.duration * 2) + // Longer duration = higher confidence
        (audioChunksRef.current.length > 10 ? 20 : 0) // More chunks = higher confidence
      ));
      
      confidenceRef.current = newConfidence;
      
      debouncedStateUpdate({
        emotionalFeedback: {
          analysis: "Real-time analysis in progress...",
          suggestions: [
            "Keep speaking naturally",
            `Current stress level: ${emotionalStates.audio.emotionalState.stress}% - ${getStressLevel(emotionalStates.audio.emotionalState.stress)}`,
            `Speech clarity: ${emotionalStates.audio.emotionalState.clarity}% - ${getClarityLevel(emotionalStates.audio.emotionalState.clarity)}`,
            `Engagement: ${emotionalStates.audio.emotionalState.engagement}% - ${getEngagementLevel(emotionalStates.audio.emotionalState.engagement)}`
          ],
          confidence: newConfidence
        }
      });
    }
  }, [emotionalStates.audio, audioState.isRecording, audioState.duration]);

  // Update cleanup function
  const cleanupRecording = useCallback(async () => {
    try {
      // Stop visualization first
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Clear intervals
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Stop speech recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error('Error stopping speech recognition:', error);
        }
        recognitionRef.current = null;
      }

      // Stop media recorder
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Stop all media tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        streamRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current?.state !== 'closed') {
        try {
          await audioContextRef.current?.close();
        } catch (error) {
          console.error('Error closing audio context:', error);
        }
        audioContextRef.current = null;
      }

      // Reset all refs
      mediaRecorderRef.current = null;
      analyzerNodeRef.current = null;
      audioChunksRef.current = [];

      // Reset state
      setAudioState(prev => ({
        ...prev,
        isRecording: false,
        isPlaying: false,
        duration: 0,
        audioLevel: 0,
        timeRemaining: 60,
        transcription: '',
        isAnalyzing: false,
        emotionalFeedback: undefined,
        isPlaybackLocked: false,
        confidence: 30
      }));

    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }, []);

  // Add audio context state change handler
  useEffect(() => {
    const handleAudioContextStateChange = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(error => {
          console.error('Error resuming audio context:', error);
        });
      }
    };

    if (audioContextRef.current) {
      audioContextRef.current.onstatechange = handleAudioContextStateChange;
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.onstatechange = null;
      }
    };
  }, []);

  // Update the setupMediaRecorder function
  const setupMediaRecorder = useCallback((recorder: MediaRecorder) => {
    let chunks: Blob[] = [];
    let isProcessing = false;
    let lastProcessedTime = Date.now();
    let queueSize = 0;
    const MAX_QUEUE_SIZE = 3; // Reduced for faster processing
    const MIN_CHUNK_SIZE = 256; // Reduced minimum chunk size for faster analysis
    const ANALYSIS_INTERVAL = 50; // Analyze every 50ms for more frequent updates
    
    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;
      
      chunks.push(event.data);
      audioChunksRef.current = chunks;
      queueSize++;
      
      const now = Date.now();
      if (!isProcessing && now - lastProcessedTime >= ANALYSIS_INTERVAL && queueSize <= MAX_QUEUE_SIZE) {
        isProcessing = true;
        lastProcessedTime = now;
        
        requestAnimationFrame(async () => {
          try {
            // Use last 2 chunks for faster analysis
            const recentChunks = chunks.slice(-2);
            const combinedBlob = new Blob(recentChunks, { type: getSupportedAudioMimeType() });
            
            if (combinedBlob.size > MIN_CHUNK_SIZE) {
              const buffer = await combinedBlob.arrayBuffer();
              const result = await emotionService?.analyzeAudio(buffer);
              
              if (result) {
                analysisCountRef.current++;
                
                // Adjust confidence calculation
                const newConfidence = Math.min(0.95, Math.max(0.3,
                  0.3 + // Base confidence
                  (analysisCountRef.current * 0.1) + // More weight on analysis count
                  (audioState.duration * 0.05) // Less weight on duration
                ));
                
                // More responsive smoothing
                const smoothedState = {
                  stress: smoothValue(result.emotionalState.stress, lastEmotionalStateRef.current.stress, 0.5),
                  clarity: smoothValue(result.emotionalState.clarity, lastEmotionalStateRef.current.clarity, 0.5),
                  engagement: smoothValue(result.emotionalState.engagement, lastEmotionalStateRef.current.engagement, 0.5)
                };
                
                // Update Redux state with proper confidence
                dispatch(updateEmotionalState({
                  emotionalState: smoothedState,
                  confidence: newConfidence,
                  weight: 1.0
                }));
                
                // Update local refs
                lastEmotionalStateRef.current = smoothedState;
                confidenceRef.current = newConfidence * 100;
                
                // Update UI with more detailed feedback
                debouncedStateUpdate({
                  emotionalFeedback: {
                    analysis: result.analysis || "Analyzing your speech patterns...",
                    suggestions: [
                      `Stress level: ${smoothedState.stress}% - ${getStressLevel(smoothedState.stress)}`,
                      `Speech clarity: ${smoothedState.clarity}% - ${getClarityLevel(smoothedState.clarity)}`,
                      `Engagement: ${smoothedState.engagement}% - ${getEngagementLevel(smoothedState.engagement)}`,
                      ...(result.suggestions || ["Continue speaking naturally"])
                    ],
                    confidence: newConfidence * 100
                  }
                });
              }
            }

            // Maintain smaller queue for faster processing
            if (queueSize > MAX_QUEUE_SIZE) {
              chunks = chunks.slice(-MAX_QUEUE_SIZE);
              audioChunksRef.current = chunks;
              queueSize = MAX_QUEUE_SIZE;
            }
          } catch (error) {
            console.error('Error processing audio chunk:', error);
          } finally {
            isProcessing = false;
          }
        });
      }
    };

    recorder.onerror = async (event) => {
      console.error('MediaRecorder error:', event);
      await cleanupRecording();
    };

    // Use smaller timeslices for more frequent updates
    recorder.start(25); // Reduced from 50ms to 25ms
  }, [dispatch, emotionService, cleanupRecording, audioState.duration]);

  // Effect to update mode on mount
  useEffect(() => {
    dispatch(setMode('audio'));
    
    // Initialize with proper state structure
    dispatch(updateEmotionalState({
      emotionalState: { stress: 50, clarity: 50, engagement: 50 },
      confidence: 0.3,
      weight: 1.0
    }));
    
    return () => {
      dispatch(resetEmotionalStates());
    };
  }, [dispatch]);

  // Update analysis function
  const updateAnalysis = useCallback(async (audioData: ArrayBuffer) => {
    if (!emotionService || !audioState.isRecording || analysisInProgressRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastAnalysisTimeRef.current < 50) { // 50ms minimum between analyses
      return;
    }

    analysisInProgressRef.current = true;
    lastAnalysisTimeRef.current = now;

    try {
      const result = await emotionService.analyzeAudio(audioData);
      
      // Smooth the transition from previous state
      const smoothedAnalysis = {
        emotionalState: {
          stress: smoothValue(result.emotionalState.stress, lastEmotionalStateRef.current.stress, 0.7),
          clarity: smoothValue(result.emotionalState.clarity, lastEmotionalStateRef.current.clarity, 0.7),
          engagement: smoothValue(result.emotionalState.engagement, lastEmotionalStateRef.current.engagement, 0.7)
        },
        confidence: confidenceRef.current,
        weight: 1.0
      };

      // Update Redux state
      debouncedEmotionalStateUpdate(smoothedAnalysis);
      
      // Update local refs
      lastEmotionalStateRef.current = smoothedAnalysis.emotionalState;

    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      analysisInProgressRef.current = false;
    }
  }, [emotionService, dispatch, audioState.isRecording]);

  // Add helper functions inside component
  const getSupportedAudioMimeType = () => {
    const preferredTypes = [
      'audio/wav',
      'audio/webm;codecs=pcm',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];

    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  const smoothValue = (newValue: number, oldValue: number, factor: number) => {
    // Increase smoothing factor for more noticeable changes
    return Math.round(oldValue + (newValue - oldValue) * Math.min(1, factor * 1.5));
  };

  // Add refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);

  // Add training data service
  const trainingDataServiceRef = useRef<TrainingDataService | null>(null);

  // Add this state for the analyser node
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [animationFrameId, setAnimationFrameId] = useState<number | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationRef = useRef<number | null>(null);

  // Add storage management utilities
  const STORAGE_KEY = 'audioMessages';
  const MAX_MESSAGES = 10; // Maximum number of messages to store

  // Add performance optimization flags
  const RECORDING_TIMEOUT = 60000; // Increase from 30s to 60s
  const CLEANUP_TIMEOUT = 3000; // 3 seconds timeout for cleanup
  const ANALYSIS_TIMEOUT = 5000;   // Increase from 3s to 5s

  const saveMessagesToStorage = (messages: AudioMessage[]) => {
    try {
      // Keep only the latest MAX_MESSAGES
      const messagesToStore = messages.slice(-MAX_MESSAGES);
      
      // Convert ArrayBuffer to base64 for storage
      const serializedMessages = messagesToStore.map(msg => ({
        ...msg,
        buffer: arrayBufferToBase64(msg.buffer)
      }));
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedMessages));
    } catch (error: unknown) {
      console.error('Error saving messages:', error);
      // If quota exceeded, remove oldest messages until it fits
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        const currentMessages = messages.slice(-Math.floor(MAX_MESSAGES / 2));
        saveMessagesToStorage(currentMessages);
      }
    }
  };

  const loadMessagesFromStorage = (): AudioMessage[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      
      const parsedMessages = JSON.parse(stored);
      return parsedMessages.map((msg: any) => ({
        ...msg,
        buffer: base64ToArrayBuffer(msg.buffer)
      }));
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  };

  // Update error recovery mechanism
  const recoverFromError = async () => {
    try {
      // Stop all ongoing processes
      await cleanupRecording();
      
      // Reset all refs immediately
      mediaRecorderRef.current = null;
      audioContextRef.current = null;
      recognitionRef.current = null;
      audioChunksRef.current = [];
      
      // Cancel any pending animations
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      // Clear canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }

      // Reset state immediately
      setAudioState({
        isRecording: false,
        isPlaying: false,
        duration: 0,
        audioLevel: 0,
        timeRemaining: 60,
        transcription: '',
        isAnalyzing: false,
        emotionalFeedback: undefined,
        isPlaybackLocked: false,
        confidence: 30
      });
      
      setError(null);
      setAnalyserNode(null);
      
      // Reset emotional state with proper structure
      const initialState = {
        emotionalState: { stress: 50, clarity: 50, engagement: 50 },
        confidence: 0.3,
        weight: 1.0
      };
      lastEmotionalStateRef.current = initialState.emotionalState;
      dispatch(updateEmotionalState(initialState));

      // Wait a moment before reinitializing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reinitialize emotion service
      if (emotionService) {
        try {
          await emotionService.reset();
        } catch (e) {
          console.error('Error resetting emotion service:', e);
          setError('Failed to reset emotion analysis. Please refresh the page.');
        }
      }

    } catch (error) {
      console.error('Error during recovery:', error);
      setError('Failed to recover from error. Please refresh the page.');
    }
  };

  // Add error boundary effect
  useEffect(() => {
    const handleError = async () => {
      if (audioState.isRecording) {
        await recoverFromError();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, [audioState.isRecording]);

  // Update the initialization effect
  useEffect(() => {
    const initService = async () => {
      try {
        setError('Initializing emotion analysis...');
        const service = await EmotionAnalysisService.getInstance();
        setEmotionService(service);
        setError(null);
      } catch (error) {
        console.error('Error initializing emotion service:', error);
        setError('Failed to initialize emotion analysis. Please refresh the page.');
      }
    };

    initService();
  }, []);

  useEffect(() => {
    const initTrainingService = async () => {
      const service = TrainingDataService.getInstance();
      trainingDataServiceRef.current = service;
    };
    initTrainingService();
  }, []);

  // Validate a single message
  const validateMessage = (message: AudioMessage): boolean => {
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    
    // Metadata validation
    const hasValidMetadata = typeof message.id === 'string' &&
                           message.id.length > 0 &&
                           typeof message.timestamp === 'number' &&
                           message.timestamp > oneYearAgo &&
                           message.timestamp <= now;

    if (!hasValidMetadata) {
      debugLog.audio('Metadata validation failed', {
        id: typeof message.id,
        idLength: message.id?.length,
        timestamp: typeof message.timestamp,
        timestampValue: message.timestamp,
        timestampTooOld: message.timestamp < oneYearAgo,
        timestampInFuture: message.timestamp > now
      });
      return false;
    }

    // Emotional state validation using shared utility
    if (!validateEmotionalState(message.emotionalState)) {
      debugLog.audio('Emotional state validation failed', {
        emotionalState: message.emotionalState
      });
      return false;
    }

    debugLog.audio('All validations passed');
    return true;
  };

  // Load messages on component mount
  useEffect(() => {
    const storedMessages = loadMessagesFromStorage();
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
    }
  }, []);

  // Update the useEffect that saves messages
  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages]);

  // Utility functions for ArrayBuffer conversion
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const binary = new Uint8Array(buffer);
    const bytes: string[] = [];
    binary.forEach(byte => bytes.push(String.fromCharCode(byte)));
    return btoa(bytes.join(''));
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Update visualization function
  const startVisualization = () => {
    if (!analyzerNodeRef.current || !canvasRef.current) {
      debugLog.audio('Cannot start visualization - missing analyzer or canvas');
      return;
    }

    const analyser = analyzerNodeRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      debugLog.audio('Cannot get canvas context');
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!ctx || !analyser) return;
      
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = 'rgb(20, 24, 33)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const normalizedVolume = average / 255;
      
      // Update audio level in state
      debouncedStateUpdate({
        audioLevel: normalizedVolume * 100
      });

      // Draw visualization
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        const hue = i / bufferLength * 360;
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.8)`;
        
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();
  };

  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  // Update speech recognition setup
  const setupSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Increase reliability with better state management
    let finalTranscript = '';
    let interimTranscript = '';
    let isRestartingRecognition = false;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      finalTranscript = '';
      interimTranscript = '';
      setError(null);
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          // Trigger emotion analysis on final transcripts
          if (emotionService) {
            emotionService.analyzeSpeechContext(finalTranscript.trim()).then(feedback => {
              if (feedback) {
                const newConfidence = Math.min(0.95, Math.max(0.3, confidence));
                debouncedStateUpdate({
                  transcription: finalTranscript.trim(),
                  emotionalFeedback: {
                    analysis: feedback.analysis,
                    suggestions: feedback.suggestions,
                    confidence: feedback.confidence
                  }
                });
              }
            });
          }
        } else {
          interimTranscript = transcript;
        }
      }

      setAudioState(prev => ({
        ...prev,
        transcription: (finalTranscript + interimTranscript).trim()
      }));
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // Attempt to restart recognition
        try {
          recognition.stop();
          setTimeout(() => {
            if (audioState.isRecording) {
              recognition.start();
            }
          }, 1000);
        } catch (e) {
          console.error('Error restarting recognition:', e);
        }
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      // Automatically restart if still recording
      if (audioState.isRecording) {
        try {
          recognition.start();
        } catch (e) {
          console.error('Error restarting recognition:', e);
        }
      }
    };

    return recognition;
  };

  // Start recording function
  const startRecording = async () => {
    if (!emotionService) {
      setError('Emotion analysis service not initialized');
      return;
    }

    try {
      // If already recording, stop first
      if (audioState.isRecording || mediaRecorderRef.current?.state === 'recording') {
        await stopRecording();
        // Wait a brief moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Ensure clean state before starting
      await cleanupRecording();

      const success = await setupAudioRecording();
      if (!success || !mediaRecorderRef.current) {
        throw new Error('Failed to setup audio recording');
      }

      // Initialize speech recognition
      const recognition = setupSpeechRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
      }

      setAudioState(prev => ({
        ...prev,
        isRecording: true,
        duration: 0,
        timeRemaining: 60,
        transcription: '',
        isAnalyzing: false,
        emotionalFeedback: {
          analysis: "Recording started. Begin speaking to see analysis...",
          suggestions: ["Speak naturally to begin analysis"],
          confidence: 30
        }
      }));

      // Only start if we're not already recording
      if (mediaRecorderRef.current.state !== 'recording') {
        mediaRecorderRef.current.start(100);
        startVisualization();
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error instanceof Error ? error.message : 'Failed to start recording');
      await cleanupRecording();
    }
  };

  // Stop recording function
  const stopRecording = async () => {
    try {
      // Only stop if we're actually recording
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopVisualization();
      await cleanupRecording(); // Use the full cleanup instead of just cleanupAudioResources
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError('Failed to stop recording');
    }
  };

  // Add portal rendering logic
  const renderModelTraining = () => {
    const container = document.getElementById('model-training-container');
    if (!container) return null;

    return createPortal(
      <div>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Model Training</h3>
          <span className="text-sm text-gray-400">{messages.length} samples</span>
        </div>
        <p className="text-gray-400 text-sm mt-2">
          {messages.length < 5
            ? `Need ${5 - messages.length} more recording${messages.length === 4 ? '' : 's'} to train`
            : 'Ready for next training cycle'}
        </p>
      </div>,
      container
    );
  };

  const renderConversationInsights = () => {
    const container = document.getElementById('conversation-insights-container');
    if (!container) return null;

    return createPortal(
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Conversation Insights</h3>
        {messages.length > 0 ? (
          <div className="space-y-3">
            {/* Average Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-700/50 rounded-lg p-2">
                <div className="text-sm text-gray-400">Avg. Stress</div>
                <div className="text-lg font-bold text-blue-400">
                  {Math.round(messages.reduce((acc, msg) => acc + msg.emotionalState.stress, 0) / messages.length)}%
                </div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-2">
                <div className="text-sm text-gray-400">Avg. Clarity</div>
                <div className="text-lg font-bold text-green-400">
                  {Math.round(messages.reduce((acc, msg) => acc + msg.emotionalState.clarity, 0) / messages.length)}%
                </div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-2">
                <div className="text-sm text-gray-400">Avg. Engagement</div>
                <div className="text-lg font-bold text-purple-400">
                  {Math.round(messages.reduce((acc, msg) => acc + msg.emotionalState.engagement, 0) / messages.length)}%
                </div>
              </div>
            </div>

            {/* Recent Trends */}
            {messages.length > 1 && (
              <div className="bg-gray-700/50 rounded-lg p-2">
                <h4 className="text-sm font-semibold text-white mb-1">Recent Trends</h4>
                <ul className="text-sm">
                  <li className="text-blue-400">
                    Stress: {
                      messages[messages.length - 1].emotionalState.stress > 
                      messages[messages.length - 2].emotionalState.stress
                      ? '↑ Increasing'
                      : '↓ Decreasing'
                    }
                  </li>
                  <li className="text-green-400">
                    Clarity: {
                      messages[messages.length - 1].emotionalState.clarity > 
                      messages[messages.length - 2].emotionalState.clarity
                      ? '↑ Improving'
                      : '↓ Declining'
                    }
                  </li>
                  <li className="text-purple-400">
                    Engagement: {
                      messages[messages.length - 1].emotionalState.engagement > 
                      messages[messages.length - 2].emotionalState.engagement
                      ? '↑ Increasing'
                      : '↓ Decreasing'
                    }
                  </li>
                </ul>
              </div>
            )}

            {/* Session Summary */}
            <div className="bg-gray-700/50 rounded-lg p-2">
              <p className="text-sm text-gray-300">
                {messages.length} recordings • {
                  Math.round(messages.reduce((acc, msg) => acc + msg.duration, 0))
                }s total
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm italic">
              No insights yet. Record a message to see insights here!
            </p>
          </div>
        )}
      </div>,
      container
    );
  };

  const setupAudioRecording = async (): Promise<boolean> => {
    try {
      // First check if browser supports required APIs
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        throw new Error('Your browser does not support audio recording');
      }

      // Clean up any existing recording session
      await cleanupRecording();

      // Request audio permissions explicitly with optimal settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100,
          sampleSize: 16
        },
        video: false
      });

      // Initialize audio context with high-quality settings
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: 44100
      });
      
      // Create analyzer node with higher precision
      const analyzerNode = audioContextRef.current.createAnalyser();
      analyzerNode.fftSize = 2048;
      analyzerNode.smoothingTimeConstant = 0.8;
      
      // Create gain node for volume control
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 1.0;
      
      // Connect stream to analyzer through gain node
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(gainNode);
      gainNode.connect(analyzerNode);
      analyzerNodeRef.current = analyzerNode;
      
      // Store stream reference
      streamRef.current = stream;

      // Initialize media recorder with optimal settings
      const mimeType = getSupportedAudioMimeType();
      if (!mimeType) {
        throw new Error('No supported audio MIME type found');
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = recorder;
      
      // Initialize emotion service if not already done
      if (!emotionService) {
        const service = await EmotionAnalysisService.getInstance();
        setEmotionService(service);
      }

      // Setup recorder event handlers with improved error handling
      setupMediaRecorder(recorder);

      // Start duration timer with more precise timing
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      
      durationIntervalRef.current = setInterval(() => {
        setAudioState(prev => {
          const newTimeRemaining = prev.timeRemaining - 1;
          const newDuration = prev.duration + 1;
          
          if (newTimeRemaining <= 0) {
            stopRecording();
            return prev;
          }
          
          return {
            ...prev,
            timeRemaining: newTimeRemaining,
            duration: newDuration
          };
        });
      }, 1000);

      return true;
    } catch (error) {
      console.error('Error setting up audio recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to setup audio recording';
      setError(errorMessage);
      await cleanupRecording();
      return false;
    }
  };

  // Add cleanup function for audio resources
  const cleanupAudioResources = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyzerNodeRef.current) {
      analyzerNodeRef.current.disconnect();
      analyzerNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (audioState.currentlyPlayingId) {
        const audio = document.getElementById(audioState.currentlyPlayingId) as HTMLAudioElement;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      }
    };
  }, [cleanupAudioResources, audioState.currentlyPlayingId]);

  // Add real-time analysis component
  const RealTimeAnalysis: React.FC<{ feedback?: EmotionalFeedback }> = ({ feedback }) => {
    if (!feedback) return null;

    return (
      <div className="bg-gray-800 rounded-lg p-4 mt-4">
        <h3 className="text-lg font-semibold text-white mb-2">Real-time Analysis</h3>
        <div className="space-y-4">
          <div>
            <p className="text-gray-300">{feedback.analysis}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Suggestions:</h4>
            <ul className="list-disc list-inside space-y-1">
              {feedback.suggestions.map((suggestion, index) => (
                <li key={index} className="text-gray-300 text-sm">{suggestion}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center mt-2">
            <div className="h-2 flex-grow bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${feedback.confidence}%` }}
              />
            </div>
            <span className="ml-2 text-sm text-gray-400">
              {Math.round(feedback.confidence)}% confidence
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Audio Communication</h2>
        <TaraEmotionIndicator 
          showTimeline={false}
          className="mr-4"
        />
      </div>

      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white mb-2">Record and analyze your speech in real-time</h2>
          {error && (
            <div className="mt-2 text-red-400 text-sm bg-red-900/20 p-2 rounded">{error}</div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={audioState.isRecording ? stopRecording : startRecording}
                  className={`p-4 rounded-full transition-all duration-200 ${
                    audioState.isRecording
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {audioState.isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
                
                {/* Recording Status */}
                {audioState.isRecording && (
                  <div className="text-gray-300">
                    <span className="font-medium">Recording: </span>
                    <span>{audioState.duration}s</span>
                    <span className="mx-2">|</span>
                    <span>Time remaining: {audioState.timeRemaining}s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Audio Visualization */}
            <canvas
              ref={canvasRef}
              className="w-full h-32 bg-gray-900 rounded-lg"
              width={800}
              height={128}
            />

            {/* Transcription */}
            {audioState.transcription && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-white mb-2">Transcription</h3>
                <p className="text-gray-300 italic">{audioState.transcription}</p>
              </div>
            )}

            {/* Real-time Analysis */}
            <RealTimeAnalysis feedback={audioState.emotionalFeedback} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioChat;