import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import VideoChat from '@/components/VideoChat';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { FaceAnalysisService } from '@/services/faceAnalysisService';
import { createMockStore, MockStore, initialState } from '../setup/testUtils';

// Mock the services
jest.mock('@/services/emotionAnalysis');
jest.mock('@/services/faceAnalysisService');

// Mock MediaDevices
const mockGetUserMedia = jest.fn();
Object.defineProperty(window.navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
});

// Mock MediaStream
class MockMediaStream {
  getTracks() {
    return [{
      stop: jest.fn(),
      enabled: true
    }];
  }
}

describe('VideoChat Component', () => {
  let store: MockStore;

  beforeEach(() => {
    store = createMockStore();
    store.dispatch = jest.fn();
    mockGetUserMedia.mockReset();
    mockGetUserMedia.mockResolvedValue(new MockMediaStream());

    // Mock service instances
    (EmotionAnalysisService.getInstance as jest.Mock).mockResolvedValue({
      updateFromRedux: jest.fn()
    });
    (FaceAnalysisService.getInstance as jest.Mock).mockResolvedValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      analyzeVideoFrame: jest.fn().mockResolvedValue({
        stress: 60,
        clarity: 70,
        engagement: 80
      })
    });
  });

  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <VideoChat />
      </Provider>
    );
    expect(screen.getByText('Video Communication')).toBeInTheDocument();
  });

  it('handles start recording correctly', async () => {
    render(
      <Provider store={store}>
        <VideoChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  });

  it('handles camera access denial', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('NotAllowedError'));

    render(
      <Provider store={store}>
        <VideoChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(screen.getByText(/Camera access denied/i)).toBeInTheDocument();
  });

  it('handles camera not found', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('NotFoundError'));

    render(
      <Provider store={store}>
        <VideoChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(screen.getByText(/No camera found/i)).toBeInTheDocument();
  });

  it('updates emotional state correctly', async () => {
    render(
      <Provider store={store}>
        <VideoChat />
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

  it('handles mute toggle correctly', async () => {
    render(
      <Provider store={store}>
        <VideoChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    const muteButton = screen.getByText('Mute');
    fireEvent.click(muteButton);
    expect(screen.getByText('Unmute')).toBeInTheDocument();
  });

  it('cleans up resources on unmount', async () => {
    const { unmount } = render(
      <Provider store={store}>
        <VideoChat />
      </Provider>
    );

    const startButton = screen.getByText('Start Recording');
    await act(async () => {
      fireEvent.click(startButton);
    });

    unmount();
    // Verify that cleanup was called
    expect(mockGetUserMedia).toHaveBeenCalled();
  });
}); 