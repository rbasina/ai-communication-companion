import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import AudioChat from '@/components/AudioChat';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { createMockStore, MockStore, initialState } from '../setup/testUtils';

// Mock the services
jest.mock('@/services/emotionAnalysis');

// Mock MediaDevices
const mockGetUserMedia = jest.fn();
Object.defineProperty(window.navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
});

// Mock MediaRecorder
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockDataAvailable = jest.fn();
const mockError = jest.fn();

class MockMediaRecorder {
  state: string = 'inactive';
  ondataavailable: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream) {}

  start(timeslice?: number) {
    mockStart(timeslice);
    this.state = 'recording';
    const handler = this.ondataavailable;
    if (handler) {
      setTimeout(() => {
        handler({ data: new Blob() });
      }, 100);
    }
  }

  stop() {
    mockStop();
    this.state = 'inactive';
    const handler = this.onstop;
    if (handler) {
      handler();
    }
  }
}

// Mock MediaStream
class MockMediaStream {
  getTracks() {
    return [{
      stop: jest.fn(),
      enabled: true
    }];
  }
}

// Mock AudioContext
class MockAudioContext {
  createAnalyser() {
    return {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      connect: jest.fn(),
      disconnect: jest.fn(),
      getByteFrequencyData: jest.fn()
    };
  }

  createMediaStreamSource() {
    return {
      connect: jest.fn()
    };
  }

  close() {
    return Promise.resolve();
  }
}

describe('AudioChat Component', () => {
  let store: MockStore;

  beforeEach(() => {
    store = createMockStore();
    store.dispatch = jest.fn();
    mockGetUserMedia.mockReset();
    mockGetUserMedia.mockResolvedValue(new MockMediaStream());
    mockStart.mockReset();
    mockStop.mockReset();
    mockDataAvailable.mockReset();
    mockError.mockReset();

    // Mock window.AudioContext
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;

    // Mock MediaRecorder
    (window as any).MediaRecorder = MockMediaRecorder;
    MediaRecorder.isTypeSupported = jest.fn().mockReturnValue(true);

    // Mock service instance
    (EmotionAnalysisService.getInstance as jest.Mock).mockResolvedValue({
      analyzeAudio: jest.fn().mockResolvedValue({
        emotionalState: {
          stress: 60,
          clarity: 70,
          engagement: 80
        },
        analysis: "Test analysis",
        suggestions: ["Test suggestion"],
        confidence: 0.8
      })
    });
  });

  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );
    expect(screen.getByText('Audio Communication')).toBeInTheDocument();
  });

  it('handles start recording correctly', async () => {
    render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    expect(mockStart).toHaveBeenCalledWith(100);
  });

  it('handles microphone access denial', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('NotAllowedError'));

    render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(screen.getByText(/Failed to initialize audio recording/i)).toBeInTheDocument();
  });

  it('handles stop recording correctly', async () => {
    render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );

    // Start recording
    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    // Stop recording
    const stopButton = screen.getByText('Stop Recording');
    await act(async () => {
      fireEvent.click(stopButton);
    });

    expect(mockStop).toHaveBeenCalled();
  });

  it('updates emotional state during recording', async () => {
    render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    // Wait for emotion updates
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    const actions = store.getActions();
    expect(actions.some((action) => action.type === 'communication/updateEmotionalState')).toBe(true);
  });

  it('cleans up resources on unmount', async () => {
    const { unmount } = render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    unmount();
    expect(mockStop).toHaveBeenCalled();
  });

  it('handles audio processing errors gracefully', async () => {
    (EmotionAnalysisService.getInstance as jest.Mock).mockResolvedValue({
      analyzeAudio: jest.fn().mockRejectedValue(new Error('Analysis failed'))
    });

    render(
      <Provider store={store}>
        <AudioChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    // Wait for error handling
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    expect(screen.queryByText(/Analysis failed/i)).not.toBeInTheDocument();
  });
}); 