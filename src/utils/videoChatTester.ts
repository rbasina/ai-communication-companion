import { LLMService } from '../services/llmService';
import { VideoAnalysisService } from '../services/videoAnalysisService';
import { EmotionAnalysisService } from '../services/emotionAnalysis';
import { TensorflowService } from '../services/tensorflowService';

export async function testVideoChat() {
  console.log('🧪 Starting Video Chat End-to-End Test');
  
  try {
    // 1. Test LLM Service Configuration
    console.log('\n1. Testing LLM Service...');
    const llmService = LLMService.getInstance();
    
    // Check if API key is configured
    if (!llmService.hasValidConfiguration()) {
      throw new Error('LLM Service not configured. Please set your OpenAI API key in the settings.');
    }
    
    // Validate API key
    const apiKey = llmService.getApiKey();
    await llmService.validateApiKey(apiKey);
    console.log('✅ LLM Service configured and API key validated');

    // 2. Test TensorFlow Service
    console.log('\n2. Testing TensorFlow Service...');
    const tensorflowService = await TensorflowService.getInstance();
    console.log('✅ TensorFlow Service initialized');

    // 3. Test Video Analysis Service
    console.log('\n3. Testing Video Analysis Service...');
    const videoService = await VideoAnalysisService.getInstance();
    console.log('✅ Video Analysis Service initialized');

    // 4. Test Emotion Analysis Service
    console.log('\n4. Testing Emotion Analysis Service...');
    const emotionService = await EmotionAnalysisService.getInstance();
    console.log('✅ Emotion Analysis Service initialized');

    // 5. Test Video Frame Analysis
    console.log('\n5. Testing Video Frame Analysis...');
    const mockVideoElement = document.createElement('video');
    mockVideoElement.width = 640;
    mockVideoElement.height = 480;
    
    const result = await videoService.analyzeVideoFrame(mockVideoElement);
    console.log('Video Analysis Result:', result);
    console.log('✅ Video Frame Analysis completed');

    // 6. Test Integrated Analysis
    console.log('\n6. Testing Integrated Analysis...');
    const analysisResult = await emotionService.getCurrentAnalysis();
    console.log('Integrated Analysis Result:', analysisResult);
    console.log('✅ Integrated Analysis completed');

    console.log('\n🎉 All tests completed successfully!');
    return {
      success: true,
      message: 'Video Chat functionality verified successfully',
      details: {
        llmConfigured: true,
        tensorflowInitialized: true,
        videoAnalysisInitialized: true,
        emotionAnalysisInitialized: true,
        videoFrameAnalysis: result,
        integratedAnalysis: analysisResult
      }
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      error
    };
  }
} 