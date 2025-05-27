import * as faceapi from 'face-api.js';
import { EmotionalState } from '@/types/emotions';

export class FaceAnalysisService {
  private static instance: FaceAnalysisService;
  private isInitialized: boolean = false;
  private lastDetection: any = null;
  private lastExpressions: faceapi.FaceExpressions | null = null;
  private lastProcessedTime: number = 0;
  private processingInterval: number = 50; // Reduced from 100ms to 50ms for more frequent updates
  private modelLoadAttempts: number = 0;
  private readonly MAX_LOAD_ATTEMPTS = 3;
  private emotionHistory: Array<{expressions: faceapi.FaceExpressions, timestamp: number}> = [];
  private readonly HISTORY_SIZE = 5;
  private lastEmotionalState: EmotionalState | null = null;

  private constructor() {}

  public static getInstance(): FaceAnalysisService {
    if (!FaceAnalysisService.instance) {
      FaceAnalysisService.instance = new FaceAnalysisService();
    }
    return FaceAnalysisService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.modelLoadAttempts >= this.MAX_LOAD_ATTEMPTS) {
      throw new Error('Maximum model load attempts reached');
    }

    try {
      console.log('🔍 Initializing face analysis models...');
      
      // Ensure we're in browser environment
      if (typeof window === 'undefined') {
        throw new Error('Cannot initialize face-api.js in non-browser environment');
      }

      const modelPath = '/models';
      
      // Load models with retry logic and parallel loading
      await Promise.all([
        this.loadModelWithRetry(() => faceapi.nets.tinyFaceDetector.loadFromUri(modelPath)),
        this.loadModelWithRetry(() => faceapi.nets.faceExpressionNet.loadFromUri(modelPath)),
        this.loadModelWithRetry(() => faceapi.nets.faceLandmark68Net.loadFromUri(modelPath)),
        this.loadModelWithRetry(() => faceapi.nets.faceRecognitionNet.loadFromUri(modelPath))
      ]);
      
      this.isInitialized = true;
      this.modelLoadAttempts = 0;
      console.log('✅ Face analysis models loaded successfully');
    } catch (error) {
      this.modelLoadAttempts++;
      console.error('❌ Error initializing face analysis models:', error);
      throw error;
    }
  }

  private async loadModelWithRetry(loadFn: () => Promise<void>): Promise<void> {
    let attempts = 0;
    const maxAttempts = 3;
    const retryDelay = 1000;

    while (attempts < maxAttempts) {
      try {
        await loadFn();
        return;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Analyzes a video frame for facial expressions
   * @param videoElement The HTML video element to analyze
   * @returns Emotional state based on facial expressions
   */
  public async analyzeVideoFrame(videoElement: HTMLVideoElement): Promise<EmotionalState> {
    if (!this.isInitialized) {
      console.warn('⚠️ Face analysis service not initialized');
      return this.getDefaultEmotionalState();
    }

    const now = Date.now();
    if (now - this.lastProcessedTime < this.processingInterval) {
      return this.lastExpressions 
        ? this.mapExpressionsToEmotionalState(this.lastExpressions) 
        : this.getDefaultEmotionalState();
    }

    if (!videoElement || videoElement.paused || videoElement.ended || !videoElement.width || !videoElement.height) {
      console.warn('⚠️ Video not available for analysis');
      return this.getDefaultEmotionalState();
    }

    try {
      this.lastProcessedTime = now;
      
      // Perform face detection with expression analysis
      const detection = await faceapi
        .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();
      
      if (!detection) {
        console.log('🔍 No face detected');
        return this.getDefaultEmotionalState();
      }
      
      this.lastDetection = detection;
      this.lastExpressions = detection.expressions;
      
      // Add to history
      this.emotionHistory.push({
        expressions: detection.expressions,
        timestamp: now
      });
      
      // Keep only recent history
      if (this.emotionHistory.length > this.HISTORY_SIZE) {
        this.emotionHistory.shift();
      }
      
      // Calculate average expressions from history
      const averageExpressions = this.calculateAverageExpressions();
      
      // Map to emotional state
      const emotionalState = this.mapExpressionsToEmotionalState(averageExpressions);
      
      // Smooth with previous state
      const smoothedState = this.smoothEmotionalState(emotionalState, this.lastEmotionalState);
      
      this.lastEmotionalState = smoothedState;
      return smoothedState;
    } catch (error) {
      console.error('❌ Error analyzing video frame:', error);
      return this.getDefaultEmotionalState();
    }
  }

  private mapExpressionsToEmotionalState(expressions: faceapi.FaceExpressions): EmotionalState {
    // Calculate stress level
    const stress = Math.round(
      (expressions.angry * 100 + 
       expressions.fearful * 80 + 
       expressions.disgusted * 60 +
       expressions.sad * 40) / 
      (expressions.angry + expressions.fearful + expressions.disgusted + expressions.sad + 0.1) // Avoid division by zero
    );

    // Calculate clarity level
    const clarity = Math.round(
      (expressions.neutral * 80 +
       (1 - expressions.angry - expressions.fearful) * 20) * 100
    );

    // Calculate engagement level
    const engagement = Math.round(
      (expressions.happy * 100 +
       expressions.surprised * 60 +
       (1 - expressions.neutral) * 40) * 100
    );

    // Ensure values are within 0-100 range
    return {
      stress: Math.max(0, Math.min(100, stress)),
      clarity: Math.max(0, Math.min(100, clarity)),
      engagement: Math.max(0, Math.min(100, engagement))
    };
  }

  private smoothEmotionalState(current: EmotionalState, previous: EmotionalState | null): EmotionalState {
    if (!previous) return current;

    const smoothingFactor = 0.3; // Lower value = smoother transitions
    return {
      stress: Math.round(current.stress * smoothingFactor + previous.stress * (1 - smoothingFactor)),
      clarity: Math.round(current.clarity * smoothingFactor + previous.clarity * (1 - smoothingFactor)),
      engagement: Math.round(current.engagement * smoothingFactor + previous.engagement * (1 - smoothingFactor))
    };
  }

  private calculateAverageExpressions(): faceapi.FaceExpressions {
    if (this.emotionHistory.length === 0) {
      return new faceapi.FaceExpressions({
        neutral: 1,
        happy: 0,
        sad: 0,
        angry: 0,
        fearful: 0,
        disgusted: 0,
        surprised: 0
      } as any); // Type assertion needed for face-api.js typings
    }

    const sum = {
      neutral: 0,
      happy: 0,
      sad: 0,
      angry: 0,
      fearful: 0,
      disgusted: 0,
      surprised: 0
    };

    this.emotionHistory.forEach(({expressions}) => {
      sum.neutral += expressions.neutral;
      sum.happy += expressions.happy;
      sum.sad += expressions.sad;
      sum.angry += expressions.angry;
      sum.fearful += expressions.fearful;
      sum.disgusted += expressions.disgusted;
      sum.surprised += expressions.surprised;
    });

    const count = this.emotionHistory.length;
    return new faceapi.FaceExpressions({
      neutral: sum.neutral / count,
      happy: sum.happy / count,
      sad: sum.sad / count,
      angry: sum.angry / count,
      fearful: sum.fearful / count,
      disgusted: sum.disgusted / count,
      surprised: sum.surprised / count
    } as any); // Type assertion needed for face-api.js typings
  }

  private getDefaultEmotionalState(): EmotionalState {
    return {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
  }
} 