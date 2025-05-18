// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock the EmotionAnalysisService
jest.mock('@/services/emotionAnalysis', () => ({
  EmotionAnalysisService: {
    getInstance: () => ({
      analyzeText: jest.fn().mockResolvedValue({
        stress: 50,
        clarity: 75,
        engagement: 60,
      }),
      analyzeAudio: jest.fn(),
      analyzeVideo: jest.fn(),
    }),
  },
}));

// Mock the AIResponseService
jest.mock('@/services/aiResponse', () => ({
  AIResponseService: {
    getInstance: () => ({
      generateResponse: jest.fn().mockResolvedValue(
        "I notice you're expressing yourself clearly. Would you like to explore that thought further?"
      ),
      generateSuggestions: jest.fn().mockResolvedValue([
        {
          id: '123',
          text: 'Try expressing how this makes you feel',
          context: 'test',
          emotionalState: {
            stress: 50,
            clarity: 75,
            engagement: 60,
          },
          timestamp: Date.now(),
        },
      ]),
      analyzeTone: jest.fn().mockResolvedValue({
        tone: 'neutral',
        confidence: 0.8,
      }),
    }),
  },
})); 