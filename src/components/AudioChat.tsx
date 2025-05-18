import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, addToHistory, EmotionalState, setMode } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';

// Extend MediaRecorder type to include durationInterval
declare global {
  interface MediaRecorder {
    durationInterval?: NodeJS.Timeout;
  }
  interface Window {
    webkitAudioContext: typeof AudioContext;
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
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
}

interface AudioMessage {
  id: string;
  buffer: ArrayBuffer;
  duration: number;
  timestamp: number;
  emotionalState: EmotionalState;
  valid?: boolean; // Track message validity
}

// Add TypeScript definitions for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
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

// Define the constructor interface
declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

declare var webkitSpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof webkitSpeechRecognition;
  }
}

export default function AudioChat() {
  const dispatch = useDispatch();
  const [audioState, setAudioState] = useState<AudioState>({
    isRecording: false,
    isPlaying: false,
    duration: 0,
    audioLevel: 0,
    timeRemaining: 30,
    transcription: '',
    isAnalyzing: false
  });
  const [messages, setMessages] = useState<AudioMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const { emotionalStates } = useSelector((state: RootState) => state.communication);
  const currentEmotionalState = emotionalStates.audio;
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Initialize emotion service
  useEffect(() => {
    const initService = async () => {
      try {
        setError('Initializing emotion analysis...');
        const service = await EmotionAnalysisService.getInstance();
        setEmotionService(service);
        setIsModelReady(true);
        setError(null);
        // Set mode to audio when component mounts
        dispatch(setMode('audio'));
      } catch (error) {
        console.error('Error initializing emotion service:', error);
        setError('Failed to initialize emotion analysis. Please refresh the page.');
        setIsModelReady(false);
      }
    };

    initService();
    
    // Reset mode when component unmounts
    return () => {
      dispatch(setMode('text'));
    };
  }, [dispatch]);

  // Validate a single message
  const validateMessage = (message: AudioMessage): boolean => {
    try {
      debugLog('Starting message validation', {
        messageId: message?.id,
        hasBuffer: !!message?.buffer,
        bufferType: message?.buffer ? message.buffer.constructor.name : 'none',
        bufferSize: message?.buffer?.byteLength || 0,
        duration: message?.duration,
        timestamp: message?.timestamp,
        emotionalState: JSON.stringify(message?.emotionalState)
      });

      // Basic message structure check
      if (!message) {
        debugLog('❌ Invalid message: null or undefined');
        return false;
      }

      // Buffer validation with more comprehensive checks
      const hasValidBuffer = message.buffer && 
                           message.buffer instanceof ArrayBuffer && 
                           message.buffer.byteLength > 100 && // Minimum size check
                           message.buffer.byteLength < 10 * 1024 * 1024; // Max 10MB
      
      if (!hasValidBuffer) {
        debugLog('❌ Buffer validation failed', {
          exists: !!message.buffer,
          isArrayBuffer: message.buffer instanceof ArrayBuffer,
          size: message.buffer?.byteLength,
          tooSmall: message.buffer?.byteLength < 100,
          tooLarge: message.buffer?.byteLength > 10 * 1024 * 1024
        });
        return false;
      } else {
        debugLog('✅ Buffer validation passed');
      }

      // Duration validation
      const hasValidDuration = typeof message.duration === 'number' &&
                             message.duration > 0 &&
                             message.duration <= 300; // Max 5 minutes
      
      if (!hasValidDuration) {
        debugLog('❌ Duration validation failed', {
          type: typeof message.duration,
          value: message.duration
        });
        return false;
      }

      // Metadata validation with timestamp range check
      const now = Date.now();
      const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
      const hasValidMetadata = typeof message.id === 'string' &&
                             message.id.length > 0 &&
                             typeof message.timestamp === 'number' &&
                             message.timestamp > oneYearAgo &&
                             message.timestamp <= now;

      if (!hasValidMetadata) {
        debugLog('❌ Metadata validation failed', {
          id: typeof message.id,
          idLength: message.id?.length,
          timestamp: typeof message.timestamp,
          timestampValue: message.timestamp,
          timestampTooOld: message.timestamp < oneYearAgo,
          timestampInFuture: message.timestamp > now
        });
        return false;
      }

      // Emotional state validation
      const hasValidEmotionalState = message.emotionalState &&
                                   typeof message.emotionalState === 'object' &&
                                   'stress' in message.emotionalState &&
                                   'clarity' in message.emotionalState &&
                                   'engagement' in message.emotionalState &&
                                   Object.values(message.emotionalState).every(value => 
                                     typeof value === 'number' &&
                                     !isNaN(value) &&
                                     isFinite(value) &&
                                     value >= 0 &&
                                     value <= 100
                                   );

      if (!hasValidEmotionalState) {
        debugLog('❌ Emotional state validation failed', {
          exists: !!message.emotionalState,
          type: typeof message.emotionalState,
          values: message.emotionalState
        });
        return false;
      }

      debugLog('✅ All validations passed');
      return true;

    } catch (error) {
      debugLog('❌ Error during message validation:', error);
      return false;
    }
  };

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('audioMessages');
      if (savedMessages) {
        debugLog('Loading saved messages from storage');
        const parsedMessages = JSON.parse(savedMessages);
        
        // Convert and validate each message
        const validMessages = parsedMessages
          .map((msg: any) => {
            try {
              const message = {
                ...msg,
                buffer: base64ToArrayBuffer(msg.buffer)
              };
              const isValid = validateMessage(message);
              return isValid ? { ...message, valid: true } : null;
            } catch (error) {
              debugLog('Error converting message:', error);
              return null;
            }
          })
          .filter(Boolean);

        debugLog('Loaded messages', {
          total: parsedMessages.length,
          valid: validMessages.length
        });

        if (validMessages.length > 0) {
          setMessages(validMessages);
        } else {
          localStorage.removeItem('audioMessages');
        }
      }
    } catch (error) {
      console.error('Error loading saved messages:', error);
      localStorage.removeItem('audioMessages');
    }
  }, []);

  // Save messages to localStorage when updated
  useEffect(() => {
    try {
      // Only save valid messages
      const validMessages = messages.filter(validateMessage);
      
      if (validMessages.length !== messages.length) {
        debugLog('Some messages were invalid', {
          total: messages.length,
          valid: validMessages.length
        });
        // Update state to remove invalid messages
        setMessages(validMessages);
      }

      if (validMessages.length > 0) {
        const messagesToStore = validMessages.map(msg => ({
          ...msg,
          buffer: arrayBufferToBase64(msg.buffer)
        }));
        localStorage.setItem('audioMessages', JSON.stringify(messagesToStore));
        debugLog('Saved messages to storage', { count: validMessages.length });
      } else {
        localStorage.removeItem('audioMessages');
      }
    } catch (error) {
      console.error('Error saving messages:', error);
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

  useEffect(() => {
    setupAudioRecording();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Clean up media stream tracks
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Add debug logging utility
  const debugLog = (message: string, data?: any) => {
    console.log(`[AudioChat Debug] ${message}`, data || '');
  };

  const createAudioElement = (blob: Blob): Promise<HTMLAudioElement> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'auto';
      
      audio.addEventListener('error', (e) => {
        debugLog('Audio element error:', e);
        reject(new Error('Failed to load audio file'));
      });

      audio.addEventListener('loadeddata', () => {
        resolve(audio);
      });

      audio.src = URL.createObjectURL(blob);
    });
  };

  const playMessageWithWebAudio = async (arrayBuffer: ArrayBuffer): Promise<void> => {
    let audioContext: AudioContext | null = null;
    let source: AudioBufferSourceNode | null = null;

    try {
      debugLog('Starting Web Audio playback');
      audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: 48000
      });

      debugLog('Decoding audio data');
      // Create a copy of the array buffer to prevent "neutered ArrayBuffer" errors
      const bufferCopy = arrayBuffer.slice(0);
      const audioBuffer = await audioContext.decodeAudioData(bufferCopy);
      
      debugLog('Creating audio source', {
        duration: audioBuffer.duration,
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate
      });

      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      return new Promise<void>((resolve, reject) => {
        if (!source) {
          reject(new Error('Audio source not initialized'));
          return;
        }

        source.onended = () => {
          debugLog('Playback ended normally');
          setAudioState(prev => ({ ...prev, isPlaying: false }));
          if (audioContext) {
            audioContext.close().catch(err => {
              debugLog('Error closing audio context:', err);
            });
          }
          resolve();
        };

        source.addEventListener('error', (event: Event) => {
          debugLog('Playback error event:', event);
          if (audioContext) {
            audioContext.close().catch(err => {
              debugLog('Error closing audio context:', err);
            });
          }
          reject(new Error('Audio playback failed'));
        });

        try {
          const startTime = audioContext?.currentTime || 0;
          source.start(startTime);
          debugLog('Started playback at time:', startTime);
        } catch (error) {
          debugLog('Error starting playback:', error);
          reject(error);
        }
      });

    } catch (error) {
      debugLog('Web Audio playback error:', error);
      if (audioContext) {
        await audioContext.close().catch(err => {
          debugLog('Error closing audio context:', err);
        });
      }
      throw error;
    }
  };

  const playMessageWithAudioElement = async (blob: Blob): Promise<void> => {
    try {
      debugLog('Creating audio element for playback');
      const audio = new Audio();
      audio.preload = 'auto';
      
      const playPromise = new Promise<void>((resolve, reject) => {
        audio.addEventListener('ended', () => {
          debugLog('Audio element playback ended');
          URL.revokeObjectURL(audio.src);
          setAudioState(prev => ({ ...prev, isPlaying: false }));
          resolve();
        }, { once: true });

        audio.addEventListener('error', (e) => {
          debugLog('Audio element error:', e);
          URL.revokeObjectURL(audio.src);
          setAudioState(prev => ({ ...prev, isPlaying: false }));
          reject(new Error('Audio element playback failed'));
        }, { once: true });

        audio.addEventListener('canplaythrough', async () => {
          try {
            debugLog('Audio can play through, starting playback');
            await audio.play();
          } catch (error) {
            debugLog('Error during audio.play():', error);
            reject(error);
          }
        }, { once: true });
      });

      audio.src = URL.createObjectURL(blob);
      return playPromise;

    } catch (error) {
      debugLog('Audio element playback error:', error);
      throw error;
    }
  };

  const cleanupAudio = () => {
    debugLog('Cleaning up audio playback');
    
    // Stop and cleanup current audio element
    if (currentAudioRef.current) {
      try {
        const audio = currentAudioRef.current;
        audio.pause();
        audio.currentTime = 0;
        
        // Remove all event listeners
        audio.onended = null;
        audio.onpause = null;
        audio.onplay = null;
        audio.onerror = null;
        audio.oncanplaythrough = null;
        
        // Clear the source and release object URL if it exists
        if (audio.src) {
          const url = audio.src;
          audio.src = '';
          URL.revokeObjectURL(url);
        }
        
        currentAudioRef.current = null;
        debugLog('Audio element cleaned up');
      } catch (error) {
        debugLog('Error during audio cleanup:', error);
      }
    }

    // Reset audio state
    setAudioState(prev => ({ 
      ...prev, 
      isPlaying: false,
      audioLevel: 0
    }));

    // Reset emotional state when playback ends
    dispatch(updateEmotionalState({
      stress: 0,
      clarity: 0,
      engagement: 0
    }));
  };

  const playMessage = async (message: AudioMessage) => {
    if (!validateMessage(message)) {
      debugLog('Attempted to play invalid message', { messageId: message.id });
      setError('Invalid message data. The message may be corrupted.');
      setMessages(prev => prev.filter(m => m.id !== message.id));
      return;
    }

    debugLog('Playing message', {
      id: message.id,
      bufferSize: message.buffer.byteLength,
      duration: message.duration,
      timestamp: message.timestamp,
      emotionalState: message.emotionalState
    });

    // Stop any current playback first
    if (audioState.isPlaying) {
      debugLog('Stopping current playback');
      cleanupAudio();
    }

    try {
      // Validate audio data
      if (!message.buffer || message.buffer.byteLength === 0) {
        throw new Error('Invalid audio data: Empty buffer');
      }

      // Create blob from buffer with correct MIME type
      const blob = new Blob([message.buffer], { type: 'audio/webm;codecs=opus' });
      if (blob.size === 0) {
        throw new Error('Invalid audio data: Empty blob');
      }

      debugLog('Created blob for playback', { 
        size: blob.size,
        type: blob.type
      });

      // Create URL for the blob
      const url = URL.createObjectURL(blob);
      debugLog('Created blob URL for playback', { url });

      // Create and configure audio element
      const audio = new Audio();
      currentAudioRef.current = audio;
      audio.preload = 'auto';

      // Update emotional state before playback starts
      dispatch(updateEmotionalState(message.emotionalState));

      // Set up event listeners
      const playbackPromise = new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          debugLog('Cleaning up after playback');
          audio.removeEventListener('ended', handleEnded);
          audio.removeEventListener('error', handleError);
          audio.removeEventListener('canplaythrough', handleCanPlay);
          URL.revokeObjectURL(url);
          audio.src = '';
          currentAudioRef.current = null;
          setAudioState(prev => ({ ...prev, isPlaying: false }));
          
          // Reset emotional state when playback ends
          dispatch(updateEmotionalState({
            stress: 0,
            clarity: 0,
            engagement: 0
          }));
        };

        const handleEnded = () => {
          debugLog('Playback completed normally');
          cleanup();
          resolve();
        };

        const handleError = (e: Event) => {
          const mediaError = (e.target as HTMLAudioElement).error;
          const errorMessage = mediaError 
            ? `Audio playback failed: ${mediaError.code} - ${mediaError.message}`
            : 'Audio playback failed: Unknown error';
          
          debugLog('Audio playback error:', {
            error: errorMessage,
            mediaError,
            audioState: audio.readyState,
            currentTime: audio.currentTime,
            duration: audio.duration,
            paused: audio.paused,
            ended: audio.ended,
            networkState: audio.networkState
          });

          cleanup();
          reject(new Error(errorMessage));
        };

        const handleCanPlay = async () => {
          debugLog('Audio can play through', {
            duration: audio.duration,
            readyState: audio.readyState
          });
          try {
            await audio.play();
          } catch (error) {
            handleError(new ErrorEvent('error', { error }));
          }
        };

        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);
        audio.addEventListener('canplaythrough', handleCanPlay);

        // Set timeout for loading
        setTimeout(() => {
          if (audio.readyState === 0) {
            cleanup();
            reject(new Error('Audio loading timeout - failed to load audio data'));
          }
        }, 5000);
      });

      // Start loading the audio
      audio.src = url;
      setAudioState(prev => ({ ...prev, isPlaying: true }));
      setError(null);

      await playbackPromise;

    } catch (error) {
      console.error('Playback error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to play audio message';
      setError(errorMessage);
      
      // Ensure cleanup happens on error
      cleanupAudio();
    }
  };

  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const setupAudioRecording = async () => {
    const maxSetupRetries = 3;
    let setupRetryCount = 0;
    let lastError: Error | null = null;

    while (setupRetryCount < maxSetupRetries) {
      try {
        debugLog(`Audio setup attempt ${setupRetryCount + 1}/${maxSetupRetries}`);
        
        // Clean up any existing resources first
        await cleanupRecording();

        // Check browser capabilities
        if (!navigator.mediaDevices) {
          throw new Error('Media devices not supported. Please try a different browser.');
        }

        if (!window.AudioContext && !window.webkitAudioContext) {
          throw new Error('AudioContext not supported. Please try a different browser.');
        }

        if (!window.MediaRecorder) {
          throw new Error('MediaRecorder not supported. Please try a different browser.');
        }

        // Create AudioContext with error handling
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass({
          latencyHint: 'interactive',
          sampleRate: 48000
        });

        // Ensure AudioContext is running
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
          if (audioContext.state === 'suspended') {
            throw new Error('Failed to resume AudioContext');
          }
        }

        // Request audio with specific constraints and fallbacks
        const constraints: MediaStreamConstraints = {
          audio: {
            channelCount: { ideal: 1, min: 1 },
            sampleRate: { ideal: 48000, min: 44100 },
            sampleSize: { ideal: 16, min: 16 },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        };

        debugLog('Requesting media with constraints:', constraints);
        
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (streamError) {
          // Try fallback constraints if initial request fails
          debugLog('Initial media request failed, trying fallback constraints');
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        if (!mediaStream) {
          throw new Error('Failed to get media stream');
        }

        const tracks = mediaStream.getAudioTracks();
        if (tracks.length === 0) {
          throw new Error('No audio tracks available');
        }

        // Enable tracks and verify they are active
        const activeTrackPromises = tracks.map(async (track) => {
          track.enabled = true;
          // Wait briefly to ensure track is actually enabled
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!track.enabled || track.muted) {
            throw new Error(`Failed to enable track: ${track.label}`);
          }
          return track;
        });

        await Promise.all(activeTrackPromises);

        debugLog('Audio tracks:', tracks.map(t => ({
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          constraints: t.getConstraints()
        })));

        // Set up audio processing chain with error checking
        const source = audioContext.createMediaStreamSource(mediaStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.5;
        analyser.minDecibels = -70;
        analyser.maxDecibels = -10;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.5;

        try {
          source.connect(gainNode);
          gainNode.connect(analyser);
        } catch (connectionError: unknown) {
          const errorMessage = connectionError instanceof Error 
            ? connectionError.message 
            : 'Failed to connect audio nodes';
          throw new Error(errorMessage);
        }

        // Verify MediaRecorder support for codec
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          throw new Error('WebM with Opus codec is not supported in this browser.');
        }

        // Create and configure MediaRecorder with real-time processing
        const recorder = new MediaRecorder(mediaStream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 256000
        });

        // Handle data as it comes in
        recorder.ondataavailable = async (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            // Keep only the last 5 seconds of audio for analysis
            if (audioChunksRef.current.length > 25) { // 25 chunks at 200ms = 5 seconds
              audioChunksRef.current.shift();
            }
          }
        };

        // Verify recorder is in correct initial state
        if (recorder.state !== 'inactive') {
          throw new Error(`Invalid initial recorder state: ${recorder.state}`);
        }

        // Store references
        mediaRecorderRef.current = recorder;
        audioContextRef.current = audioContext;

        // Set up audio level monitoring with error recovery
        const setupAudioMonitoring = () => {
          if (!analyser) return;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let consecutiveErrors = 0;
          const maxConsecutiveErrors = 3;

          const updateAudioLevel = () => {
            if (!analyser || !audioState.isRecording) return;

            try {
              analyser.getByteFrequencyData(dataArray);
              consecutiveErrors = 0; // Reset error count on success
              
              // Calculate average level with focus on speech frequencies
              let sum = 0;
              let count = 0;
              
              const startFreq = Math.floor(100 * analyser.frequencyBinCount / (audioContext.sampleRate || 48000));
              const endFreq = Math.ceil(4000 * analyser.frequencyBinCount / (audioContext.sampleRate || 48000));
              
              for (let i = startFreq; i < endFreq; i++) {
                const freqWeight = 1.0 - Math.abs((i - (startFreq + endFreq) / 2) / (endFreq - startFreq));
                sum += dataArray[i] * freqWeight;
                count++;
              }

              const average = count > 0 ? sum / count : 0;
              const normalizedLevel = Math.min(100, (average / 255) * 200);
              
              const smoothingFactor = normalizedLevel > audioState.audioLevel ? 0.3 : 0.1;
              const smoothedLevel = audioState.audioLevel * (1 - smoothingFactor) + normalizedLevel * smoothingFactor;
              
              const scaledLevel = Math.pow(smoothedLevel / 100, 0.8) * 100;

              setAudioState(prev => ({
                ...prev,
                audioLevel: Math.max(0, Math.min(100, scaledLevel))
              }));

            } catch (error) {
              consecutiveErrors++;
              debugLog(`Audio monitoring error (${consecutiveErrors}/${maxConsecutiveErrors}):`, error);
              
              if (consecutiveErrors >= maxConsecutiveErrors) {
                debugLog('Too many consecutive errors, stopping audio monitoring');
                return;
              }
            }

            if (audioState.isRecording) {
              requestAnimationFrame(updateAudioLevel);
            }
          };

          updateAudioLevel();
        };

        // Set up recorder event handlers with error recovery
        recorder.onstart = () => {
          debugLog('Recording started successfully');
          audioChunksRef.current = [];
          setupAudioMonitoring();
        };

        recorder.onerror = (event) => {
          const error = event.error || new Error('Unknown recorder error');
          debugLog('MediaRecorder error:', error);
          
          // Attempt recovery
          cleanupRecording().then(() => {
            setupAudioRecording();
          }).catch(cleanupError => {
            debugLog('Failed to recover from MediaRecorder error:', cleanupError);
            setError('Recording error. Please try again.');
          });
        };

        debugLog('Audio setup completed successfully');
        setError(null);
        return true;

      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error('Unknown setup error');
        setupRetryCount++;
        
        if (setupRetryCount < maxSetupRetries) {
          debugLog(`Setup attempt ${setupRetryCount} failed, retrying...`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * setupRetryCount));
        } else {
          debugLog('All setup attempts failed:', error);
          await cleanupRecording();
          setError(error instanceof Error ? error.message : 'Failed to setup audio recording');
          return false;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    return false;
  };

  const cleanupRecording = async () => {
    debugLog('Starting cleanup of recording resources');

    // Reset audio state but preserve emotional state
    setAudioState(prev => ({
      ...prev,
      isRecording: false,
      isPlaying: false,
      audioLevel: 0,
      timeRemaining: 30,
      duration: 0,
      transcription: '',
      isAnalyzing: false
    }));

    // Stop speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (error) {
        debugLog('Error stopping speech recognition:', error);
      }
    }

    // Track cleanup status
    const cleanupStatus = {
      mediaRecorder: false,
      audioContext: false,
      tracks: false
    };

    try {
      // Stop and cleanup media recorder
      if (mediaRecorderRef.current) {
        try {
          // Stop recording if active
          if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.stop();
            debugLog('Stopped active MediaRecorder');
          }
          
          // Clear all intervals and timeouts
          if (mediaRecorderRef.current.durationInterval) {
            clearInterval(mediaRecorderRef.current.durationInterval);
            mediaRecorderRef.current.durationInterval = undefined;
          }

          // Remove all event listeners
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstart = null;
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.onerror = null;
          mediaRecorderRef.current.onpause = null;
          mediaRecorderRef.current.onresume = null;

          // Stop and cleanup all tracks
          if (mediaRecorderRef.current.stream) {
            const tracks = mediaRecorderRef.current.stream.getTracks();
            debugLog(`Cleaning up ${tracks.length} media tracks`);
            
            await Promise.all(tracks.map(async (track) => {
              try {
                track.stop();
                track.enabled = false;
                debugLog(`Stopped track: ${track.kind} - ${track.label}`);
              } catch (trackError) {
                debugLog(`Error stopping track ${track.kind}:`, trackError);
              }
            }));
            
            cleanupStatus.tracks = true;
          }

          mediaRecorderRef.current = null;
          cleanupStatus.mediaRecorder = true;
          debugLog('MediaRecorder cleanup completed');
        } catch (recorderError) {
          debugLog('Error during MediaRecorder cleanup:', recorderError);
        }
      }

      // Close audio context with retry
      if (audioContextRef.current) {
        try {
          const maxRetries = 3;
          let retryCount = 0;
          
          while (retryCount < maxRetries) {
            try {
              if (audioContextRef.current.state !== 'closed') {
                await audioContextRef.current.close();
                debugLog('AudioContext closed successfully');
                break;
              } else {
                debugLog('AudioContext already closed');
                break;
              }
            } catch (closeError) {
              retryCount++;
              debugLog(`AudioContext close attempt ${retryCount} failed:`, closeError);
              if (retryCount === maxRetries) throw closeError;
              await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            }
          }
          
          audioContextRef.current = null;
          cleanupStatus.audioContext = true;
        } catch (contextError) {
          debugLog('Error during AudioContext cleanup:', contextError);
        }
      }

      // Reset state
      setAudioState(prev => ({
        ...prev,
        isRecording: false,
        isPlaying: false,
        audioLevel: 0,
        timeRemaining: 30,
        duration: 0
      }));

      // Clear chunks and release memory
      if (audioChunksRef.current.length > 0) {
        audioChunksRef.current.forEach(chunk => {
          try {
            // Explicitly revoke any object URLs that might have been created
            if (chunk instanceof Blob) {
              URL.revokeObjectURL(URL.createObjectURL(chunk));
            }
          } catch (error) {
            debugLog('Error cleaning up audio chunk:', error);
          }
        });
        audioChunksRef.current = [];
      }

      debugLog('Cleanup completed', cleanupStatus);
    } catch (error) {
      debugLog('Error during cleanup:', error);
      throw error;
    }
  };

  // Update the speech recognition setup with proper types
  const setupSpeechRecognition = () => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // Handle interim results for more responsive feedback
      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const currentTranscript = finalTranscript + interimTranscript;
        
        setAudioState(prev => ({
          ...prev,
          transcription: currentTranscript,
          isAnalyzing: true,
          emotionalFeedback: prev.emotionalFeedback || {
            analysis: "Analyzing your speech...",
            suggestions: ["Continue speaking naturally"],
            confidence: 50
          }
        }));

        // Trigger analysis even with interim results for more responsive feedback
        if (currentTranscript && emotionService) {
          try {
            const feedback = await emotionService.analyzeSpeechContext(
              `Speech: "${currentTranscript}"
              Stress Level: ${currentEmotionalState.stress}%
              Clarity: ${currentEmotionalState.clarity}%
              Engagement: ${currentEmotionalState.engagement}%`
            );
            
            setAudioState(prev => ({
              ...prev,
              emotionalFeedback: feedback,
              isAnalyzing: false
            }));
          } catch (error) {
            console.error('Error analyzing speech:', error);
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        debugLog('Speech recognition error:', event.error);
        // Attempt to restart recognition on error
        if (event.error === 'network' || event.error === 'service-not-allowed') {
          try {
            recognition.stop();
            setTimeout(() => {
              recognition.start();
            }, 1000);
          } catch (e) {
            debugLog('Error restarting recognition:', e);
          }
        }
      };

      recognition.onend = () => {
        // Attempt to restart recognition if still recording
        if (audioState.isRecording) {
          try {
            recognition.start();
          } catch (e) {
            debugLog('Error restarting recognition:', e);
          }
        }
      };

      recognitionRef.current = recognition;
    } else {
      debugLog('Speech recognition not supported in this browser');
    }
  };

  // Add LLM analysis function
  const analyzeSpeechContext = async (
    transcription: string,
    emotionalState: EmotionalState
  ): Promise<EmotionalFeedback> => {
    try {
      if (!emotionService) {
        return {
          analysis: "Unable to analyze speech context - service not initialized",
          suggestions: [],
          confidence: 0
        };
      }

      // Format the prompt for the LLM
      const prompt = `
        Analyze the following speech and emotional metrics:
        
        Speech: "${transcription}"
        
        Emotional Metrics:
        - Stress Level: ${emotionalState.stress}%
        - Clarity: ${emotionalState.clarity}%
        - Engagement: ${emotionalState.engagement}%
        
        Provide a brief analysis of the speaker's emotional state and communication effectiveness.
        Also suggest up to 2 ways they could improve their communication.
        Format as JSON with fields: analysis (string), suggestions (array of strings), confidence (number 0-100)
      `;

      // Call your LLM service here
      const response = await emotionService.analyzeSpeechContext(prompt);
      return response;
    } catch (error) {
      debugLog('LLM analysis error:', error);
      return {
        analysis: "Unable to analyze speech context",
        suggestions: [],
        confidence: 0
      };
    }
  };

  // Modify startRecording to include improved timer and analysis sync
  const startRecording = async () => {
    if (!emotionService) {
      setError('Emotion analysis is initializing. Please wait a moment and try again.');
      return;
    }

    if (!isModelReady) {
      setError('Emotion analysis is not ready. Please wait a moment and try again.');
      return;
    }

    try {
      debugLog('Starting new recording');
      
      // Clean up any existing recording first
      await cleanupRecording();
      
      const success = await setupAudioRecording();
      if (!success || !mediaRecorderRef.current) {
        throw new Error('Failed to setup audio recording');
      }

      const startTime = Date.now();
      const MAX_DURATION = 30; // 30 seconds maximum

      // Initialize with default state
      setAudioState(prev => ({ 
        ...prev, 
        isRecording: true,
        duration: 0,
        timeRemaining: MAX_DURATION,
        isAnalyzing: false,
        transcription: '',
        emotionalFeedback: {
          analysis: "Recording started. Begin speaking to see analysis...",
          suggestions: ["Speak naturally to begin analysis"],
          confidence: 75
        }
      }));

      // Start speech recognition with improved error handling
      setupSpeechRecognition();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          debugLog('Error starting speech recognition:', error);
        }
      }

      setError(null);
      
      // Start recording with smaller chunk size for more frequent updates
      mediaRecorderRef.current.start(100);

      // Set up real-time emotion analysis with better sync
      let analysisInProgress = false;
      let lastLLMUpdate = Date.now();
      const LLM_UPDATE_INTERVAL = 300; // Fast updates for responsive feedback
      let lastEmotionalState = { ...currentEmotionalState };

      // Improved timer handling
      if (mediaRecorderRef.current.durationInterval) {
        clearInterval(mediaRecorderRef.current.durationInterval);
      }

      mediaRecorderRef.current.durationInterval = setInterval(() => {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - startTime) / 1000;
        const remainingTime = Math.max(0, MAX_DURATION - elapsedTime);
        
        setAudioState(prev => ({ 
          ...prev, 
          duration: elapsedTime,
          timeRemaining: remainingTime
        }));

        // Handle recording end
        if (remainingTime <= 0) {
          clearInterval(mediaRecorderRef.current?.durationInterval);
          stopRecording();
          setError('Maximum recording duration reached (30 seconds)');
        } else if (remainingTime <= 5) {
          setError(`Recording will end in ${Math.ceil(remainingTime)} seconds`);
        }
      }, 100);

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          if (!analysisInProgress) {
            analysisInProgress = true;
            try {
              const combinedBlob = new Blob(audioChunksRef.current.slice(-5), { type: 'audio/webm;codecs=opus' });
              const buffer = await combinedBlob.arrayBuffer();
              
              const analysis = await emotionService.analyzeAudio(buffer);
              const currentTime = Date.now();

              // Prevent sudden large changes in emotional values
              const smoothedAnalysis = {
                stress: smoothValue(analysis.stress, lastEmotionalState.stress, 0.7),
                clarity: smoothValue(analysis.clarity, lastEmotionalState.clarity, 0.7),
                engagement: smoothValue(analysis.engagement, lastEmotionalState.engagement, 0.7)
              };
              
              // Update emotional state
              dispatch(updateEmotionalState(smoothedAnalysis));
              lastEmotionalState = smoothedAnalysis;

              // Update LLM analysis if we have transcription and values have changed significantly
              if (audioState.transcription && 
                  (currentTime - lastLLMUpdate >= LLM_UPDATE_INTERVAL || 
                   hasSignificantChange(smoothedAnalysis, lastEmotionalState))) {
                const feedback = await emotionService.analyzeSpeechContext(
                  `Speech: "${audioState.transcription}"
                  Stress Level: ${smoothedAnalysis.stress}%
                  Clarity: ${smoothedAnalysis.clarity}%
                  Engagement: ${smoothedAnalysis.engagement}%`
                );
                
                setAudioState(prev => ({
                  ...prev,
                  emotionalFeedback: feedback,
                  isAnalyzing: false
                }));
                
                lastLLMUpdate = currentTime;
              }
            } catch (error) {
              console.error('Error in real-time analysis:', error);
            } finally {
              analysisInProgress = false;
            }
          }
        }
      };

      // Add cleanup handler
      mediaRecorderRef.current.onstop = () => {
        if (mediaRecorderRef.current?.durationInterval) {
          clearInterval(mediaRecorderRef.current.durationInterval);
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording. Please try again.';
      setError(errorMessage);
      console.error('Error starting recording:', error);
      await cleanupRecording();
    }
  };

  // Helper function to smooth value changes
  const smoothValue = (newValue: number, oldValue: number, factor: number) => {
    return Math.round(oldValue + (newValue - oldValue) * factor);
  };

  // Helper function to detect significant changes in emotional state
  const hasSignificantChange = (newState: EmotionalState, oldState: EmotionalState) => {
    const threshold = 5; // 5% change threshold
    return Math.abs(newState.stress - oldState.stress) > threshold ||
           Math.abs(newState.clarity - oldState.clarity) > threshold ||
           Math.abs(newState.engagement - oldState.engagement) > threshold;
  };

  // Modify stopRecording to use cleanupRecording
  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !audioState.isRecording) {
      debugLog('❌ Cannot stop recording - no active recorder or not recording');
      return;
    }

    try {
      debugLog('🎤 Stopping recording', {
        recorderState: mediaRecorderRef.current.state,
        duration: audioState.duration,
        chunks: audioChunksRef.current.length
      });

      // Preserve the current emotional state
      const finalEmotionalState = { ...currentEmotionalState };

      // Get final chunk of audio data with extended timeout
      const finalDataPromise = new Promise<void>((resolve, reject) => {
        if (!mediaRecorderRef.current) return resolve();
        
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for final audio chunk'));
        }, 5000);

        const handleDataAvailable = (event: BlobEvent) => {
          clearTimeout(timeout);
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            debugLog('Received final audio chunk', { 
              size: event.data.size,
              type: event.data.type,
              totalChunks: audioChunksRef.current.length
            });
          }
          resolve();
        };

        mediaRecorderRef.current.addEventListener('dataavailable', handleDataAvailable, { once: true });
      });

      // Stop recording and wait for final data
      mediaRecorderRef.current.stop();
      await finalDataPromise;

      // Verify we have audio data with more lenient size check
      const totalSize = audioChunksRef.current.reduce((size, chunk) => size + chunk.size, 0);
      debugLog('Total recorded audio size:', { totalSize });

      if (totalSize < 100) { // More lenient minimum size
        throw new Error('Insufficient audio data recorded. Please try speaking louder or closer to the microphone.');
      }

      // Create blob with all chunks
      const audioBlob = new Blob(audioChunksRef.current, { 
        type: 'audio/webm;codecs=opus' 
      });

      debugLog('Created audio blob', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      // Convert to array buffer with retry
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await audioBlob.arrayBuffer();
      } catch (error) {
        debugLog('First attempt to get array buffer failed, retrying...');
        await new Promise(resolve => setTimeout(resolve, 100));
        arrayBuffer = await audioBlob.arrayBuffer();
      }
      
      if (arrayBuffer.byteLength < 100) {
        throw new Error('Audio data is too small. Please try speaking louder or closer to the microphone.');
      }

      debugLog('Converted to array buffer', {
        byteLength: arrayBuffer.byteLength
      });

      setIsAnalyzing(true);
      try {
        if (!emotionService) {
          throw new Error('Emotion analysis service not initialized');
        }

        debugLog('📝 Creating new message');
        const newMessage: AudioMessage = {
          id: Date.now().toString(),
          buffer: arrayBuffer,
          duration: audioState.duration,
          timestamp: Date.now(),
          emotionalState: finalEmotionalState, // Use the preserved emotional state
          valid: true
        };

        debugLog('🔍 Performing initial validation');
        if (!validateMessage(newMessage)) {
          debugLog('⚠️ Initial validation failed, using baseline values');
          setMessages(prev => [...prev, newMessage]);
          dispatch(updateEmotionalState(newMessage.emotionalState));
          return;
        }
        debugLog('✅ Initial validation passed');

        try {
          debugLog('🧠 Starting emotion analysis');
          const analysis = await emotionService.analyzeAudio(arrayBuffer);
          debugLog('✅ Emotion analysis complete', {
            stress: analysis.stress,
            clarity: analysis.clarity,
            engagement: analysis.engagement
          });

          // Validate analysis values before updating
          const validatedState = {
            stress: !isNaN(analysis.stress) && isFinite(analysis.stress) ? analysis.stress : 55,
            clarity: !isNaN(analysis.clarity) && isFinite(analysis.clarity) ? analysis.clarity : 54,
            engagement: !isNaN(analysis.engagement) && isFinite(analysis.engagement) ? analysis.engagement : 58
          };

          newMessage.emotionalState = validatedState;
          debugLog('✅ Validated emotional state:', validatedState);
        } catch (analysisError) {
          debugLog('⚠️ Emotion analysis failed, using baseline values', analysisError);
          // Keep using the default baseline values
        }

        debugLog('🔍 Performing final validation');
        if (!validateMessage(newMessage)) {
          debugLog('⚠️ Final validation failed, using baseline values');
          setMessages(prev => [...prev, newMessage]);
          dispatch(updateEmotionalState(newMessage.emotionalState));
          return;
        }
        debugLog('✅ Final validation passed');

        debugLog('💾 Saving message and updating state');
        setMessages(prev => [...prev, newMessage]);
        dispatch(updateEmotionalState(newMessage.emotionalState));
        dispatch(addToHistory({
          message: `Audio message recorded (${Math.round(newMessage.duration)}s)`,
          emotionalState: newMessage.emotionalState,
        }));
        
        setError(null);
        debugLog('✅ Recording process completed successfully');
        
      } catch (error) {
        debugLog('❌ Error during recording process:', error);
        // Keep the final emotional state even if there's an error
        dispatch(updateEmotionalState(finalEmotionalState));
        throw error;
      } finally {
        setIsAnalyzing(false);
        await cleanupRecording();
      }

    } catch (error) {
      console.error('Error stopping recording:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to process recording. Please try again.';
      setError(errorMessage);
      await cleanupRecording();
    }
  };

  // Add cleanup of invalid messages periodically
  useEffect(() => {
    const cleanup = () => {
      setMessages(prev => prev.filter(validateMessage));
    };

    // Run cleanup every minute
    const interval = setInterval(cleanup, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-[600px] card">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Recording status and transcription */}
        {audioState.isRecording && (
          <div className="space-y-4">
            {/* Essential Recording Info */}
            <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-600">
                    {Math.ceil(audioState.timeRemaining)}s remaining
                  </span>
                </div>
              </div>

              {/* Microphone Level - Essential for user feedback */}
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    audioState.audioLevel < 5 ? 'bg-red-500' :
                    audioState.audioLevel < 15 ? 'bg-yellow-500' :
                    audioState.audioLevel > 85 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${audioState.audioLevel}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-400">
                <span>Too Low</span>
                <span>Good</span>
                <span>Too High</span>
              </div>
            </div>

            {/* Transcription Display */}
            <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
              <p className="text-gray-600 italic min-h-[3em]">
                {audioState.transcription || 'Listening...'}
              </p>
            </div>

            {/* Emotion Analysis with LLM Feedback */}
            <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
              <div className="space-y-4">
                {/* Emotion Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Stress</div>
                    <div className="text-lg font-medium text-gray-700">
                      {currentEmotionalState.stress}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Clarity</div>
                    <div className="text-lg font-medium text-gray-700">
                      {currentEmotionalState.clarity}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Engagement</div>
                    <div className="text-lg font-medium text-gray-700">
                      {currentEmotionalState.engagement}%
                    </div>
                  </div>
                </div>

                {/* LLM Analysis */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Communication Analysis
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {audioState.emotionalFeedback?.analysis || "Waiting for speech..."}
                  </p>
                  {(audioState.emotionalFeedback?.suggestions && 
                    (audioState.emotionalFeedback.suggestions.length > 0 || audioState.transcription)) && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        Suggestions for Improvement
                      </div>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {audioState.emotionalFeedback?.suggestions?.map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        )) || ["Continue speaking naturally"]}
                      </ul>
                    </div>
                  )}
                  {audioState.emotionalFeedback && (
                    <div className="mt-2 text-xs text-gray-500">
                      Analysis Confidence: {audioState.emotionalFeedback.confidence}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="flex items-center space-x-4">
            <button
              onClick={() => playMessage(message)}
              className={`btn-secondary flex items-center space-x-2 ${
                audioState.isPlaying ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={audioState.isPlaying || audioState.isRecording}
            >
              <span>
                {audioState.isPlaying ? 'Playing...' : 'Play Message'}
              </span>
              {audioState.isPlaying && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
            </button>
            <span className="text-sm text-gray-600">
              Duration: {Math.max(0, Math.round(message.duration))}s
            </span>
            <span className="text-xs text-gray-500">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            {audioState.isRecording ? 
              'Recording in progress...' : 
              'No messages yet. Start recording to add messages.'}
          </div>
        )}
      </div>

      {/* Simplified Footer */}
      <div className="border-t p-4 bg-gray-50">
        <div className="flex justify-center">
          <button
            onClick={audioState.isRecording ? stopRecording : startRecording}
            className={`btn-primary flex items-center space-x-2 ${
              audioState.isRecording ? 'bg-red-600 hover:bg-red-700' : ''
            }`}
            disabled={!isModelReady || isAnalyzing}
          >
            <span>
              {audioState.isRecording ? 'Stop Recording' : 'Start Recording'}
            </span>
          </button>
        </div>
        {error && (
          <p className="text-red-500 text-sm text-center mt-2">{error}</p>
        )}
      </div>
    </div>
  );
} 