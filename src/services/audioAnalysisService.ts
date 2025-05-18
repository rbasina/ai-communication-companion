import * as tf from '@tensorflow/tfjs';
import { EmotionalState } from '@/types/emotions';

export class AudioAnalysisService {
  private static instance: AudioAnalysisService;
  private static initializationPromise: Promise<void> | null = null;
  private model: tf.LayersModel | null = null;
  private sampleRate = 16000; // Standard sample rate for speech
  private frameLength = 1024; // Frame size for audio processing
  private hopLength = 512; // Number of samples between successive frames
  private modelInitialized = false;

  private constructor() {
    // Don't initialize in constructor
  }

  public static async getInstance(): Promise<AudioAnalysisService> {
    if (!AudioAnalysisService.instance) {
      AudioAnalysisService.instance = new AudioAnalysisService();
      // Initialize only once
      if (!AudioAnalysisService.initializationPromise) {
        AudioAnalysisService.initializationPromise = AudioAnalysisService.instance.initializeModel();
      }
      try {
        // Wait for initialization
        await AudioAnalysisService.initializationPromise;
      } catch (error) {
        console.error('Failed to initialize AudioAnalysisService:', error);
        AudioAnalysisService.initializationPromise = null; // Reset promise to allow retry
        throw error;
      }
    }
    return AudioAnalysisService.instance;
  }

  private async initializeModel() {
    if (this.modelInitialized) {
      console.log('Model already initialized');
      return;
    }

    try {
      console.log('Initializing audio analysis model...');

      // Make sure TensorFlow.js is ready
      await tf.ready();
      console.log('TensorFlow.js ready');

      // Create a simpler model architecture for audio analysis
      const model = tf.sequential();

      // Input layer for spectrogram features
      model.add(tf.layers.conv2d({
        inputShape: [128, 128, 1],
        filters: 16,
        kernelSize: [3, 3],
        activation: 'relu',
        padding: 'same',
        kernelInitializer: 'glorotNormal'
      }));

      model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));

      // Second convolutional block
      model.add(tf.layers.conv2d({
        filters: 32,
        kernelSize: [3, 3],
        activation: 'relu',
        padding: 'same'
      }));

      model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));

      // Flatten and dense layers
      model.add(tf.layers.flatten());
      
      model.add(tf.layers.dense({
        units: 64,
        activation: 'relu',
        kernelInitializer: 'glorotNormal'
      }));

      // Output layer for emotional states
      model.add(tf.layers.dense({
        units: 3,
        activation: 'sigmoid',
        kernelInitializer: 'glorotNormal'
      }));

      // Compile with appropriate loss and optimizer
      await model.compile({
        optimizer: tf.train.adam(0.0001),
        loss: 'meanSquaredError',
        metrics: ['accuracy']
      });

      // Initialize with default weights
      const dummyData = tf.zeros([1, 128, 128, 1]);
      const prediction = model.predict(dummyData) as tf.Tensor;
      
      // Verify model output
      const values = await prediction.data();
      if (values.length !== 3) {
        throw new Error('Model initialization failed: incorrect output dimension');
      }

      // Initialize with reasonable default values
      const defaultWeights = model.getWeights().map(w => {
        const shape = w.shape;
        return tf.randomNormal(shape, 0, 0.1);
      });
      
      model.setWeights(defaultWeights);

      // Cleanup
      prediction.dispose();
      dummyData.dispose();
      defaultWeights.forEach(w => w.dispose());

      this.model = model;
      this.modelInitialized = true;
      console.log('Audio analysis model initialized successfully');

    } catch (error) {
      console.error('Error initializing audio analysis model:', error);
      this.modelInitialized = false;
      this.model = null;
      throw new Error('Failed to initialize audio analysis model. Please refresh the page and try again.');
    }
  }

  private async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
    try {
      console.log('Decoding audio data...', { bufferSize: arrayBuffer.byteLength });
      // Create a temporary audio context for decoding
      const audioContext = new AudioContext({ sampleRate: this.sampleRate });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Get the audio data
      const channelData = audioBuffer.getChannelData(0); // Get mono channel
      
      // Resample if necessary
      if (audioBuffer.sampleRate !== this.sampleRate) {
        console.log(`Resampling audio from ${audioBuffer.sampleRate}Hz to ${this.sampleRate}Hz`);
        // Simple resampling by averaging
        const ratio = audioBuffer.sampleRate / this.sampleRate;
        const newLength = Math.floor(channelData.length / ratio);
        const resampledData = new Float32Array(newLength);
        
        for (let i = 0; i < newLength; i++) {
          const start = Math.floor(i * ratio);
          const end = Math.floor((i + 1) * ratio);
          let sum = 0;
          for (let j = start; j < end; j++) {
            sum += channelData[j];
          }
          resampledData[i] = sum / (end - start);
        }
        console.log('Resampling complete', { 
          originalLength: channelData.length, 
          newLength: resampledData.length 
        });
        return resampledData;
      }
      
      console.log('Audio decoding complete', { 
        length: channelData.length,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration
      });
      return channelData;
    } catch (error) {
      console.error('Error decoding audio:', error);
      throw new Error('Failed to decode audio data. Please try recording again.');
    }
  }

  private async convertAudioBufferToTensor(audioBuffer: ArrayBuffer): Promise<tf.Tensor4D> {
    try {
      console.log('Converting audio buffer to tensor...', { bufferSize: audioBuffer.byteLength });
      
      // Decode audio data
      const audioData = await this.decodeAudioData(audioBuffer);
      
      if (audioData.length === 0) {
        throw new Error('Empty audio data received');
      }

      // Ensure minimum length
      const minLength = this.frameLength * 2;
      if (audioData.length < minLength) {
        throw new Error('Audio recording is too short. Please record for at least 1 second.');
      }

      // Process in smaller chunks to avoid memory issues
      const chunkSize = 16000; // 1 second of audio at 16kHz
      const chunks: Float32Array[] = [];
      
      for (let i = 0; i < audioData.length; i += chunkSize) {
        const chunk = audioData.slice(i, i + chunkSize);
        chunks.push(chunk);
      }

      // Process each chunk with validation
      const spectrograms = await Promise.all(chunks.map(async (chunk, index) => {
        // Create and validate signal tensor
        const signal = tf.tensor1d(chunk);
        const signalMax = await tf.max(tf.abs(signal)).data();
        
        // Avoid division by zero or very small values
        const normalizedSignal = signalMax[0] > 1e-6 
          ? tf.div(signal, signalMax[0])
          : signal;
        
        // Compute spectrogram with explicit typing
        const stft = tf.signal.stft(
          normalizedSignal as tf.Tensor1D,
          this.frameLength,
          this.hopLength,
          this.frameLength,
          tf.signal.hannWindow
        );
        
        const magnitudes = tf.abs(stft);
        
        // Add small epsilon to avoid log(0)
        const stabilizedMagnitudes = tf.add(magnitudes, 1e-6);
        const melSpec = tf.log(stabilizedMagnitudes);
        
        // Cleanup
        signal.dispose();
        normalizedSignal.dispose();
        stft.dispose();
        magnitudes.dispose();
        stabilizedMagnitudes.dispose();
        
        return melSpec;
      }));

      // Combine spectrograms
      const combined = tf.concat(spectrograms, 0);
      spectrograms.forEach(spec => spec.dispose());

      // Robust normalization
      const min = tf.min(combined);
      const max = tf.max(combined);
      const range = tf.sub(max, min);
      
      // Avoid division by zero
      const rangeValue = await range.data();
      const normalized = rangeValue[0] > 1e-6
        ? tf.div(tf.sub(combined, min), range)
        : tf.zeros(combined.shape);
      
      // Cleanup
      combined.dispose();
      min.dispose();
      max.dispose();
      range.dispose();

      // Resize to expected dimensions with validation
      const reshaped = tf.expandDims(normalized, -1) as tf.Tensor3D;
      normalized.dispose();

      const resized = tf.image.resizeBilinear(reshaped, [128, 128]);
      reshaped.dispose();

      // Add batch dimension
      const batched = tf.expandDims(resized, 0) as tf.Tensor4D;
      resized.dispose();

      // Validate final tensor
      const finalData = await batched.data();
      const finalDataArray = Array.from(finalData);
      const hasInvalidValues = finalDataArray.some(val => isNaN(val) || !isFinite(val));
      
      if (hasInvalidValues) {
        console.warn('Invalid values in final tensor, using zero tensor');
        batched.dispose();
        return tf.zeros([1, 128, 128, 1]);
      }

      console.log('Tensor conversion complete', {
        shape: batched.shape,
        dtype: batched.dtype,
        min: Math.min(...finalDataArray),
        max: Math.max(...finalDataArray)
      });

      return batched;
    } catch (error) {
      console.error('Error in audio preprocessing:', error);
      // Return zero tensor on error
      return tf.zeros([1, 128, 128, 1]);
    }
  }

  private convertToMelScale(spectrogram: tf.Tensor): tf.Tensor {
    try {
      // Improved mel-scale conversion
      const scaled = tf.mul(spectrogram, 10.0);
      const stabilized = tf.add(scaled, 1e-6);
      const logScale = tf.log(stabilized);
      
      // Cleanup
      scaled.dispose();
      stabilized.dispose();
      
      return logScale;
    } catch (error) {
      console.error('Error in mel-scale conversion:', error);
      throw new Error('Failed to convert audio features. Please try recording again.');
    }
  }

  public async analyzeAudio(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    console.log('Starting audio analysis...', { bufferSize: audioBuffer.byteLength });

    // Define baseline values - adjusted for more natural speech
    const baselineValues = {
      stress: 45,    // Lowered from 55 to better reflect normal speech
      clarity: 60,   // Increased from 54 to set a higher standard
      engagement: 58 // Maintained as is
    };

    if (!this.model || !this.modelInitialized) {
      console.log('Model not ready, using baseline values');
      return baselineValues;
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      console.error('Invalid audio data received');
      return baselineValues;
    }

    let input: tf.Tensor4D | null = null;
    let prediction: tf.Tensor | null = null;

    try {
      // Process audio data
      input = await this.convertAudioBufferToTensor(audioBuffer);

      // Verify tensor shape and values
      const shape = input.shape;
      console.log('Input tensor shape:', shape);

      // Check for NaN or Infinity in input tensor
      const inputData = await input.data();
      const hasInvalidValues = inputData.some(val => isNaN(val) || !isFinite(val));
      if (hasInvalidValues) {
        console.warn('Invalid values in input tensor, using baseline values');
        return baselineValues;
      }

      if (shape.length !== 4 || shape[1] !== 128 || shape[2] !== 128 || shape[3] !== 1) {
        console.warn('Invalid input shape, using baseline values');
        return baselineValues;
      }

      // Make prediction with validation
      prediction = this.model.predict(input) as tf.Tensor;
      const values = await prediction.data();

      if (values.length !== 3) {
        console.warn('Invalid prediction length, using baseline values');
        return baselineValues;
      }

      // Validate prediction values
      if (values.some(v => isNaN(v) || !isFinite(v))) {
        console.warn('Invalid prediction values, using baseline values');
        return baselineValues;
      }

      // Enhanced normalization with adaptive blending
      const normalizedValues = values.map((value, index) => {
        // Ensure value is a number and in valid range
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
          return baselineValues[Object.keys(baselineValues)[index] as keyof EmotionalState];
        }

        // Convert sigmoid output (0-1) to percentage (0-100)
        const percentage = value * 100;
        
        // Get the baseline for this metric
        const baseline = baselineValues[Object.keys(baselineValues)[index] as keyof EmotionalState];
        
        // Adaptive blending based on the metric type and value
        let blendRatio: number;
        if (index === 0) { // Stress
          // More aggressive smoothing for stress to prevent spikes
          blendRatio = percentage > baseline ? 0.6 : 0.8; // Faster decrease, slower increase
        } else if (index === 1) { // Clarity
          // More responsive to clarity changes
          blendRatio = 0.75;
        } else { // Engagement
          // Standard blending
          blendRatio = 0.7;
        }
        
        // Apply adaptive blending
        const blended = (percentage * blendRatio) + (baseline * (1 - blendRatio));
        
        // Additional smoothing for stress metric
        if (index === 0) {
          // Prevent rapid stress increases
          const maxStressIncrease = 15; // Maximum allowed stress increase per analysis
          const previousStress = baselineValues.stress;
          if (blended > previousStress + maxStressIncrease) {
            return Math.round(previousStress + maxStressIncrease);
          }
        }
        
        // Ensure final value is in valid range
        return Math.max(0, Math.min(100, Math.round(blended)));
      });

      // Create final result with type safety
      const result: EmotionalState = {
        stress: normalizedValues[0],
        clarity: normalizedValues[1],
        engagement: normalizedValues[2]
      };

      // Final validation of result
      if (Object.values(result).some(v => isNaN(v) || !isFinite(v))) {
        console.warn('Invalid final values, using baseline values');
        return baselineValues;
      }

      console.log('Analysis complete with validation', result);
      return result;

    } catch (error) {
      console.error('Error analyzing audio:', error);
      return baselineValues;
    } finally {
      // Cleanup tensors
      if (input) {
        try {
          input.dispose();
        } catch (e) {
          console.warn('Error disposing input tensor:', e);
        }
      }
      if (prediction) {
        try {
          prediction.dispose();
        } catch (e) {
          console.warn('Error disposing prediction tensor:', e);
        }
      }
    }
  }

  public async trainModel(trainingData: { audio: ArrayBuffer; emotions: EmotionalState }[]) {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Preprocess training data
      const inputPromises = trainingData.map(data => this.convertAudioBufferToTensor(data.audio));
      const inputs = await Promise.all(inputPromises);

      const labels = trainingData.map(data => [
        data.emotions.stress / 100,
        data.emotions.clarity / 100,
        data.emotions.engagement / 100,
      ]);

      const xs = tf.concat(inputs);
      const ys = tf.tensor2d(labels);

      // Train the model with proper callback typing
      await this.model.fit(xs, ys, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: async (epoch: number, logs?: tf.Logs) => {
            console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss ?? 'N/A'}`);
          }
        }
      });

      // Cleanup
      xs.dispose();
      ys.dispose();
      inputs.forEach(tensor => tensor.dispose());
    } catch (error) {
      console.error('Error training audio model:', error);
      throw new Error('Failed to train audio model. Please try again.');
    }
  }
} 