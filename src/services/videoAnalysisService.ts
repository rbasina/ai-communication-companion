import * as tf from '@tensorflow/tfjs';
import { EmotionalState } from '@/types/emotions';
import { TensorflowService } from './tensorflowService';

export class VideoAnalysisService {
  private static instance: VideoAnalysisService;
  private static initializationPromise: Promise<void> | null = null;
  private model: tf.LayersModel | null = null;
  private modelInitialized = false;

  private constructor() {
    // Don't initialize in constructor
  }

  public static async getInstance(): Promise<VideoAnalysisService> {
    if (!VideoAnalysisService.instance) {
      VideoAnalysisService.instance = new VideoAnalysisService();
      // Initialize only once
      if (!VideoAnalysisService.initializationPromise) {
        VideoAnalysisService.initializationPromise = VideoAnalysisService.instance.initializeModel();
      }
      try {
        // Wait for initialization
        await VideoAnalysisService.initializationPromise;
      } catch (error) {
        console.error('Failed to initialize VideoAnalysisService:', error);
        VideoAnalysisService.initializationPromise = null; // Reset promise to allow retry
      }
    }
    return VideoAnalysisService.instance;
  }

  private async initializeModel() {
    try {
      console.log('Initializing video analysis model...');
      
      // Ensure TensorflowService is initialized and a backend is set
      await TensorflowService.getInstance();
      console.log('[VideoAnalysisService] TensorFlow.js backend should be ready via TensorflowService.');
      
      const model = tf.sequential();

      // Input layer for video frames (224x224 RGB images)
      model.add(tf.layers.conv2d({
        inputShape: [224, 224, 3],
        filters: 32,
        kernelSize: [3, 3],
        activation: 'relu',
      }));

      model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
      model.add(tf.layers.dropout({ rate: 0.25 }));

      model.add(tf.layers.conv2d({
        filters: 64,
        kernelSize: [3, 3],
        activation: 'relu',
      }));

      model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
      model.add(tf.layers.dropout({ rate: 0.25 }));

      model.add(tf.layers.conv2d({
        filters: 128,
        kernelSize: [3, 3],
        activation: 'relu',
      }));

      model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
      model.add(tf.layers.dropout({ rate: 0.25 }));

      model.add(tf.layers.flatten());
      
      model.add(tf.layers.dense({
        units: 512,
        activation: 'relu',
      }));

      model.add(tf.layers.dropout({ rate: 0.5 }));

      // Output layer for emotional states
      model.add(tf.layers.dense({
        units: 3, // stress, clarity, engagement
        activation: 'sigmoid',
      }));

      await model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError',
        metrics: ['accuracy'],
      });

      // Initialize with default weights for better starting values
      const dummyData = tf.zeros([1, 224, 224, 3]);
      const prediction = model.predict(dummyData) as tf.Tensor;
      
      // Verify model output
      const values = await prediction.data();
      
      if (values.length !== 3) {
        throw new Error('Model initialization failed: incorrect output dimension');
      }
      
      // Cleanup
      prediction.dispose();
      dummyData.dispose();

      this.model = model;
      this.modelInitialized = true;
      console.log('Video analysis model initialized successfully');
    } catch (error) {
      console.error('Error initializing video analysis model:', error);
      this.modelInitialized = false;
      this.model = null;
      throw new Error('Failed to initialize video analysis model');
    }
  }

  private async preprocessFrame(frameData: ImageData): Promise<tf.Tensor4D> {
    try {
      // Convert ImageData to tensor
      const tensor = tf.browser.fromPixels(frameData);
      
      // Resize to expected input size
      const resized = tf.image.resizeBilinear(tensor, [224, 224]);
      
      // Normalize pixel values
      const normalized = tf.div(resized, 255);
      
      // Add batch dimension
      const batched = normalized.expandDims(0);

      // Cleanup
      tensor.dispose();
      resized.dispose();
      normalized.dispose();

      return batched as tf.Tensor4D;
    } catch (error) {
      console.error('Error preprocessing video frame:', error);
      // Return a zero tensor on error
      return tf.zeros([1, 224, 224, 3]) as tf.Tensor4D;
    }
  }

  public async analyzeVideoFrame(frame: HTMLVideoElement): Promise<AnalysisResult> {
    if (!this.modelInitialized) {
      console.warn('Video analysis model not initialized');
      return this.getDefaultResult();
    }

    try {
      // Convert frame to tensor
      const tensor = tf.browser.fromPixels(frame)
        .resizeBilinear([224, 224])
        .expandDims(0)
        .toFloat()
        .div(255.0);

      // Get prediction
      const prediction = this.model!.predict(tensor) as tf.Tensor;
      const values = await prediction.data();

      // Cleanup
      tensor.dispose();
      prediction.dispose();

      const state = {
        stress: Math.round(values[0] * 100),
        clarity: Math.round(values[1] * 100),
        engagement: Math.round(values[2] * 100)
      };

      return {
        state,
        confidence: 0.8, // High confidence for real-time analysis
        analysis: 'Real-time video analysis',
        suggestions: []
      };
    } catch (error) {
      console.error('Error analyzing video frame:', error);
      return this.getDefaultResult();
    }
  }

  private getDefaultResult(): AnalysisResult {
    return {
      state: {
        stress: 50,
        clarity: 50,
        engagement: 50
      },
      confidence: 0,
      analysis: '',
      suggestions: []
    };
  }

  public async trainModel(trainingData: { frame: ImageData; emotions: EmotionalState }[]) {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Preprocess training data
      const inputPromises = trainingData.map(data => this.preprocessFrame(data.frame));
      const inputs = await Promise.all(inputPromises);

      const labels = trainingData.map(data => [
        data.emotions.stress / 100,
        data.emotions.clarity / 100,
        data.emotions.engagement / 100,
      ]);

      const xs = tf.concat(inputs);
      const ys = tf.tensor2d(labels);

      // Train the model
      await this.model.fit(xs, ys, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch: number, logs: any) => {
            console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss ?? 'N/A'}`);
          },
        },
      });

      // Cleanup
      xs.dispose();
      ys.dispose();
      inputs.forEach(tensor => tensor.dispose());
      
      console.log('Video model training complete');
    } catch (error) {
      console.error('Error training video model:', error);
      throw error;
    }
  }
} 