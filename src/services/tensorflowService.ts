import * as tf from '@tensorflow/tfjs';
import { EmotionalState } from '@/types/emotions';

export interface AudioFeatures {
  spectralFeatures: Float32Array;
  temporalFeatures: Float32Array;
  mfccFeatures: Float32Array;
}

export class TensorflowService {
  private static instance: TensorflowService;
  private static initializationPromise: Promise<void> | null = null;
  private initialized = false;
  private model: tf.LayersModel | null = null;
  private vocabulary: Map<string, number> = new Map();
  private maxSequenceLength = 100;

  private constructor() {
    // Don't initialize in constructor
  }

  public static async getInstance(): Promise<TensorflowService> {
    if (!TensorflowService.instance) {
      TensorflowService.instance = new TensorflowService();
      // Initialize only once
      if (!TensorflowService.initializationPromise) {
        TensorflowService.initializationPromise = TensorflowService.instance.initialize();
      }
      // Wait for initialization
      await TensorflowService.initializationPromise;
    }
    return TensorflowService.instance;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('Initializing TensorflowService...');
    let backendSetAndReady = false;

    // Try WebGL first
    try {
      console.log('Attempting to set TensorFlow.js backend to WebGL and check readiness...');
      await tf.setBackend('webgl');
      await tf.ready(); // Test if WebGL is truly ready
      console.log('TensorFlow.js backend successfully set to WebGL and ready.');
      backendSetAndReady = true;
    } catch (webglError) {
      console.warn('WebGL backend initialization failed. Clearing WebGL state and falling back to CPU...', webglError);
      // It's good practice to dispose variables if a backend setup fails partially,
      // though tf.setBackend should ideally handle cleanup.
      // For safety, ensure no lingering WebGL state if possible, though tf.disposeVariables() clears global state.
      // Simply proceeding to set CPU backend is usually sufficient as setBackend switches context.
    }

    // If WebGL failed, try CPU
    if (!backendSetAndReady) {
      try {
        console.log('Attempting to set TensorFlow.js backend to CPU and check readiness...');
        await tf.setBackend('cpu');
        await tf.ready(); // Test if CPU is ready
        console.log('TensorFlow.js backend successfully set to CPU and ready.');
        backendSetAndReady = true;
      } catch (cpuError) {
        console.error('CPU backend initialization failed after WebGL attempt also failed:', cpuError);
        throw new Error('Could not initialize any TensorFlow.js backend (WebGL and CPU failed).');
      }
    }
    
    if (!backendSetAndReady) {
        // This case should ideally not be reached if the logic above is sound and one backend succeeds.
        console.error('Critical error: TensorFlow.js backend could not be set and confirmed ready.');
        throw new Error('TensorFlow.js backend could not be set and confirmed ready.');
    }

    console.log(`TensorFlow.js active and ready with backend: ${tf.getBackend()}`);
    this.initialized = true;
    console.log('TensorflowService core initialized successfully, proceeding to initialize model.');
    this.initializeModel(); // This should only be called if a backend is successfully initialized and ready
  }

  private async initializeModel() {
    try {
      // Load the model from a URL or local storage
      // For now, we'll create a simple sequential model for text classification
      const model = tf.sequential();
      
      model.add(tf.layers.embedding({
        inputDim: 10000, // Vocabulary size
        outputDim: 32,
        inputLength: this.maxSequenceLength,
      }));

      model.add(tf.layers.globalAveragePooling1d());
      
      model.add(tf.layers.dense({
        units: 64,
        activation: 'relu',
      }));

      model.add(tf.layers.dropout({ rate: 0.5 }));
      
      model.add(tf.layers.dense({
        units: 3, // Three outputs for stress, clarity, and engagement
        activation: 'sigmoid',
      }));

      await model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError',
        metrics: ['accuracy'],
      });

      this.model = model;
    } catch (error) {
      console.error('Error initializing TensorFlow model:', error);
    }
  }

  private preprocessText(text: string): tf.Tensor {
    // Simple preprocessing: tokenize and pad sequence
    const tokens = text.toLowerCase().split(' ');
    const sequence = tokens.map(token => this.vocabulary.get(token) || 0);
    
    // Pad sequence to fixed length
    while (sequence.length < this.maxSequenceLength) {
      sequence.push(0);
    }
    
    return tf.tensor2d([sequence.slice(0, this.maxSequenceLength)], [1, this.maxSequenceLength]);
  }

  private analyzeTextSentiment(text: string): { sentiment: number; confidence: number } {
    // Enhanced sentiment analysis with more comprehensive word lists
    const positiveWords = new Set([
      'happy', 'good', 'great', 'excellent', 'wonderful', 'amazing',
      'success', 'successful', 'successfully', 'working', 'worked',
      'complete', 'completed', 'expect', 'expected', 'share', 'proud',
      'achievement', 'achieve', 'achieved', 'glad', 'pleased', 'excited',
      'perfect', 'perfectly', 'fantastic', 'awesome', 'brilliant'
    ]);
    
    const negativeWords = new Set([
      'sad', 'bad', 'terrible', 'awful', 'horrible', 'poor',
      'fail', 'failed', 'failure', 'error', 'wrong', 'broken',
      'issue', 'problem', 'bug', 'difficult', 'hard', 'tough',
      'worried', 'concern', 'concerned', 'stress', 'stressed',
      'anxious', 'anxiety', 'frustrated', 'frustrating'
    ]);

    const intensifiers = new Set([
      'very', 'really', 'extremely', 'absolutely', 'totally',
      'completely', 'highly', 'especially', 'particularly'
    ]);
    
    const words = text.toLowerCase().split(/\s+/);
    let positive = 0;
    let negative = 0;
    let intensity = 1;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const nextWord = words[i + 1];
      
      // Check for intensifiers
      if (intensifiers.has(word)) {
        intensity = 1.5;
        continue;
      }
      
      // Apply sentiment with intensity
      if (positiveWords.has(word)) {
        positive += intensity;
      }
      if (negativeWords.has(word)) {
        negative += intensity;
      }
      
      // Reset intensity for next word
      intensity = 1;
    }
    
    const total = positive + negative || 1; // Avoid division by zero
    const sentiment = positive / (positive + negative) || 0.5; // Default to neutral if no sentiment words
    const confidence = Math.min((total / words.length) * 2, 1);
    
    return { sentiment, confidence };
  }

  private analyzeTextClarity(text: string): number {
    // Enhanced clarity analysis
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    let clarity = 0;
    
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/);
      
      // Factors affecting clarity:
      // 1. Sentence length (optimal between 10-20 words)
      const lengthScore = Math.min(words.length / 10, 1) * (1 - Math.max(0, (words.length - 20) / 20));
      
      // 2. Word variety (unique words ratio)
      const uniqueWords = new Set(words.map(w => w.toLowerCase()));
      const varietyScore = uniqueWords.size / words.length;
      
      // 3. Punctuation usage
      const hasPunctuation = /[,;:]/.test(sentence);
      const punctuationScore = hasPunctuation ? 0.2 : 0;
      
      clarity += (lengthScore * 0.5 + varietyScore * 0.3 + punctuationScore * 0.2);
    });
    
    return sentences.length ? clarity / sentences.length : 0;
  }

  private analyzeTextEngagement(text: string): number {
    // Enhanced engagement analysis
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    
    // Factors affecting engagement:
    // 1. Punctuation variety
    const punctuationScore = Math.min((exclamationCount + questionCount) / 3, 1);
    
    // 2. Vocabulary richness
    const vocabularyScore = Math.min(uniqueWords.size / (words.length * 0.7), 1);
    
    // 3. Message length engagement (optimal between 5-30 words)
    const lengthScore = Math.min(words.length / 5, 1) * (1 - Math.max(0, (words.length - 30) / 30));
    
    // 4. Personal pronouns (I, we, you) indicate direct engagement
    const personalPronouns = ['i', 'we', 'you', 'my', 'our', 'your'];
    const pronounCount = words.filter(word => personalPronouns.includes(word)).length;
    const pronounScore = Math.min(pronounCount / 2, 1);
    
    return (punctuationScore * 0.2 + vocabularyScore * 0.3 + lengthScore * 0.2 + pronounScore * 0.3);
  }

  public async analyzeText(text: string): Promise<EmotionalState> {
    if (!this.initialized) {
      throw new Error('TensorflowService not initialized');
    }

    try {
      const sentimentAnalysis = this.analyzeTextSentiment(text);
      const clarity = this.analyzeTextClarity(text);
      const engagement = this.analyzeTextEngagement(text);
      
      // More nuanced stress calculation
      // Low sentiment doesn't always mean high stress
      // Consider both sentiment and confidence
      const baseStress = (1 - sentimentAnalysis.sentiment) * 70; // Reduced maximum stress
      const confidenceAdjustment = (1 - sentimentAnalysis.confidence) * 30; // Uncertainty adds some stress
      const stress = Math.min(baseStress + confidenceAdjustment, 100);
      
      return {
        stress: Math.round(stress),
        clarity: Math.round(clarity * 100),
        engagement: Math.round(engagement * 100)
      };
    } catch (error) {
      console.error('Error in text analysis:', error);
      throw error;
    }
  }

  public async trainModel(trainingData: { text: string; emotions: EmotionalState }[]) {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Preprocess training data
      const inputs = trainingData.map(data => this.preprocessText(data.text));
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
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss}`);
          },
        },
      });

      // Cleanup
      xs.dispose();
      ys.dispose();
      inputs.forEach(tensor => tensor.dispose());
    } catch (error) {
      console.error('Error training model:', error);
      throw error;
    }
  }

  public async extractAudioFeatures(buffer: ArrayBuffer): Promise<AudioFeatures> {
    // Convert audio buffer to tensor
    const audioData = new Float32Array(buffer);
    const audioTensor = tf.tensor1d(audioData);

    // Extract features
    const spectralFeatures = await this.extractSpectralFeatures(audioTensor);
    const temporalFeatures = await this.extractTemporalFeatures(audioTensor);
    const mfccFeatures = await this.extractMFCCFeatures(audioTensor);

    // Cleanup
    audioTensor.dispose();

    return {
      spectralFeatures,
      temporalFeatures,
      mfccFeatures
    };
  }

  private async extractSpectralFeatures(audioTensor: tf.Tensor1D): Promise<Float32Array> {
    // Implement spectral feature extraction
    return new Float32Array(128);
  }

  private async extractTemporalFeatures(audioTensor: tf.Tensor1D): Promise<Float32Array> {
    // Implement temporal feature extraction
    return new Float32Array(128);
  }

  private async extractMFCCFeatures(audioTensor: tf.Tensor1D): Promise<Float32Array> {
    // Implement MFCC feature extraction
    return new Float32Array(128);
  }

  // Add audio analysis method
  public async analyzeAudio(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    try {
      // Convert ArrayBuffer to Float32Array for analysis
      const audioData = new Float32Array(audioBuffer);
      
      // Extract audio features
      const features = await tf.tidy(() => {
        const tensor = tf.tensor1d(audioData);
        
        // Calculate energy
        const energy = tf.mean(tf.abs(tensor)).dataSync()[0];
        
        // Calculate zero crossings
        const zeroCrossings = tf.sum(
          tf.sign(tensor.slice(1)).sub(tf.sign(tensor.slice(0, -1))).abs()
        ).dataSync()[0] / 2;
        
        // Calculate spectral features
        const fft = tf.spectral.rfft(tensor);
        const magnitude = tf.abs(fft);
        const spectralEnergy = tf.mean(magnitude).dataSync()[0];
        
        return {
          energy,
          zeroCrossings,
          spectralEnergy
        };
      });
      
      // Convert features to emotional state
      const stress = Math.min(100, Math.max(0, Math.round(
        50 + // Base level
        (features.energy * 50) + // Higher energy = more stress
        (features.zeroCrossings / 100) // More zero crossings = more stress
      )));
      
      const clarity = Math.min(100, Math.max(0, Math.round(
        50 + // Base level
        (features.spectralEnergy * 30) + // Better spectral energy = more clarity
        ((1 - features.zeroCrossings / 1000) * 20) // Fewer zero crossings = more clarity
      )));
      
      const engagement = Math.min(100, Math.max(0, Math.round(
        50 + // Base level
        (features.energy * 30) + // Higher energy = more engagement
        (features.spectralEnergy * 20) // Better spectral energy = more engagement
      )));
      
      return {
        stress,
        clarity,
        engagement
      };
    } catch (error) {
      console.error('Error analyzing audio:', error);
      // Return baseline values if analysis fails
      return {
        stress: 50,
        clarity: 50,
        engagement: 50
      };
    }
  }

  public async analyze(input: any, type: 'text' | 'audio' | 'video'): Promise<EmotionalState | null> {
    if (!this.initialized) {
      console.warn('TensorflowService not initialized');
      return null;
    }

    try {
      switch (type) {
        case 'text':
          return await this.analyzeText(input);
        case 'audio':
          return await this.analyzeAudio(input);
        case 'video':
          return await this.analyzeVideo(input);
        default:
          throw new Error(`Unsupported analysis type: ${type}`);
      }
    } catch (error) {
      console.error(`Error in TensorFlow analysis for ${type}:`, error);
      return null;
    }
  }

  private async analyzeVideo(frame: ImageData | HTMLVideoElement): Promise<EmotionalState> {
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

      return {
        stress: Math.round(values[0] * 100),
        clarity: Math.round(values[1] * 100),
        engagement: Math.round(values[2] * 100)
      };
    } catch (error) {
      console.error('Error analyzing video frame:', error);
      return this.getDefaultState();
    }
  }

  private getDefaultState(): EmotionalState {
    return {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
  }
} 