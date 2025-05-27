import { LLMService } from '../services/llmService';
import { VideoAnalysisService } from '../services/videoAnalysisService';
import { EmotionAnalysisService } from '../services/emotionAnalysis';
import { TensorflowService } from '../services/tensorflowService';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock as any;

// Mock navigator.mediaDevices
const mediaDevicesMock = {
  getUserMedia: jest.fn().mockResolvedValue({
    getTracks: () => [{
      stop: jest.fn()
    }]
  })
};
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: mediaDevicesMock,
  writable: true
});

// Mock HTMLVideoElement
class MockVideoElement {
  width = 640;
  height = 480;
  srcObject = null;
  autoplay = false;
  playsInline = false;
  muted = false;
  paused = false;
  ended = false;
}
global.HTMLVideoElement = MockVideoElement as any;

describe('Video Chat End-to-End Test', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('sk-test-123456789');
  });

  test('should initialize all services successfully', async () => {
    console.log('🧪 Starting Video Chat End-to-End Test');
    
    try {
      // 1. Test LLM Service Configuration
      console.log('\n1. Testing LLM Service...');
      const llmService = LLMService.getInstance();
      
      // Check if API key is configured
      expect(llmService.hasValidConfiguration()).toBe(true);
      
      // Validate API key
      const apiKey = llmService.getApiKey();
      await expect(llmService.validateApiKey(apiKey)).resolves.toBe(true);
      console.log('✅ LLM Service configured and API key validated');

      // 2. Test TensorFlow Service
      console.log('\n2. Testing TensorFlow Service...');
      const tensorflowService = await TensorflowService.getInstance();
      expect(tensorflowService).toBeTruthy();
      console.log('✅ TensorFlow Service initialized');

      // 3. Test Video Analysis Service
      console.log('\n3. Testing Video Analysis Service...');
      const videoService = await VideoAnalysisService.getInstance();
      expect(videoService).toBeTruthy();
      console.log('✅ Video Analysis Service initialized');

      // 4. Test Emotion Analysis Service
      console.log('\n4. Testing Emotion Analysis Service...');
      const emotionService = await EmotionAnalysisService.getInstance();
      expect(emotionService).toBeTruthy();
      console.log('✅ Emotion Analysis Service initialized');

      // 5. Test Video Frame Analysis
      console.log('\n5. Testing Video Frame Analysis...');
      const mockVideoElement = new MockVideoElement();
      
      const result = await videoService.analyzeVideoFrame(mockVideoElement as any);
      expect(result).toBeTruthy();
      expect(result.state).toHaveProperty('stress');
      expect(result.state).toHaveProperty('clarity');
      expect(result.state).toHaveProperty('engagement');
      console.log('Video Analysis Result:', result);
      console.log('✅ Video frame analysis successful');

      // 6. Test Integrated Analysis
      console.log('\n6. Testing Integrated Analysis...');
      const analysis = await emotionService.getCurrentAnalysis();
      expect(analysis).toBeTruthy();
      expect(analysis.emotionalState).toHaveProperty('stress');
      expect(analysis.emotionalState).toHaveProperty('clarity');
      expect(analysis.emotionalState).toHaveProperty('engagement');
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
      console.log('Integrated Analysis Result:', analysis);
      console.log('✅ Integrated analysis successful');

      console.log('\n🎉 All tests passed successfully!');
    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    }
  });
}); 