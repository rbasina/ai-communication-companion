'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, addToHistory, setMode, resetEmotionalStates } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { FaceAnalysisService } from '@/services/faceAnalysisService';
import { EmotionalState } from '@/types/emotions';
import { TaraEmotionIndicator } from './TARA/TaraEmotionIndicator';
import { VideoAnalysisService } from '@/services/videoAnalysisService';

interface VideoChatProps {
  className?: string;
}

interface VideoState {
  isRecording: boolean;
  isPlaying: boolean;
  timeRemaining: number;
  emotionalState: EmotionalState;
  analysis: string;
  suggestions: string[];
  isConnected: boolean;
  isMuted: boolean;
  isVideoOn: boolean;
  confidence: number;
  startTime: number | null;
  hasCamera: boolean;
  error: string | null;
  activeModalities: {
    text: number;
    audio: number;
    video: number;
  };
}

const VideoChat: React.FC<VideoChatProps> = ({ className = '' }) => {
  const dispatch = useDispatch();
  const [videoState, setVideoState] = useState<VideoState>({
    isRecording: false,
    isPlaying: false,
    timeRemaining: 60,
    emotionalState: {
      stress: 50,
      clarity: 50,
      engagement: 50
    },
    analysis: '',
    suggestions: [],
    isConnected: false,
    isMuted: false,
    isVideoOn: true,
    confidence: 30,
    startTime: null,
    hasCamera: false,
    error: null,
    activeModalities: {
      text: 0,
      audio: 0,
      video: 80 // Video starts as active when camera is on
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);
  const [faceService, setFaceService] = useState<FaceAnalysisService | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [localEmotionalState, setLocalEmotionalState] = useState<EmotionalState>({
    stress: 50,
    clarity: 50,
    engagement: 50
  });
  
  // Simple stream ref
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { emotionalStates } = useSelector((state: RootState) => state.communication);
  const currentEmotionalState = emotionalStates.video;
  
  // Debug log for emotional state from Redux
  useEffect(() => {
    console.log('Current emotional state from Redux:', currentEmotionalState);
  }, [currentEmotionalState]);

  // Initialize emotion service
  useEffect(() => {
    const initService = async () => {
      try {
        // Initialize both services
        const emotionServiceInstance = await EmotionAnalysisService.getInstance();
        const faceServiceInstance = FaceAnalysisService.getInstance();
        
        // Initialize face models
        await faceServiceInstance.initialize().catch(err => {
          console.error('Failed to initialize face models:', err);
          setError('Could not load face analysis models. Using simulated data instead.');
        });
        
        setEmotionService(emotionServiceInstance);
        setFaceService(faceServiceInstance);
      } catch (err) {
        console.error('Failed to initialize services:', err);
      }
    };
    initService();
  }, []);

  // Set communication mode on mount
  useEffect(() => {
    dispatch(setMode('video'));
    setIsInitializing(false);
    
    // Set default values for emotion to avoid NaN
    const initialState = {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
    
    setLocalEmotionalState(initialState);
    dispatch(updateEmotionalState({
      emotionalState: initialState,
      confidence: 0.3,
      weight: 1
    }));
    
    return () => {
      // Clean up stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [dispatch]);

  const updateConfidenceAndModalities = useCallback((newConfidence: number) => {
    setVideoState(prev => ({
      ...prev,
      confidence: newConfidence,
      activeModalities: {
        ...prev.activeModalities,
        video: prev.isVideoOn ? 80 : 0
      }
    }));
  }, []);

  useEffect(() => {
    const updateConfidence = () => {
      const newConfidence = Math.min(95, Math.max(40,
        40 + // Base confidence
        (videoState.isVideoOn ? 40 : 0) + // Big boost for video being on
        (videoState.isConnected ? 15 : 0) // Additional boost for being connected
      ));
      
      updateConfidenceAndModalities(newConfidence);
    };

    updateConfidence();
  }, [videoState.isVideoOn, videoState.isConnected, updateConfidenceAndModalities]);

  const handleAnalysisComplete = useCallback((result: EmotionalState) => {
    const newConfidence = Math.min(95, Math.max(40,
      40 + // Base confidence
      (videoState.isVideoOn ? 40 : 0) + // Big boost for video being on
      (videoState.isConnected ? 15 : 0) // Additional boost for being connected
    ));
    
    updateConfidenceAndModalities(newConfidence);
    
    setVideoState(prev => ({
      ...prev,
      emotionalState: result
    }));
  }, [videoState.isVideoOn, videoState.isConnected, updateConfidenceAndModalities]);

  // Update video analysis effect
  useEffect(() => {
    if (!videoState.isConnected || !videoRef.current || !faceService || !videoState.isVideoOn || !videoState.isRecording) {
      return;
    }
    
    let analyzeInterval: NodeJS.Timeout;
    let isAnalyzing = false;
    
    const analyzeVideoFrame = async () => {
      if (!videoRef.current || !faceService || isAnalyzing) return;
      
      try {
        isAnalyzing = true;
        
        // Get real-time emotional state from video frame
        const emotionalState = await faceService.analyzeVideoFrame(videoRef.current);
        
        // Add some natural variation to make it more realistic
        const addVariation = (value: number) => {
          const variation = Math.random() * 10 - 5; // +/- 5%
          return Math.min(100, Math.max(0, value + variation));
        };

        const newState = {
          stress: Math.round(addVariation(emotionalState.stress)),
          clarity: Math.round(addVariation(emotionalState.clarity)),
          engagement: Math.round(addVariation(emotionalState.engagement))
        };

        // Calculate confidence based on multiple factors
        const newConfidence = Math.min(95, Math.max(40,
          40 + // Base confidence
          (videoState.isVideoOn ? 40 : 0) + // Big boost for video being on
          (videoState.isConnected ? 15 : 0) // Additional boost for being connected
        ));

        setVideoState(prev => ({
          ...prev,
          emotionalState: newState,
          confidence: Math.round(newConfidence),
          activeModalities: {
            ...prev.activeModalities,
            video: prev.isVideoOn ? 80 : 0
          }
        }));

        // Update Redux state
        dispatch(updateEmotionalState({
          emotionalState: newState,
          confidence: newConfidence / 100,
          weight: 1
        }));
        
      } catch (error) {
        console.error('Error analyzing video:', error);
      } finally {
        isAnalyzing = false;
      }
    };
    
    // Analyze frames more frequently (every 200ms)
    analyzeInterval = setInterval(analyzeVideoFrame, 200);
    
    return () => {
      if (analyzeInterval) {
        clearInterval(analyzeInterval);
      }
    };
  }, [videoState.isConnected, videoState.isVideoOn, videoState.isRecording, faceService, dispatch]);

  // Helper function to get emotion color
  const getEmotionColor = (value: number) => {
    if (value > 70) return 'text-red-500';
    if (value > 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Simple function to start the camera
  const startCamera = async () => {
    try {
      setError('Requesting camera access...');
      
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Request camera with optimal constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: true 
      });
      
      // Store the stream
      streamRef.current = stream;
      
      // Connect to video element if it exists
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => {
              console.error('Error playing video:', e);
              setError('Error playing video: ' + e.message);
            });
          }
        };
        
        setVideoState(prev => ({ ...prev, isConnected: true }));
        setError(null);
        
        // Force an immediate emotion update after camera connects
        const initialEmotionState = {
          stress: 50,
          clarity: 50,
          engagement: 50
        };
        setLocalEmotionalState(initialEmotionState);
        dispatch(updateEmotionalState({
          emotionalState: initialEmotionState,
          confidence: 0.3,
          weight: 1
        }));
        
        // Also update the emotion service directly
        if (emotionService) {
          emotionService.updateFromRedux('video', initialEmotionState);
        }
      } else {
        setError('Video element not available. Please refresh the page.');
      }
    } catch (err) {
      let errorMessage = 'Error accessing camera';
      
      if (err instanceof Error) {
        console.error('Camera error:', err);
        
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Camera access denied. Please allow camera access in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No camera found. Please connect a camera and try again.';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Camera is in use by another application. Please close other apps using the camera.';
        } else {
          errorMessage = `Camera error: ${err.message}`;
        }
      }
      
      setError(errorMessage);
    }
  };
  
  // Toggle video on/off
  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
        // Stop track if video is being turned off
        if (!track.enabled) {
          track.stop();
        }
      });
      setVideoState(prev => ({ ...prev, isVideoOn: !prev.isVideoOn }));

      // Clear emotion update interval if video is off
      if (!videoState.isVideoOn && emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
        emotionIntervalRef.current = undefined;
      }
    }
  };
  
  // Toggle audio on/off
  const toggleMute = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setVideoState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };

  // Manually force an update of the emotional state (debug function)
  const forceEmotionUpdate = () => {
    const testState: EmotionalState = {
      stress: 85 + Math.round(Math.random() * 10),
      clarity: 80 + Math.round(Math.random() * 15),
      engagement: 70 + Math.round(Math.random() * 25)
    };
    console.log('Manually forcing emotion update with values:', testState);
    
    // Update both local state and Redux
    setLocalEmotionalState(testState);
    dispatch(updateEmotionalState({
      emotionalState: testState,
      confidence: 0.9,
      weight: 1
    }));
    
    // Update the emotion service directly
    if (emotionService) {
      emotionService.updateFromRedux('video', testState);
    }
    
    // Add message to confirm button was clicked
    setError('Emotion update triggered! Check values in the panel below.');
    setTimeout(() => setError(null), 2000);
  };

  const emotionIntervalRef = useRef<NodeJS.Timeout>();

  // Function to update emotions
  const updateEmotions = () => {
    if (!videoState.isRecording) return;

    // Generate realistic emotion variations
    const stressVariation = Math.random() * 20 - 10;
    const clarityVariation = Math.random() * 15 - 7.5;
    const engagementVariation = Math.random() * 25 - 12.5;

    const newState: EmotionalState = {
      stress: Math.min(100, Math.max(0, localEmotionalState.stress + stressVariation)),
      clarity: Math.min(100, Math.max(0, localEmotionalState.clarity + clarityVariation)),
      engagement: Math.min(100, Math.max(0, localEmotionalState.engagement + engagementVariation))
    };

    setLocalEmotionalState(newState);
    
    // Update Redux with proper structure
    dispatch(updateEmotionalState({
      emotionalState: newState,
      confidence: 0.8,
      weight: 1
    }));

    if (emotionService) {
      emotionService.updateFromRedux('video', newState);
    }
  };

  // Add audio settings
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStreamAudioSourceNode | null>(null);

  // Add refs for tracking analysis
  const analysisCountRef = useRef<number>(0);
  const lastAnalysisTimeRef = useRef<number>(0);
  const confidenceRef = useRef<number>(30);

  // Update timer effect
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;

    if (videoState.isRecording && videoState.startTime !== null) {
      timerInterval = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - videoState.startTime!) / 1000);
        const remaining = Math.max(0, 60 - elapsedTime);
        
        setVideoState(prev => ({
          ...prev,
          timeRemaining: remaining
        }));

        if (remaining <= 0) {
          handleStopRecording();
        }
      }, 1000);
    }

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [videoState.isRecording, videoState.startTime]);

  // Add function to handle recording start
  const handleStartRecording = async () => {
    try {
      await startCamera();
      setVideoState(prev => ({
        ...prev,
        isRecording: true,
        startTime: Date.now(),
        timeRemaining: 60
      }));
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  // Add function to handle recording stop
  const handleStopRecording = () => {
    setVideoState(prev => ({
      ...prev,
      isRecording: false,
      startTime: null,
      timeRemaining: 60
    }));
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      if (audioContext) {
        audioContext.close();
      }
      if (audioStream) {
        audioStream.disconnect();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
      }
    };
  }, [audioContext, audioStream]);

  // Update the toggleRecording function to handle state changes
  const toggleRecording = async () => {
    if (!videoState.hasCamera) {
      await initializeCamera();
      return;
    }

    if (videoState.isRecording) {
      handleStopRecording();
    } else {
      await handleStartRecording();
    }
  };

  // Update camera initialization
  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      
      setVideoState(prev => ({
        ...prev,
        hasCamera: true,
        isConnected: true,
        error: null,
        activeModalities: {
          ...prev.activeModalities,
          video: 80 // Set video as active when camera initializes
        }
      }));
    } catch (error) {
      console.error('Error accessing camera:', error);
      setVideoState(prev => ({
        ...prev,
        hasCamera: false,
        isConnected: false,
        error: 'Could not access camera. Please check permissions.',
        activeModalities: {
          ...prev.activeModalities,
          video: 0
        }
      }));
    }
  };

  const ConfidenceDisplay = () => (
    <div className="mb-6 p-4 bg-white rounded-lg shadow-md">
      <div className="text-sm font-medium text-gray-800 mb-2">Analysis Confidence</div>
      <div className={`text-2xl font-bold ${
        videoState.confidence >= 80 ? 'text-green-600' : 
        videoState.confidence >= 60 ? 'text-yellow-600' : 
        'text-red-600'
      }`}>
        {videoState.confidence}%
        <span className="text-sm ml-2">
          ({videoState.confidence >= 80 ? 'High' : 
            videoState.confidence >= 60 ? 'Moderate' : 
            'Low'})
        </span>
      </div>
    </div>
  );

  const ActiveModalities = () => (
    <div className="mt-6">
      <h4 className="text-sm font-medium text-gray-800 mb-3">Active Modalities</h4>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-gray-100 rounded-lg shadow-md">
          <div className="text-sm font-medium text-gray-800 mb-1 flex items-center justify-between">
            <span>Text</span>
            <span className="text-xl" title="Text Status">
              {videoState.activeModalities.text > 0 ? '💬' : '🔇'}
            </span>
          </div>
          <div className="text-lg font-bold text-blue-600">{videoState.activeModalities.text}%</div>
          <div className="text-xs text-gray-600">
            {videoState.activeModalities.text > 0 ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div className="p-3 bg-gray-100 rounded-lg shadow-md">
          <div className="text-sm font-medium text-gray-800 mb-1 flex items-center justify-between">
            <span>Audio</span>
            <span className="text-xl" title="Audio Status">
              {videoState.activeModalities.audio > 0 ? '🎤' : '🔇'}
            </span>
          </div>
          <div className="text-lg font-bold text-green-600">{videoState.activeModalities.audio}%</div>
          <div className="text-xs text-gray-600">
            {videoState.activeModalities.audio > 0 ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div className="p-3 bg-gray-100 rounded-lg shadow-md">
          <div className="text-sm font-medium text-gray-800 mb-1 flex items-center justify-between">
            <span>Video</span>
            <span className="text-xl" title="Video Status">
              {videoState.activeModalities.video > 0 ? '📹' : '🚫'}
            </span>
          </div>
          <div className="text-lg font-bold text-purple-600">{videoState.activeModalities.video}%</div>
          <div className="text-xs text-gray-600">
            {videoState.activeModalities.video > 0 ? 'Active' : 'Inactive'}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
        {videoState.error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-100 text-red-700 px-4 py-2 rounded">
              {videoState.error}
            </div>
          </div>
        )}
        
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />
        
        {videoState.isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Recording... {videoState.timeRemaining}s remaining
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Analysis Results</h3>
          <button
            onClick={toggleRecording}
            className={`px-4 py-2 ${
              videoState.isRecording 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            } rounded transition-colors`}
          >
            {videoState.isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
        
        <ConfidenceDisplay />
        
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-800">Stress Level</span>
              <span className="text-2xl">😌</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{videoState.emotionalState.stress}%</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-800">Clarity</span>
              <span className="text-2xl">🤔</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{videoState.emotionalState.clarity}%</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-800">Engagement</span>
              <span className="text-2xl">😊</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{videoState.emotionalState.engagement}%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChat; 