import * as tf from '@tensorflow/tfjs';
import { EmotionalState } from '@/types/emotions';

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

    try {
      console.log('Initializing TensorflowService...');
      await tf.ready();
      this.initialized = true;
      console.log('TensorflowService initialized successfully');
      this.initializeModel();
    } catch (error) {
      console.error('Error initializing TensorflowService:', error);
      throw error;
    }
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
} 