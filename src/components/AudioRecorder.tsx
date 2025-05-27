'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { updateEmotionalState } from '@/store/slices/communicationSlice';
import { AudioAnalysisService } from '@/services/audioAnalysisService';

const CHUNK_SIZE = 512;
const MAX_RECORDING_TIME = 60000;
const ANALYSIS_INTERVAL = 50;
const MIN_CHUNK_SIZE = 256;
const CLEANUP_TIMEOUT = 1000;
const MAX_QUEUE_SIZE = 3;

interface AudioRecorderProps {
  onStateChange?: (isRecording: boolean) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onStateChange }) => {
  const dispatch = useDispatch();
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioService, setAudioService] = useState<AudioAnalysisService | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAnalysisTimeRef = useRef<number>(0);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const analysisQueueRef = useRef<Blob[]>([]);
  const processingRef = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    console.log('Starting cleanup...');
    
    // Clear all timeouts
    [analysisTimeoutRef, recordingTimeoutRef, cleanupTimeoutRef].forEach(ref => {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    });

    // Stop media recorder
    if (mediaRecorderRef.current?.state === 'recording') {
      try {
        console.log('Stopping media recorder...');
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping media recorder:', error);
      }
    }

    // Stop audio tracks
    if (streamRef.current) {
      try {
        console.log('Stopping audio tracks...');
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (error) {
        console.error('Error stopping tracks:', error);
      }
      streamRef.current = null;
    }

    // Clear analysis queue and reset state
    analysisQueueRef.current = [];
    processingRef.current = false;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    
    // Reset recording state
    setIsRecording(false);
    if (onStateChange) onStateChange(false);
    
    // Final analysis of complete recording
    if (audioChunksRef.current.length > 0) {
      const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      finalBlob.arrayBuffer().then(buffer => {
        if (audioService) {
          audioService.analyzeAudio(buffer).then(result => {
            dispatch(updateEmotionalState({
              emotionalState: result,
              confidence: 0.95,
              weight: 1
            }));
          }).catch(error => {
            console.error('Final analysis error:', error);
          });
        }
      }).catch(error => {
        console.error('Error converting final blob to buffer:', error);
      });
    }
    
    console.log('Cleanup complete');
  }, [onStateChange, dispatch, audioService]);

  useEffect(() => {
    const initAudioService = async () => {
      try {
        console.log('Initializing audio service...');
        const service = await AudioAnalysisService.getInstance();
        setAudioService(service);
        console.log('Audio service initialized successfully');
      } catch (error) {
        console.error('Audio service initialization error:', error);
        setError('Failed to initialize audio analysis service');
      }
    };

    initAudioService();
    return cleanup;
  }, [cleanup]);

  const processAnalysisQueue = async () => {
    if (!audioService || !isRecording || processingRef.current) {
      return;
    }

    if (analysisQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    try {
      while (analysisQueueRef.current.length > 0 && isRecording) {
        const chunk = analysisQueueRef.current.shift();
        if (chunk) {
          await analyzeAudioChunk(chunk);
        }
        // Small delay to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally {
      processingRef.current = false;
      // Schedule next processing if there are more chunks
      if (analysisQueueRef.current.length > 0 && isRecording) {
        setTimeout(processAnalysisQueue, 10);
      }
    }
  };

  const analyzeAudioChunk = async (chunk: Blob) => {
    if (!audioService || !isRecording) {
      console.log('Skipping analysis - service not ready or not recording');
      return;
    }

    const now = Date.now();
    if (now - lastAnalysisTimeRef.current < ANALYSIS_INTERVAL) {
      console.log('Throttling analysis - too soon');
      return;
    }
    lastAnalysisTimeRef.current = now;

    try {
      console.log('Converting chunk to buffer...', { chunkSize: chunk.size });
      const buffer = await chunk.arrayBuffer();
      console.log('Analyzing audio chunk...', { bufferSize: buffer.byteLength });
      
      const result = await audioService.analyzeAudio(buffer);
      
      if (result && isRecording) {
        console.log('Received analysis result:', result);
        dispatch(updateEmotionalState({
          emotionalState: result,
          confidence: 0.8,
          weight: 1
        }));
      }
    } catch (error) {
      console.error('Chunk analysis error:', error);
      if (error instanceof Error && error.message.includes('timeout')) {
        cleanup();
        setError('Analysis timeout');
      }
    }
  };

  const startRecording = async () => {
    try {
      console.log('Starting recording...');
      cleanup(); // Clean up any existing recording session
      setError(null);

      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      console.log('Microphone access granted');
      streamRef.current = stream;
      audioChunksRef.current = [];
      analysisQueueRef.current = [];
      processingRef.current = false;
      recordingStartTimeRef.current = Date.now();
      lastAnalysisTimeRef.current = 0;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      });

      console.log('MediaRecorder configured');

      mediaRecorder.ondataavailable = async (event) => {
        console.log('Received audio data:', { size: event.data.size });
        if (event.data.size > MIN_CHUNK_SIZE) {
          audioChunksRef.current.push(event.data);
          // Add to analysis queue if not too full
          if (analysisQueueRef.current.length < MAX_QUEUE_SIZE) {
            analysisQueueRef.current.push(event.data);
            processAnalysisQueue();
          }
        }
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
        cleanup();
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        cleanup();
        setError('Recording error occurred');
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(CHUNK_SIZE);
      console.log('MediaRecorder started');
      
      setIsRecording(true);
      if (onStateChange) onStateChange(true);

      recordingTimeoutRef.current = setTimeout(() => {
        if (isRecording) {
          console.log('Recording timeout reached');
          stopRecording();
        }
      }, MAX_RECORDING_TIME);

    } catch (error) {
      console.error('Error starting recording:', error);
      cleanup();
      setError('Failed to start recording');
    }
  };

  const stopRecording = () => {
    console.log('Stopping recording...');
    cleanup();
  };

  return (
    <div className="audio-recorder">
      {error && <div className="error-message">{error}</div>}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={!audioService}
        className={`record-button ${isRecording ? 'recording' : ''}`}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
    </div>
  );
};

export default AudioRecorder; 