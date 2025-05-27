// Initialize TensorFlow.js model for audio emotion analysis
async function initializeModel() {
  const model = tf.sequential();

  // Convolutional layers for processing spectrograms
  model.add(tf.layers.conv2d({
    inputShape: [128, 128, 1],
    filters: 32,
    kernelSize: [3, 3],
    activation: 'relu',
    padding: 'same',
    kernelInitializer: 'glorotNormal'
  }));

  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  model.add(tf.layers.dropout({ rate: 0.25 }));

  model.add(tf.layers.conv2d({
    filters: 64,
    kernelSize: [3, 3],
    activation: 'relu',
    padding: 'same'
  }));

  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  model.add(tf.layers.dropout({ rate: 0.25 }));

  model.add(tf.layers.conv2d({
    filters: 128,
    kernelSize: [3, 3],
    activation: 'relu',
    padding: 'same'
  }));

  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  model.add(tf.layers.dropout({ rate: 0.25 }));

  // Flatten and dense layers
  model.add(tf.layers.flatten());
  
  model.add(tf.layers.dense({
    units: 512,
    activation: 'relu',
    kernelInitializer: 'glorotNormal'
  }));

  model.add(tf.layers.dropout({ rate: 0.5 }));

  // Output layer for our three metrics
  model.add(tf.layers.dense({
    units: 3, // stress, clarity, engagement
    activation: 'sigmoid',
    kernelInitializer: 'glorotNormal'
  }));

  // Compile the model
  model.compile({
    optimizer: tf.train.adam(0.0001),
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  // Initialize with some reasonable weights
  const dummyData = tf.zeros([1, 128, 128, 1]);
  const prediction = model.predict(dummyData);
  prediction.dispose();
  dummyData.dispose();

  return model;
}

// Model configuration
const modelConfig = {
  inputShape: [128, 128, 1],  // Matches our spectrogram input
  outputShape: [3],           // Our three metrics
  metrics: ['stress', 'clarity', 'engagement'],
  version: '1.0.0',
  architecture: {
    type: 'CNN',
    layers: [
      { type: 'conv2d', filters: 32, kernelSize: [3, 3] },
      { type: 'maxPooling2d', poolSize: [2, 2] },
      { type: 'conv2d', filters: 64, kernelSize: [3, 3] },
      { type: 'maxPooling2d', poolSize: [2, 2] },
      { type: 'conv2d', filters: 128, kernelSize: [3, 3] },
      { type: 'maxPooling2d', poolSize: [2, 2] },
      { type: 'dense', units: 512 },
      { type: 'dense', units: 3 }
    ]
  },
  baselineValues: {
    stress: 45,
    clarity: 60,
    engagement: 58
  }
}; 