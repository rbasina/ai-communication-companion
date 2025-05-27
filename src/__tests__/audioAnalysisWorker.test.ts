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
  signal: {
    stft: jest.fn().mockReturnValue({
      dispose: jest.fn(),
    }),
    hannWindow: jest.fn().mockReturnValue(new Float32Array(1024)),
  },
  abs: jest.fn().mockReturnValue({
    dispose: jest.fn(),
  }),
  mean: jest.fn().mockReturnValue({
    dispose: jest.fn(),
  }),
}));

// Mock Web Worker environment
const mockPostMessage = jest.fn();
const mockAddEventListener = jest.fn();

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = mockPostMessage;
  addEventListener = mockAddEventListener;
}

(global as any).Worker = MockWorker;
(global as any).self = new MockWorker();

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

// Import the worker (this will execute in the test environment)
import '../workers/audioAnalysisWorker';

describe('AudioAnalysisWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostMessage.mockImplementation((message: any) => {
      // Add targetOrigin parameter to satisfy JSDOM
      self.postMessage(message, '*');
    });
  });

  describe('initialization', () => {
    it('should send ready message after successful initialization', async () => {
      // Simulate initialization message
      const message = {
        type: 'initialize',
        testBuffer: new ArrayBuffer(1024)
      };

      // Trigger the onmessage handler
      if ((global as any).self.onmessage) {
        (global as any).self.onmessage({ data: message });
      }

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check if ready message was sent
      expect(mockPostMessage).toHaveBeenCalledWith(
        { type: 'ready' },
        '*'
      );
    });
  });

  describe('audio processing', () => {
    beforeEach(async () => {
      // Initialize the worker first
      const initMessage = {
        type: 'initialize',
        testBuffer: new ArrayBuffer(1024)
      };
      if ((global as any).self.onmessage) {
        (global as any).self.onmessage({ data: initMessage });
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      mockPostMessage.mockClear();
    });

    it('should handle invalid audio data', async () => {
      const message = {
        type: 'processAudio',
        audioBuffer: new ArrayBuffer(0),
        sampleRate: 16000
      };

      if ((global as any).self.onmessage) {
        (global as any).self.onmessage({ data: message });
      }
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockPostMessage).toHaveBeenCalledWith(
        {
          type: 'error',
          error: expect.any(String)
        },
        '*'
      );
    });

    it('should process valid audio data', async () => {
      // Create mock audio data (1 second of audio at 16kHz)
      const sampleRate = 16000;
      const duration = 1;
      const buffer = new ArrayBuffer(sampleRate * duration * 2);
      const view = new Int16Array(buffer);
      
      // Fill with a simple sine wave
      for (let i = 0; i < sampleRate * duration; i++) {
        view[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 32767;
      }

      const message = {
        type: 'processAudio',
        audioBuffer: buffer,
        sampleRate
      };

      if ((global as any).self.onmessage) {
        (global as any).self.onmessage({ data: message });
      }
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have received progress updates and final result
      const progressCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'progress'
      );
      expect(progressCalls.length).toBeGreaterThan(0);

      const completeCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'analysisComplete'
      );
      expect(completeCalls.length).toBe(1);

      const result = completeCalls[0][0].result;
      expect(result).toEqual({
        stress: expect.any(Number),
        clarity: expect.any(Number),
        engagement: expect.any(Number)
      });

      // Verify results are within valid ranges
      expect(result.stress).toBeGreaterThanOrEqual(0);
      expect(result.stress).toBeLessThanOrEqual(100);
      expect(result.clarity).toBeGreaterThanOrEqual(0);
      expect(result.clarity).toBeLessThanOrEqual(100);
      expect(result.engagement).toBeGreaterThanOrEqual(0);
      expect(result.engagement).toBeLessThanOrEqual(100);
    });
  });
}); 