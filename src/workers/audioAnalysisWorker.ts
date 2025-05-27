import * as tf from '@tensorflow/tfjs';
import { EmotionalState } from '@/types/emotions';

interface AudioAnalysisMessage {
  type: 'initialize' | 'processAudio' | 'cleanup';
  audioBuffer?: ArrayBuffer;
  sampleRate?: number;
  testBuffer?: ArrayBuffer;
}

// Configure TensorFlow.js for worker environment
tf.env().set('WEBGL_CPU_FORWARD', true);
tf.env().set('WEBGL_PACK', false);

// Constants for analysis
const CHUNK_SIZE = 256; // Reduced from 512 for faster processing
const PROCESSING_BREAK_MS = 1; // Reduced from 5ms to 1ms for more frequent updates
const MAX_PROCESSING_TIME = 100; // Reduced from 200ms for faster feedback
const MAX_TENSOR_OPS = 15; // Reduced from 25 for better performance
const MIN_ANALYSIS_INTERVAL = 25; // Reduced from 50ms for more frequent updates

let isInitialized = false;
let isProcessing = false;
let lastAnalysisTime = 0;
let lastEmotionalState = {
  stress: 50,
  clarity: 50,
  engagement: 50
};
let analysisCount = 0;
let tensorOpsCount = 0;
let processingTimeout: NodeJS.Timeout | null = null;
let processingQueue: ArrayBuffer[] = [];
let confidenceScore = 30;

// Add feature extraction and analysis functions
interface AudioFeatures {
  mfcc: number[];
  energy: number;
  zeroCrossings: number;
  quality: number;
}

async function initialize() {
  try {
    if (isInitialized) {
      self.postMessage({ type: 'ready' });
      return;
    }
    
    await tf.ready();
    await tf.setBackend('cpu');
    
    // Test tensor operations
    const testTensor = tf.zeros([1, 1]);
    testTensor.dispose();
    
    isInitialized = true;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    console.error('Worker initialization failed:', error);
    self.postMessage({
      type: 'error',
      error: 'Worker initialization failed'
    });
    throw error;
  }
}

async function cleanup() {
  try {
    if (processingTimeout) {
      clearTimeout(processingTimeout);
      processingTimeout = null;
    }

    // Clear processing queue
    processingQueue = [];
    
    // Reset all state variables
    isProcessing = false;
    isInitialized = false;
    lastAnalysisTime = 0;
    analysisCount = 0;
    tensorOpsCount = 0;

    // Force cleanup of all tensors
    try {
      tf.engine().startScope();
      tf.disposeVariables();
      await tf.engine().reset();
      tf.engine().endScope();
    } catch (error) {
      console.warn('Tensor cleanup error:', error);
    }

    // Send cleanup complete message
    self.postMessage({ type: 'cleanup_complete' });
  } catch (error) {
    console.error('Cleanup error:', error);
    // Even if cleanup fails, reset state
    isProcessing = false;
    isInitialized = false;
    self.postMessage({ type: 'cleanup_complete' });
  }
}

self.onmessage = async (e: MessageEvent<AudioAnalysisMessage>) => {
  try {
    switch (e.data.type) {
      case 'initialize':
        await initialize();
        break;
        
      case 'processAudio':
        if (!isInitialized) {
          await initialize();
        }
        if (!e.data.audioBuffer || !e.data.sampleRate) {
          throw new Error('Invalid audio data');
        }
        if (isProcessing) {
          // Instead of skipping, queue the chunk
          processingQueue.push(e.data.audioBuffer);
          return;
        }
        await processAudioChunk(e.data.audioBuffer);
        break;

      case 'cleanup':
        // Cancel any ongoing processing
        if (processingTimeout) {
          clearTimeout(processingTimeout);
          processingTimeout = null;
        }
        await cleanup();
        break;
    }
  } catch (error) {
    console.error('Message handling error:', error);
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    await cleanup();
  }
};

async function processAudioChunk(audioBuffer: ArrayBuffer) {
  const now = Date.now();
  if (now - lastAnalysisTime < MIN_ANALYSIS_INTERVAL) {
    processingQueue.push(audioBuffer);
    return;
  }

  if (!isInitialized || isProcessing) {
    processingQueue.push(audioBuffer);
    return;
  }

  try {
    isProcessing = true;
    lastAnalysisTime = now;

    // Process audio data
    const audioData = new Float32Array(audioBuffer);
    const features = await extractFeatures(audioData);
    
    if (!features) {
      throw new Error('Failed to extract features');
    }

    // Analyze features
    const result = await analyzeFeatures(features);
    
    if (result) {
      analysisCount++;
      tensorOpsCount++;
      
      // Update confidence score based on analysis count and feature quality
      confidenceScore = Math.min(85, 30 + (analysisCount * 2) + (features.quality * 10));
      
      // Smooth the emotional state changes
      lastEmotionalState = {
        stress: smoothValue(result.stress, lastEmotionalState.stress),
        clarity: smoothValue(result.clarity, lastEmotionalState.clarity),
        engagement: smoothValue(result.engagement, lastEmotionalState.engagement)
      };

      // Send update with confidence
      self.postMessage({
        type: 'analysis_update',
        data: {
          ...lastEmotionalState,
          confidence: confidenceScore,
          analysisCount
        }
      });
    }

    // Process queued chunks if any
    while (processingQueue.length > 0 && tensorOpsCount < MAX_TENSOR_OPS) {
      const nextBuffer = processingQueue.shift();
      if (nextBuffer) {
        await processAudioChunk(nextBuffer);
      }
    }

  } catch (error) {
    console.error('Error processing audio chunk:', error);
    self.postMessage({ type: 'error', error: 'Analysis failed' });
  } finally {
    isProcessing = false;
    
    // Cleanup tensors periodically
    if (tensorOpsCount >= MAX_TENSOR_OPS) {
      await cleanup();
      tensorOpsCount = 0;
    }
  }
}

// Helper function to smooth values
function smoothValue(newValue: number, oldValue: number): number {
  const smoothingFactor = 0.3; // Adjust this value to control smoothing (0-1)
  return oldValue + smoothingFactor * (newValue - oldValue);
}

function analyzeChunk(chunk: Float32Array): EmotionalState {
  let result: EmotionalState;
  let rmsValue = 0;
  let zcValue = 0;
  let energy = 0;
  let peakLevel = 0;
  
  tf.tidy(() => {
    try {
      // Convert to tensor and normalize
      const audioTensor = tf.tensor1d(chunk);
      const normalized = tf.div(audioTensor, tf.abs(audioTensor).max());
      
      // Calculate RMS with bounds checking
      const rms = tf.sqrt(tf.mean(tf.square(normalized)));
      rmsValue = Math.min(1, Math.max(0, Number(rms.dataSync()[0]) || 0));

      // Calculate zero crossings with bounds checking
      const zeroCrossings = tf.sum(
        tf.sign(normalized.slice(1))
          .sub(tf.sign(normalized.slice(0, -1)))
      ).abs().div(2);
      zcValue = Math.min(1, Math.max(0, Number(zeroCrossings.dataSync()[0]) / chunk.length || 0));

      // Calculate energy with bounds checking
      energy = Math.min(1, Math.max(0, Number(tf.mean(tf.square(normalized)).dataSync()[0]) || 0));
      
      // Calculate peak level with bounds checking
      peakLevel = Math.min(1, Math.max(0, Number(tf.max(tf.abs(normalized)).dataSync()[0]) || 0));
      
      tensorOpsCount++;
    } catch (error) {
      console.error('Analysis error:', error);
    }
  });
  
  // Convert features to emotional state with more dynamic range
  result = {
    stress: Math.min(100, Math.max(0, Math.round(
      (rmsValue * 40) + (peakLevel * 30) + (zcValue * 30)
    ))),
    clarity: Math.min(100, Math.max(0, Math.round(
      ((1 - zcValue) * 40) + ((1 - energy) * 30) + (peakLevel * 30)
    ))),
    engagement: Math.min(100, Math.max(0, Math.round(
      (rmsValue * 35) + (peakLevel * 35) + ((1 - zcValue) * 30)
    )))
  };

  return result || lastEmotionalState;
}

async function extractFeatures(audioData: Float32Array): Promise<AudioFeatures | null> {
  try {
    // Convert audio data to tensor
    const tensor = tf.tensor1d(audioData);
    
    // Calculate energy
    const energy = tf.mean(tf.abs(tensor)).dataSync()[0];
    
    // Calculate zero crossings
    const zeroCrossings = tf.sum(
      tf.sign(tensor.slice(1)).sub(tf.sign(tensor.slice(0, -1))).abs()
    ).dataSync()[0] / 2;
    
    // Calculate MFCC features
    const fft = tf.spectral.rfft(tensor);
    const magnitude = tf.abs(fft);
    const mfcc = Array.from(magnitude.dataSync()).slice(0, 13);
    
    // Calculate quality score (0-1)
    const quality = Math.min(1, Math.max(0,
      (energy > 0.1 ? 0.5 : 0) + // Good signal strength
      (zeroCrossings > 10 ? 0.3 : 0) + // Good frequency content
      (mfcc.some(v => v > 1) ? 0.2 : 0) // Good spectral content
    ));
    
    // Cleanup tensors
    tf.dispose([tensor, fft, magnitude]);
    
    return {
      mfcc,
      energy,
      zeroCrossings,
      quality
    };
  } catch (error) {
    console.error('Error extracting features:', error);
    return null;
  }
}

async function analyzeFeatures(features: AudioFeatures): Promise<EmotionalState | null> {
  try {
    // Convert features to tensor
    const featureTensor = tf.tensor2d([features.mfcc], [1, features.mfcc.length]);
    
    // Analyze stress level (based on energy and zero crossings)
    const stress = Math.min(100, Math.max(0,
      50 + // Base level
      (features.energy * 100) + // Higher energy = more stress
      (features.zeroCrossings / 10) // More zero crossings = more stress
    ));
    
    // Analyze clarity (based on MFCC distribution)
    const clarity = Math.min(100, Math.max(0,
      50 + // Base level
      (features.quality * 30) + // Better quality = more clarity
      (Math.max(...features.mfcc) * 10) // Strong spectral peaks = more clarity
    ));
    
    // Analyze engagement (based on feature variation)
    const engagement = Math.min(100, Math.max(0,
      50 + // Base level
      (features.quality * 40) + // Better quality = more engagement
      (features.energy * 50) // Higher energy = more engagement
    ));
    
    // Cleanup tensors
    tf.dispose(featureTensor);
    
    return {
      stress: Math.round(stress),
      clarity: Math.round(clarity),
      engagement: Math.round(engagement)
    };
  } catch (error) {
    console.error('Error analyzing features:', error);
    return null;
  }
} 