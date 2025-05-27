import * as tf from '@tensorflow/tfjs';
import { EmotionalState } from '@/types/emotions';
import { loadPretrainedModel, audioModelConfig } from '@/utils/modelLoader';
import { TrainingDataService } from './trainingDataService';
import { TensorflowService } from './tensorflowService';
import { debugLog, performanceMonitor, memoryMonitor, coverage } from '@/utils/debugLogger';

interface WorkerMessage {
  type: 'ready' | 'analysisComplete' | 'error' | 'progress';
  result?: unknown;
  error?: string;
  progress?: number;
}

interface TrainingData {
  audioData: Float32Array;
  emotionalState: EmotionalState;
  timestamp: number;
}

interface EmotionalStateAccumulator {
  stress: number;
  clarity: number;
  engagement: number;
}

// Constants for performance tuning
const WORKER_TIMEOUT = 1000; // 1 second timeout for worker operations
const MAX_PENDING_ANALYSES = 3;
const WORKER_RESET_INTERVAL = 15000;
const ANALYSIS_RETRY_DELAY = 25; // Reduced from 50ms to 25ms for faster updates
const MIN_ANALYSIS_INTERVAL = 50; // Reduced from 100ms to 50ms for more frequent updates
const QUICK_ANALYSIS_THRESHOLD = 300; // Reduced from 500ms to 300ms for faster switching

export class AudioAnalysisService {
  private static instance: AudioAnalysisService | null = null;
  private static initializationPromise: Promise<void> | null = null;
  private model: tf.LayersModel | null = null;
  private sampleRate = 16000;
  private frameLength = 256; // Reduced from 512 to 256 for faster processing
  private hopLength = 128; // Reduced from 256 to 128
  private modelInitialized = false;
  private trainingDataService: TrainingDataService;
  private lastAnalysisTime = 0;
  private lastEmotionalState: EmotionalState = {
    stress: 50,
    clarity: 50,
    engagement: 50
  };
  private analysisInProgress = false;
  private worker: Worker | null = null;
  private workerReady = false;
  private pendingAnalyses: Array<{
    resolve: (result: EmotionalState) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    startTime: number;
  }> = [];

  private constructor() {
    this.trainingDataService = TrainingDataService.getInstance();
    this.initWorker();
  }

  public static async getInstance(): Promise<AudioAnalysisService> {
    if (!AudioAnalysisService.instance) {
      AudioAnalysisService.instance = new AudioAnalysisService();
      AudioAnalysisService.initializationPromise = AudioAnalysisService.instance.initialize();
    }
    await AudioAnalysisService.initializationPromise;
    return AudioAnalysisService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      console.log('Initializing AudioAnalysisService...');
      await this.loadModel();
      this.modelInitialized = true;
      console.log('AudioAnalysisService initialized successfully');
    } catch (error) {
      console.error('Error initializing AudioAnalysisService:', error);
      throw error;
    }
  }

  private async loadModel(): Promise<void> {
    try {
      this.model = await loadPretrainedModel(audioModelConfig);
    } catch (error) {
      console.error('Error loading audio model:', error);
      throw error;
    }
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(new URL('../workers/audioAnalysisWorker.ts', import.meta.url));
      this.setupWorkerHandlers();
    } catch (error) {
      console.error('Error initializing worker:', error);
      this.worker = null;
    }
  }

  private setupWorkerHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      switch (e.data.type) {
        case 'ready':
          this.workerReady = true;
          break;
        case 'analysisComplete':
          this.handleAnalysisComplete(e.data.result as EmotionalState);
          break;
        case 'error':
          this.handleWorkerError(new Error(e.data.error));
          break;
        case 'progress':
          this.updateAnalysisProgress(e.data.progress || 0);
          break;
      }
    };

    this.worker.onerror = (error: ErrorEvent) => {
      console.error('Worker error:', error);
      this.handleWorkerError(error.error);
    };
  }

  public async analyzeAudio(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    const now = Date.now();
    const timeSinceLastAnalysis = now - this.lastAnalysisTime;

    // More lenient rate limiting
    if (timeSinceLastAnalysis < MIN_ANALYSIS_INTERVAL) {
      // Return interpolated state for smoother transitions
      return this.interpolateState(this.lastEmotionalState);
    }

    this.lastAnalysisTime = now;

    try {
      let result: EmotionalState;

      // Use quick analysis more often for better responsiveness
      if (timeSinceLastAnalysis < QUICK_ANALYSIS_THRESHOLD || this.analysisInProgress) {
        result = await this.quickAnalysis(audioBuffer);
      } else {
        this.analysisInProgress = true;
        try {
          // Full analysis with worker if available
          if (this.worker && this.workerReady) {
            result = await this.workerAnalysis(audioBuffer);
          } else {
            result = await this.mainThreadAnalysis(audioBuffer);
          }
        } finally {
          this.analysisInProgress = false;
        }
      }

      // Apply smoothing to prevent jumpy updates
      this.lastEmotionalState = this.smoothTransition(this.lastEmotionalState, result);
      return this.lastEmotionalState;

    } catch (error) {
      console.error('Analysis error:', error);
      return this.interpolateState(this.lastEmotionalState);
    }
  }

  private interpolateState(state: EmotionalState): EmotionalState {
    // Add small random variations for more natural transitions
    const variation = () => (Math.random() - 0.5) * 2;
    
    return {
      stress: Math.min(100, Math.max(0, state.stress + variation())),
      clarity: Math.min(100, Math.max(0, state.clarity + variation())),
      engagement: Math.min(100, Math.max(0, state.engagement + variation()))
    };
  }

  private async quickAnalysis(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    const audioData = new Float32Array(audioBuffer);
    let sum = 0;
    let max = 0;
    let crossings = 0;

    // Analyze more samples for better accuracy
    const step = 2; // Analyze every other sample
    for (let i = 0; i < audioData.length; i += step) {
      const amplitude = Math.abs(audioData[i]);
      sum += amplitude;
      max = Math.max(max, amplitude);
      if (i > 0 && audioData[i] * audioData[i - step] < 0) {
        crossings++;
      }
    }

    const average = sum / (audioData.length / step);
    const normalizedCrossings = (crossings / (audioData.length / step)) * 1000;

    // More responsive state updates with larger adjustments
    return {
      stress: Math.min(100, Math.max(0, this.lastEmotionalState.stress + (max * 30 - 15))),
      clarity: Math.min(100, Math.max(0, this.lastEmotionalState.clarity + (normalizedCrossings * 0.4 - 20))),
      engagement: Math.min(100, Math.max(0, this.lastEmotionalState.engagement + (average * 40 - 20)))
    };
  }

  private async workerAnalysis(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = setTimeout(() => {
        const index = this.pendingAnalyses.findIndex(a => a.timeout === timeout);
        if (index !== -1) {
          this.pendingAnalyses.splice(index, 1);
          reject(new Error('Analysis timeout'));
        }
      }, WORKER_TIMEOUT);

      this.pendingAnalyses.push({ resolve, reject, timeout, startTime });

      this.worker!.postMessage({
        type: 'processAudio',
        audioBuffer,
        sampleRate: this.sampleRate,
        frameLength: this.frameLength,
        hopLength: this.hopLength
      });
    });
  }

  private async mainThreadAnalysis(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    const input = await this.preprocessAudio(audioBuffer);
    if (!input) {
      return this.lastEmotionalState;
    }

    try {
      const features = await this.extractFeatures(input);
      return this.calculateEmotionalState(features);
    } finally {
      tf.dispose(input);
    }
  }

  private smoothTransition(oldState: EmotionalState, newState: EmotionalState): EmotionalState {
    const smoothFactor = 0.3; // Increased from 0.2 for more responsive updates
    
    return {
      stress: Math.round(oldState.stress + (newState.stress - oldState.stress) * smoothFactor),
      clarity: Math.round(oldState.clarity + (newState.clarity - oldState.clarity) * smoothFactor),
      engagement: Math.round(oldState.engagement + (newState.engagement - oldState.engagement) * smoothFactor)
    };
  }

  private async preprocessAudio(audioBuffer: ArrayBuffer): Promise<tf.Tensor | null> {
    try {
      const audioData = new Float32Array(audioBuffer);
      return tf.tidy(() => {
        const tensor = tf.tensor1d(audioData);
        return tf.expandDims(tf.expandDims(tensor, 0), 2);
      });
    } catch (error) {
      console.error('Error preprocessing audio:', error);
      return null;
    }
  }

  private async extractFeatures(input: tf.Tensor): Promise<{
    energy: number;
    zeroCrossings: number;
    spectralEnergy: number;
  }> {
    return tf.tidy(() => {
      const flattened = input.reshape([-1]);
      const energy = tf.mean(tf.abs(flattened)).dataSync()[0];
      const zeroCrossings = tf.sum(
        tf.sign(flattened.slice(1)).sub(tf.sign(flattened.slice(0, -1))).abs()
      ).dataSync()[0] / 2;
      
      const fft = tf.spectral.rfft(flattened);
      const magnitude = tf.abs(fft);
      const spectralEnergy = tf.mean(magnitude).dataSync()[0];

      return {
        energy,
        zeroCrossings,
        spectralEnergy
      };
    });
  }

  private calculateEmotionalState(features: {
    energy: number;
    zeroCrossings: number;
    spectralEnergy: number;
  }): EmotionalState {
    const stress = Math.min(100, Math.max(0, Math.round(
      50 + (features.energy * 50) + (features.zeroCrossings / 100)
    )));
    
    const clarity = Math.min(100, Math.max(0, Math.round(
      50 + (features.spectralEnergy * 30) + ((1 - features.zeroCrossings / 1000) * 20)
    )));
    
    const engagement = Math.min(100, Math.max(0, Math.round(
      50 + (features.energy * 30) + (features.spectralEnergy * 20)
    )));

    return { stress, clarity, engagement };
  }

  private handleAnalysisComplete(result: EmotionalState): void {
    const completed = this.pendingAnalyses.shift();
    if (completed) {
      clearTimeout(completed.timeout);
      completed.resolve(result);
    }
  }

  private handleWorkerError(error: Error): void {
    const failed = this.pendingAnalyses.shift();
    if (failed) {
      clearTimeout(failed.timeout);
      failed.reject(error);
    }
  }

  private updateAnalysisProgress(progress: number): void {
    // Could be used to update UI progress if needed
    debugLog.audio(`Analysis progress: ${progress}%`);
  }

  public reset(): void {
    this.lastEmotionalState = {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
    this.lastAnalysisTime = 0;
    this.analysisInProgress = false;
  }

  public getPersonalizedBaselines(): EmotionalState {
    return {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
  }

  public async trainOnUserData(): Promise<void> {
    try {
      if (!this.model) {
        throw new Error('Model not initialized');
      }

      const trainingData: TrainingData[] = await this.trainingDataService.getTrainingData();
      if (trainingData.length === 0) {
        return;
      }

      // Update baselines based on recent data
      const averages = trainingData.reduce<EmotionalStateAccumulator>((acc, curr) => ({
        stress: acc.stress + curr.emotionalState.stress,
        clarity: acc.clarity + curr.emotionalState.clarity,
        engagement: acc.engagement + curr.emotionalState.engagement
      }), { stress: 0, clarity: 0, engagement: 0 });

      this.lastEmotionalState = {
        stress: Math.round(averages.stress / trainingData.length),
        clarity: Math.round(averages.clarity / trainingData.length),
        engagement: Math.round(averages.engagement / trainingData.length)
      };

      // Extract features from audio data
      const features = await Promise.all(
        trainingData.map(async (data) => this.extractFeatures(tf.tensor(data.audioData)))
      );

      // Fine-tune model if needed
      await this.model.fit(
        tf.tensor(features),
        tf.tensor(trainingData.map((data) => [
          data.emotionalState.stress / 100,
          data.emotionalState.clarity / 100,
          data.emotionalState.engagement / 100
        ])),
        {
          epochs: 5,
          batchSize: 32,
          shuffle: true
        }
      );
    } catch (error) {
      console.error('Error training on user data:', error);
      throw error;
    }
  }
}

const report = coverage.getCoverageReport();
console.log(report);

// In browser console
performance.getEntriesByType('measure');
memoryMonitor.log(); 