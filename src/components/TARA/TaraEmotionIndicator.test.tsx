import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TaraEmotionIndicator } from './TaraEmotionIndicator';
import { useEmotionDetection } from '@/hooks/useEmotionDetection';

// Mock the useEmotionDetection hook
jest.mock('@/hooks/useEmotionDetection');
const mockUseEmotionDetection = useEmotionDetection as jest.Mock;

// Mock framer-motion to avoid animation-related issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('TaraEmotionIndicator', () => {
  const defaultMockData = {
    currentEmotion: 'neutral' as const,
    emotionHistory: [],
    analysis: 'Test analysis',
    suggestions: ['Suggestion 1', 'Suggestion 2'],
  };

  beforeEach(() => {
    mockUseEmotionDetection.mockReturnValue(defaultMockData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default props', () => {
    render(<TaraEmotionIndicator />);
    expect(screen.getByText('😐')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    render(<TaraEmotionIndicator className="custom-class" />);
    const container = screen.getByText('😐').closest('.relative');
    expect(container).toHaveClass('custom-class');
  });

  it('passes conversationId to useEmotionDetection hook', () => {
    const conversationId = 'test-conversation';
    render(<TaraEmotionIndicator conversationId={conversationId} />);
    expect(mockUseEmotionDetection).toHaveBeenCalledWith(conversationId);
  });

  describe('renders correct emotion states', () => {
    const emotions = [
      { type: 'calm', emoji: '😌', color: 'bg-blue-500' },
      { type: 'happy', emoji: '😊', color: 'bg-yellow-500' },
      { type: 'sad', emoji: '😢', color: 'bg-slate-500' },
      { type: 'angry', emoji: '😠', color: 'bg-red-500' },
      { type: 'neutral', emoji: '😐', color: 'bg-gray-500' },
    ];

    emotions.forEach(({ type, emoji, color }) => {
      it(`renders ${type} emotion correctly`, () => {
        mockUseEmotionDetection.mockReturnValue({
          ...defaultMockData,
          currentEmotion: type,
        });

        render(<TaraEmotionIndicator />);
        
        expect(screen.getByText(emoji)).toBeInTheDocument();
        const container = screen.getByText(emoji).closest(`.${color}`);
        expect(container).toBeInTheDocument();
      });
    });
  });

  describe('tooltip behavior', () => {
    it('shows tooltip on hover', () => {
      render(<TaraEmotionIndicator />);
      
      const emotionContainer = screen.getByText('😐').closest('.cursor-help');
      expect(emotionContainer).toBeInTheDocument();
      
      if (emotionContainer) {
        fireEvent.mouseEnter(emotionContainer);
        expect(screen.getByText('Neutral')).toBeInTheDocument();
        expect(screen.getByText('Test analysis')).toBeInTheDocument();
        expect(screen.getByText('Suggestions:')).toBeInTheDocument();
        expect(screen.getByText('Suggestion 1')).toBeInTheDocument();
        expect(screen.getByText('Suggestion 2')).toBeInTheDocument();
      }
    });

    it('hides tooltip on mouse leave', () => {
      render(<TaraEmotionIndicator />);
      
      const emotionContainer = screen.getByText('😐').closest('.cursor-help');
      expect(emotionContainer).toBeInTheDocument();
      
      if (emotionContainer) {
        // Show tooltip
        fireEvent.mouseEnter(emotionContainer);
        expect(screen.getByText('Neutral')).toBeInTheDocument();
        
        // Hide tooltip
        fireEvent.mouseLeave(emotionContainer);
        expect(screen.queryByText('Neutral')).not.toBeInTheDocument();
      }
    });

    it('renders tooltip with no suggestions', () => {
      mockUseEmotionDetection.mockReturnValue({
        ...defaultMockData,
        suggestions: [],
      });

      render(<TaraEmotionIndicator />);
      
      const emotionContainer = screen.getByText('😐').closest('.cursor-help');
      if (emotionContainer) {
        fireEvent.mouseEnter(emotionContainer);
        expect(screen.queryByText('Suggestions:')).not.toBeInTheDocument();
      }
    });
  });

  describe('accessibility', () => {
    it('has appropriate cursor style for tooltip trigger', () => {
      render(<TaraEmotionIndicator />);
      const container = screen.getByText('😐').closest('.cursor-help');
      expect(container).toHaveClass('cursor-help');
    });

    it('emoji is not selectable', () => {
      render(<TaraEmotionIndicator />);
      const emoji = screen.getByText('😐');
      expect(emoji).toHaveClass('select-none');
    });
  });
}); 