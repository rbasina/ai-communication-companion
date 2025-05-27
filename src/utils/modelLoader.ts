import * as tf from '@tensorflow/tfjs';

// Model configuration for audio emotion analysis
export const audioModelConfig = {
  modelPath: '/models/audio_emotion/converted/audio_emotion_model.json',
  inputShape: [128, 128, 1],
  outputUnits: 3,
};

// Load pre-trained model weights
export async function loadPretrainedModel(modelConfig: typeof audioModelConfig): Promise<tf.LayersModel> {
  try {
    // First try to load from the specified path
    try {
      console.log('Attempting to load pre-trained model from:', modelConfig.modelPath);
      const model = await tf.loadLayersModel(modelConfig.modelPath);
      console.log('Successfully loaded pre-trained model');
      return model;
    } catch (e) {
      console.warn('Could not load pre-trained model, falling back to creating new model:', e);
    }

    // If loading fails, create a new model with the same architecture
    console.log('Creating new model with matching architecture...');
    const model = tf.sequential();

    // Input layer for spectrogram features
    model.add(tf.layers.conv2d({
      inputShape: modelConfig.inputShape,
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
      units: modelConfig.outputUnits,
      activation: 'sigmoid',
      kernelInitializer: 'glorotNormal'
    }));

    // Compile with appropriate loss and optimizer
    await model.compile({
      optimizer: tf.train.adam(0.0001),
      loss: 'meanSquaredError',
      metrics: ['accuracy']
    });

    console.log('Created and compiled new model');
    return model;
  } catch (error) {
    console.error('Error in loadPretrainedModel:', error);
    throw new Error('Failed to initialize model');
  }
}

// Save model weights
export async function saveModelWeights(model: tf.LayersModel, modelConfig: typeof audioModelConfig): Promise<void> {
  try {
    await model.save(`file://${modelConfig.modelPath}`);
    console.log('Successfully saved model weights');
  } catch (error) {
    console.error('Error saving model weights:', error);
    throw error;
  }
} 