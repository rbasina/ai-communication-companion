// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.ResizeObserver
class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

window.ResizeObserver = ResizeObserverMock;

// Mock window.requestAnimationFrame
window.requestAnimationFrame = jest.fn().mockImplementation(cb => setTimeout(cb, 0));

// Mock window.cancelAnimationFrame
window.cancelAnimationFrame = jest.fn().mockImplementation(id => clearTimeout(id));

// Mock window.URL.createObjectURL
window.URL.createObjectURL = jest.fn();
window.URL.revokeObjectURL = jest.fn();

// Mock canvas
HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
  drawImage: jest.fn(),
  getImageData: jest.fn().mockReturnValue({
    data: new Uint8ClampedArray(100),
    width: 10,
    height: 10
  }),
  putImageData: jest.fn(),
  clearRect: jest.fn(),
  scale: jest.fn(),
  translate: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  fillRect: jest.fn(),
  fillText: jest.fn(),
  fill: jest.fn(),
  strokeRect: jest.fn(),
  arc: jest.fn(),
  restore: jest.fn(),
  save: jest.fn(),
  rotate: jest.fn()
});

// Mock WebGL context
HTMLCanvasElement.prototype.getContext = jest.fn().mockImplementation((contextType) => {
  if (contextType === 'webgl' || contextType === 'webgl2') {
    return {
      getExtension: jest.fn(),
      createShader: jest.fn(),
      createProgram: jest.fn(),
      createBuffer: jest.fn(),
      createTexture: jest.fn(),
      bindBuffer: jest.fn(),
      bindTexture: jest.fn(),
      bufferData: jest.fn(),
      texImage2D: jest.fn(),
      useProgram: jest.fn(),
      enableVertexAttribArray: jest.fn(),
      vertexAttribPointer: jest.fn(),
      drawArrays: jest.fn(),
      viewport: jest.fn(),
      clearColor: jest.fn(),
      clear: jest.fn(),
      VERTEX_SHADER: 'VERTEX_SHADER',
      FRAGMENT_SHADER: 'FRAGMENT_SHADER',
      ARRAY_BUFFER: 'ARRAY_BUFFER',
      TEXTURE_2D: 'TEXTURE_2D',
      FLOAT: 'FLOAT',
      TRIANGLES: 'TRIANGLES',
      COLOR_BUFFER_BIT: 'COLOR_BUFFER_BIT'
    };
  }
  return null;
});

// Mock TensorFlow.js
jest.mock('@tensorflow/tfjs', () => ({
  ready: jest.fn().mockResolvedValue(true),
  setBackend: jest.fn().mockResolvedValue(true),
  browser: {
    fromPixels: jest.fn().mockReturnValue({
      resizeBilinear: jest.fn().mockReturnThis(),
      expandDims: jest.fn().mockReturnThis(),
      toFloat: jest.fn().mockReturnThis(),
      div: jest.fn().mockReturnThis(),
      dispose: jest.fn()
    })
  },
  tensor: jest.fn().mockReturnValue({
    reshape: jest.fn().mockReturnThis(),
    dispose: jest.fn()
  }),
  tensor2d: jest.fn().mockReturnValue({
    reshape: jest.fn().mockReturnThis(),
    dispose: jest.fn()
  }),
  sequential: jest.fn().mockReturnValue({
    add: jest.fn(),
    compile: jest.fn().mockResolvedValue(true),
    predict: jest.fn().mockReturnValue({
      data: jest.fn().mockResolvedValue(new Float32Array([0.5, 0.5, 0.5])),
      dispose: jest.fn()
    })
  }),
  layers: {
    dense: jest.fn().mockReturnValue({}),
    conv2d: jest.fn().mockReturnValue({}),
    maxPooling2d: jest.fn().mockReturnValue({}),
    flatten: jest.fn().mockReturnValue({}),
    dropout: jest.fn().mockReturnValue({})
  }
}));

// Mock face-api.js
jest.mock('face-api.js', () => ({
  detectSingleFace: jest.fn().mockReturnValue({
    withFaceExpressions: jest.fn().mockResolvedValue({
      expressions: {
        neutral: 0.5,
        happy: 0.3,
        sad: 0.1,
        angry: 0.05,
        fearful: 0.02,
        disgusted: 0.02,
        surprised: 0.01
      }
    })
  }),
  TinyFaceDetectorOptions: jest.fn()
}));

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                text: "Test response",
                emotionalAnalysis: {
                  stress: 50,
                  clarity: 50,
                  engagement: 50
                }
              })
            }
          }]
        })
      }
    }
  }));
}); 