import * as faceapi from 'face-api.js';
import { EmotionalState } from '@/types/emotions';

export class FaceAnalysisService {
  private static instance: FaceAnalysisService;
  private isInitialized: boolean = false;
  private lastDetection: any = null; // Using any type to avoid complex typings
  private lastExpressions: faceapi.FaceExpressions | null = null;
  private lastProcessedTime: number = 0;
  private processingInterval: number = 500; // Process every 500ms

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

    try {
      console.log('🔍 Initializing face analysis models...');
      // Load models from public directory
      const modelPath = '/models';
      
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
        faceapi.nets.faceExpressionNet.loadFromUri(modelPath)
      ]);
      
      this.isInitialized = true;
      console.log('✅ Face analysis models loaded successfully');
    } catch (error) {
      console.error('❌ Error initializing face analysis models:', error);
      throw error;
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

    // Only process at certain intervals to avoid performance issues
    const now = Date.now();
    if (now - this.lastProcessedTime < this.processingInterval) {
      // Return last known state if we have one, otherwise defaults
      return this.lastExpressions 
        ? this.mapExpressionsToEmotionalState(this.lastExpressions) 
        : this.getDefaultEmotionalState();
    }
    
    // Check if video is playing and has dimensions
    if (
      !videoElement ||
      videoElement.paused ||
      videoElement.ended ||
      !videoElement.width ||
      !videoElement.height
    ) {
      console.warn('⚠️ Video not available for analysis');
      return this.getDefaultEmotionalState();
    }

    try {
      this.lastProcessedTime = now;
      console.log('🔍 Processing face detection on video frame');
      
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
      
      console.log('✅ Face expressions detected:', detection.expressions);
      
      // Map face-api expressions to our emotional state model
      return this.mapExpressionsToEmotionalState(detection.expressions);
    } catch (error) {
      console.error('❌ Error analyzing video frame:', error);
      return this.getDefaultEmotionalState();
    }
  }

  /**
   * Maps face-api.js expressions to our emotional state model
   */
  private mapExpressionsToEmotionalState(expressions: faceapi.FaceExpressions): EmotionalState {
    // Value normalization function
    const normalize = (value: number) => Math.min(100, Math.max(0, Math.round(value * 100)));
    
    // Stress calculation: angry, fearful, disgusted -> higher stress
    const stress = normalize(
      (expressions.angry * 0.5) + 
      (expressions.fearful * 0.3) + 
      (expressions.disgusted * 0.2) +
      50 // Base stress level
    );
    
    // Clarity calculation: neutral expression suggests clarity
    const clarity = normalize(
      (expressions.neutral * 0.7) + 
      (1 - expressions.sad * 0.3) +
      50 // Base clarity level
    );
    
    // Engagement: happy, surprised -> higher engagement
    const engagement = normalize(
      (expressions.happy * 0.5) + 
      (expressions.surprised * 0.3) + 
      (1 - expressions.neutral * 0.2) +
      50 // Base engagement level
    );
    
    return { stress, clarity, engagement };
  }

  private getDefaultEmotionalState(): EmotionalState {
    return {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
  }
} 