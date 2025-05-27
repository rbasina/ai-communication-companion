import { AudioAnalysisService } from '../services/audioAnalysisService';
import { EmotionalState } from '@/types/emotions';

// Mock TensorFlow.js
jest.mock('@tensorflow/tfjs', () => ({
  ready: jest.fn().mockResolvedValue(undefined),
  engine: jest.fn().mockReturnValue({
    startScope: jest.fn(),
    endScope: jest.fn(),
  }),
  env: jest.fn().mockReturnValue({
    set: jest.fn(),
  }),
  zeros: jest.fn().mockReturnValue({
    dispose: jest.fn(),
  }),
  tensor: jest.fn().mockReturnValue({
    dispose: jest.fn(),
  }),
}));

// Mock performance API
const mockPerformance = {
  now: jest.fn().mockReturnValue(0),
  getEntriesByType: jest.fn().mockReturnValue([]),
  memory: {
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0
  }
};
(global as any).performance = mockPerformance;

// Mock AudioContext
const mockAudioContext = {
  decodeAudioData: jest.fn().mockImplementation((buffer) => {
    return Promise.resolve({
      getChannelData: () => new Float32Array(1024),
      sampleRate: 16000,
      length: 1024,
      duration: 1,
      numberOfChannels: 1
    });
  })
};
(global as any).AudioContext = jest.fn().mockImplementation(() => mockAudioContext);

describe('AudioAnalysisService', () => {
  let audioAnalysisService: AudioAnalysisService;

  beforeEach(async () => {
    // Reset any mocks
    jest.clearAllMocks();
    
    // Get a fresh instance for each test
    audioAnalysisService = await AudioAnalysisService.getInstance();
  });

  afterEach(async () => {
    // Clean up after each test
    await audioAnalysisService.reset();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', async () => {
      const instance1 = await AudioAnalysisService.getInstance();
      const instance2 = await AudioAnalysisService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('analyzeAudio', () => {
    it('should return default state for invalid buffer', async () => {
      const result = await audioAnalysisService.analyzeAudio(new ArrayBuffer(0));
      expect(result).toEqual({
        stress: 50,
        clarity: 50,
        engagement: 50
      });
    });

    it('should process valid audio buffer', async () => {
      // Create a mock audio buffer with some sample data
      const sampleRate = 16000;
      const duration = 1; // 1 second
      const buffer = new ArrayBuffer(sampleRate * duration * 2); // 2 bytes per sample
      const view = new Int16Array(buffer);
      
      // Fill with a simple sine wave
      for (let i = 0; i < sampleRate * duration; i++) {
        view[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 32767;
      }

      const result = await audioAnalysisService.analyzeAudio(buffer);
      
      // Check that results are within valid ranges
      expect(result.stress).toBeGreaterThanOrEqual(0);
      expect(result.stress).toBeLessThanOrEqual(100);
      expect(result.clarity).toBeGreaterThanOrEqual(0);
      expect(result.clarity).toBeLessThanOrEqual(100);
      expect(result.engagement).toBeGreaterThanOrEqual(0);
      expect(result.engagement).toBeLessThanOrEqual(100);
    });
  });

  describe('getPersonalizedBaselines', () => {
    it('should return default baseline values', () => {
      const baselines = audioAnalysisService.getPersonalizedBaselines();
      expect(baselines).toEqual({
        stress: 45,
        clarity: 60,
        engagement: 58
      });
    });
  });

  // Helper function to create mock training data
  const createMockTrainingData = (numSamples: number) => {
    return Array(numSamples).fill(null).map(() => ({
      audioBuffer: new ArrayBuffer(16000), // 1 second of audio at 16kHz
      emotionalState: {
        stress: Math.round(Math.random() * 100),
        clarity: Math.round(Math.random() * 100),
        engagement: Math.round(Math.random() * 100)
      }
    }));
  };

  describe('trainOnUserData', () => {
    it('should throw error when model is not initialized', async () => {
      await expect(audioAnalysisService.trainOnUserData())
        .rejects
        .toThrow('Model not initialized');
    });

    // Add more training tests as needed
  });
}); 