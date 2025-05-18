import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, addToHistory, setMode } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { FaceAnalysisService } from '@/services/faceAnalysisService';

interface VideoState {
  isConnected: boolean;
  isMuted: boolean;
  isVideoOn: boolean;
}

export default function VideoChat() {
  const dispatch = useDispatch();
  const [videoState, setVideoState] = useState<VideoState>({
    isConnected: false,
    isMuted: false,
    isVideoOn: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);
  const [faceService, setFaceService] = useState<FaceAnalysisService | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [localEmotionalState, setLocalEmotionalState] = useState({
    stress: 50,
    clarity: 50,
    engagement: 50
  });
  
  // Simple stream ref
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
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
    dispatch(updateEmotionalState(initialState));
    
    return () => {
      // Clean up stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [dispatch]);

  // Process video frames for face analysis
  useEffect(() => {
    if (!videoState.isConnected || !videoRef.current || !faceService) return;
    
    let analyzeInterval: NodeJS.Timeout;
    
    const analyzeVideoFrame = async () => {
      if (!videoRef.current || !faceService) return;
      
      try {
        setIsAnalyzing(true);
        
        // Use face analysis service to analyze the current video frame
        const emotionalState = await faceService.analyzeVideoFrame(videoRef.current);
        
        console.log('Face analysis result:', emotionalState);
        
        // Update local state and Redux
        setLocalEmotionalState(emotionalState);
        dispatch(updateEmotionalState(emotionalState));
        
        // Also update the emotion service directly
        if (emotionService) {
          emotionService.updateFromRedux('video', emotionalState);
        }
        
      } catch (err) {
        console.error('Error analyzing video:', err);
      } finally {
        setIsAnalyzing(false);
      }
    };
    
    // First analysis
    analyzeVideoFrame();
    
    // Set up interval for continuous analysis
    analyzeInterval = setInterval(analyzeVideoFrame, 2000);
    
    return () => {
      if (analyzeInterval) clearInterval(analyzeInterval);
    };
  }, [videoState.isConnected, faceService, dispatch, emotionService]);

  // Simple function to start the camera
  const startCamera = async () => {
    try {
      setError('Requesting camera access...');
      
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Request camera with simple constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
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
        
        console.log('VIDEO STATE CHANGING: Setting isConnected to true');
        setVideoState(prev => ({ ...prev, isConnected: true }));
        setError(null);
        
        // Force an immediate emotion update after camera connects
        const initialEmotionState = {
          stress: 70 + Math.round(Math.random() * 25),
          clarity: 75 + Math.round(Math.random() * 20),
          engagement: 80 + Math.round(Math.random() * 15)
        };
        console.log('Forcing initial emotion update:', initialEmotionState);
        setLocalEmotionalState(initialEmotionState);
        dispatch(updateEmotionalState(initialEmotionState));
        
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
      });
      setVideoState(prev => ({ ...prev, isVideoOn: !prev.isVideoOn }));
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
    const testState = {
      stress: 85 + Math.round(Math.random() * 10), // Higher stress 85-95%
      clarity: 80 + Math.round(Math.random() * 15),
      engagement: 70 + Math.round(Math.random() * 25)
    };
    console.log('Manually forcing emotion update with values:', testState);
    
    // Update both local state and Redux
    setLocalEmotionalState(testState);
    dispatch(updateEmotionalState(testState));
    
    // Update the emotion service directly
    if (emotionService) {
      emotionService.updateFromRedux('video', testState);
    }
    
    // Add message to confirm button was clicked
    setError('Emotion update triggered! Check values in the panel below.');
    setTimeout(() => setError(null), 2000);
  };

  return (
    <div className="flex flex-col h-[500px] card mb-20">
      <div className="flex-1 p-2 relative">
        {/* Video container */}
        <div ref={videoContainerRef} className="w-full h-full bg-gray-900 rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover transform scale-x-[-1]"
            playsInline
            muted
            autoPlay
          />
          
          {!videoState.isConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-white text-center p-4">
                <div className="text-5xl mb-4">📹</div>
                <p>{error || 'Camera not connected'}</p>
                <button 
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                  onClick={startCamera}
                >
                  Start Camera
                </button>
              </div>
            </div>
          )}
          
          {/* Analysis indicator */}
          {isAnalyzing && (
            <div className="absolute top-2 right-2">
              <div className="flex items-center bg-black bg-opacity-50 text-white px-2 py-1 rounded-full text-xs">
                <span className="mr-1">Analyzing</span>
                <span className="animate-pulse">•••</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="border-t p-4 bg-gray-50">
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${videoState.isMuted ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
            disabled={!videoState.isConnected}
          >
            {videoState.isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${!videoState.isVideoOn ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
            disabled={!videoState.isConnected}
          >
            {videoState.isVideoOn ? 'Stop Video' : 'Start Video'}
          </button>
          <button
            onClick={startCamera}
            className="p-3 rounded-full bg-blue-600 text-white"
          >
            Restart Camera
          </button>
          <button
            onClick={forceEmotionUpdate}
            className="p-3 rounded-full bg-green-600 text-white"
          >
            Update Emotion
          </button>
        </div>

        {error && (
          <p className="text-red-600 text-sm text-center mb-4">{error}</p>
        )}

        {/* Simple status indicator */}
        <div className="text-center mb-4">
          <span className={videoState.isConnected ? "text-green-600" : "text-gray-600"}>
            {videoState.isConnected ? 'Camera connected' : 'Camera not connected'}
          </span>
        </div>
      </div>
    </div>
  );
} 