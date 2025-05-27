'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, addToHistory, setMode, resetEmotionalStates, addTextMessage } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService, IEmotionAnalysisService } from '@/services/emotionAnalysis';
import { EmotionalState } from '@/types/emotions';
import { debounce } from 'lodash';
import { LLMService } from '@/services/llmService';
import Settings from '@/components/Settings';

interface Message {
  id: string;
  text: string;
  timestamp: number;
  emotionalState: EmotionalState;
  analysis?: string;
  suggestions?: string[];
  confidence?: number;
}

const TextChat: React.FC = () => {
  const dispatch = useDispatch();
  const { emotionalStates, textMessages } = useSelector((state: RootState) => state.communication);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [emotionService, setEmotionService] = useState<IEmotionAnalysisService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentEmotionalState = emotionalStates.text;
  const analysisAbortController = useRef<AbortController | null>(null);
  const lastAnalysisTimestamp = useRef<number>(0);
  const MIN_ANALYSIS_INTERVAL = 2000; // 2 seconds between analyses
  const [messages, setMessages] = useState<Message[]>([]);
  const [llmService, setLlmService] = useState<LLMService | null>(null);

  // Add active modalities state
  const [activeModalities, setActiveModalities] = useState({
    text: 0,
    audio: 0,
    video: 0
  });

  // Add function to update active modalities
  const updateActiveModalities = useCallback((emotionalState: EmotionalState, confidence: number) => {
    const textActivity = calculateModalityActivity(emotionalState, confidence);
    setActiveModalities(prev => ({
      ...prev,
      text: textActivity
    }));
  }, []);

  const calculateModalityActivity = (emotionalState: EmotionalState, confidence: number): number => {
    const { stress, clarity, engagement } = emotionalState;
    
    // Calculate base activity from emotional metrics
    const metricsScore = (clarity * 0.4 + engagement * 0.4 + (100 - stress) * 0.2) / 100;
    
    // Adjust by confidence
    const activityScore = metricsScore * confidence;
    
    // Return as percentage
    return Math.round(activityScore * 100);
  };

  const scrollToBottom = () => {
    try {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    } catch (error) {
      console.warn('ScrollIntoView not supported:', error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [textMessages]);

  const initService = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      
      const llmService = LLMService.getInstance();
      setLlmService(llmService);

      // Check if API key is configured
      if (!llmService.hasValidConfiguration()) {
        setIsSettingsOpen(true); // Automatically open settings if API key is not configured
        throw new Error('Please configure your API key in settings to enable analysis.');
      }

      const service = await EmotionAnalysisService.getInstance();
      
      setEmotionService(service);
      dispatch(setMode('text'));
      
      // Set default emotional state to avoid NaN
      const defaultState = {
        emotionalState: {
          stress: 50,
          clarity: 50,
          engagement: 50
        },
        confidence: 0.3,
        weight: 1
      };
      
      dispatch(updateEmotionalState(defaultState));
      dispatch(resetEmotionalStates());
    } catch (error) {
      console.error('Error initializing services:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize services. Please check your API key in settings.');
    } finally {
      setIsInitializing(false);
    }
  };

  // Initialize emotion service
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (mounted) {
        await initService();
      }
    };

    init();
    
    return () => {
      mounted = false;
      dispatch(resetEmotionalStates());
      dispatch(setMode('text'));
    };
  }, [dispatch]);

  const analyzeText = async (text: string): Promise<{
    emotionalState: EmotionalState;
    analysis: string;
    suggestions: string[];
    confidence: number;
  }> => {
    if (!emotionService) {
      throw new Error('Emotion analysis service not initialized');
    }

    try {
      // Analyze text using emotion service
      const result = await emotionService.analyzeText(text);
      
      // Calculate confidence based on text characteristics
      const confidence = calculateConfidence(result.emotionalState, text);
      
      // Generate analysis and suggestions
      const analysis = generateAnalysis(result.emotionalState, text);
      const suggestions = generateSuggestions(result.emotionalState, text);
      
      // Update Redux state with new emotional state and confidence
      dispatch(updateEmotionalState({
        emotionalState: result.emotionalState,
        confidence,
        weight: 1
      }));
      
      return {
        emotionalState: result.emotionalState,
        analysis,
        suggestions,
        confidence
      };
    } catch (error) {
      console.error('Error analyzing text:', error);
      throw error;
    }
  };

  const generateAnalysis = (emotionalState: EmotionalState, text: string): string => {
    const { stress, clarity, engagement } = emotionalState;
    const analyses: string[] = [];
    
    // Consider message content
    const wordCount = text.trim().split(/\s+/).length;
    const hasQuestions = text.includes('?');
    const hasPunctuation = /[!.,;:]/.test(text);
    const isShortMessage = wordCount < 5;

    // Stress analysis with context
    if (stress > 80) {
      analyses.push('Your message conveys intense emotional intensity.');
    } else if (stress > 60) {
      analyses.push('There\'s noticeable tension in your communication.');
    } else if (stress > 40) {
      analyses.push('Your stress level is balanced.');
    } else if (stress > 20) {
      analyses.push('Your message shows good composure.');
    } else {
      analyses.push('Your message shows excellent calmness and composure.');
    }

    // Clarity analysis with context
    if (clarity > 80) {
      analyses.push(hasPunctuation 
        ? 'Your communication is exceptionally well-structured and precise.'
        : 'Your message is very clear, though adding punctuation could help.');
    } else if (clarity > 60) {
      analyses.push(isShortMessage
        ? 'Your concise message is clear and effective.'
        : 'Your detailed message is well-structured and clear.');
    } else if (clarity > 40) {
      analyses.push('Your clarity is adequate but could be enhanced.');
    } else if (clarity > 20) {
      analyses.push('Your message could benefit from more structured expression.');
    } else {
      analyses.push('Consider restructuring your message for better clarity.');
    }

    // Engagement analysis with context
    if (engagement > 80) {
      analyses.push(hasQuestions 
        ? 'You show excellent engagement through interactive questioning.'
        : 'You show strong enthusiasm in your message.');
    } else if (engagement > 60) {
      analyses.push('Your message is engaging and well-connected.');
    } else if (engagement > 40) {
      analyses.push(isShortMessage
        ? 'Your brief message maintains moderate engagement.'
        : 'Your engagement level is moderate.');
    } else if (engagement > 20) {
      analyses.push('Your message could be more engaging.');
    } else {
      analyses.push('Consider adding more engaging elements to your message.');
    }

    return analyses.join(' ');
  };

  const generateSuggestions = (emotionalState: EmotionalState, text: string): string[] => {
    const suggestions: string[] = [];
    const { stress, clarity, engagement } = emotionalState;
    
    // Consider message characteristics
    const wordCount = text.trim().split(/\s+/).length;
    const hasQuestions = text.includes('?');
    const hasPunctuation = /[!.,;:]/.test(text);

    // Stress-based suggestions with context
    if (stress > 70) {
      suggestions.push('Try using more measured and calm language');
      suggestions.push(wordCount > 20 
        ? 'Consider breaking your message into shorter, calmer statements'
        : 'Take a moment to express your thoughts more calmly');
    } else if (stress < 30 && clarity < 50) {
      suggestions.push('While maintaining calmness, try to be more specific');
      suggestions.push('Add more structure to your relaxed communication');
    }

    // Clarity-based suggestions with context
    if (clarity < 60) {
      if (!hasPunctuation) {
        suggestions.push('Use punctuation to better structure your thoughts');
      }
      if (wordCount < 5) {
        suggestions.push('Consider providing more context in your message');
      } else {
        suggestions.push('Break down complex ideas into clearer statements');
      }
    } else if (clarity > 80 && engagement < 50) {
      suggestions.push('While maintaining clarity, add more engaging elements');
      suggestions.push('Balance precision with a conversational tone');
    }

    // Engagement-based suggestions with context
    if (engagement < 50) {
      if (!hasQuestions) {
        suggestions.push('Try adding questions to encourage interaction');
      }
      suggestions.push('Use more dynamic and expressive language');
      if (wordCount > 20) {
        suggestions.push('Consider making your key points more prominent');
      }
    }

    return Array.from(new Set(suggestions));
  };

  const calculateConfidence = (emotionalState: EmotionalState, text: string): number => {
    const { stress, clarity, engagement } = emotionalState;
    let confidence = 0.3; // Base confidence

    // Text length factor
    const words = text.trim().split(/\s+/).length;
    if (words >= 3) confidence += 0.1;
    if (words >= 5) confidence += 0.1;
    if (words >= 10) confidence += 0.1;

    // Punctuation and structure
    const hasPunctuation = /[!.,;?]/.test(text);
    if (hasPunctuation) confidence += 0.1;

    // Emotional expression
    const hasEmotionalWords = /(?:feel|think|believe|happy|sad|angry|excited|worried|concerned)/i.test(text);
    if (hasEmotionalWords) confidence += 0.1;

    // Metric consistency
    const metrics = [stress, clarity, engagement];
    const variance = calculateVariance(metrics);
    if (variance < 400) confidence += 0.1; // Low variance indicates consistent analysis

    // Cap confidence at 0.95
    return Math.min(0.95, confidence);
  };

  const calculateVariance = (numbers: number[]): number => {
    const mean = numbers.reduce((a, b) => a + b) / numbers.length;
    return numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
  };

  // Validate input text
  const validateInput = (text: string): boolean => {
    if (!text.trim()) return false;
    if (text.length < 2 || text.length > 2000) return false;
    if (text.trim().split(/\s+/).length < 2) return false;
    return true;
  };

  // Cancel any ongoing analysis
  const cancelOngoingAnalysis = () => {
    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
      analysisAbortController.current = null;
    }
  };

  // Debounced analysis with rate limiting
  const debouncedAnalysis = useCallback(
    debounce(async (text: string) => {
      if (!validateInput(text)) return;

      const now = Date.now();
      if (now - lastAnalysisTimestamp.current < MIN_ANALYSIS_INTERVAL) return;

      cancelOngoingAnalysis();
      analysisAbortController.current = new AbortController();

      try {
        setIsAnalyzing(true);
        const result = await analyzeText(text);
        if (!analysisAbortController.current.signal.aborted) {
          updateActiveModalities(result.emotionalState, result.confidence);
          lastAnalysisTimestamp.current = now;
        }
      } catch (error) {
        if (!analysisAbortController.current.signal.aborted) {
          console.error('Analysis error:', error);
          setError('Analysis failed. Please try again.');
        }
      } finally {
        if (!analysisAbortController.current.signal.aborted) {
          setIsAnalyzing(false);
        }
      }
    }, 500),
    [analyzeText, updateActiveModalities]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelOngoingAnalysis();
      debouncedAnalysis.cancel();
    };
  }, [debouncedAnalysis]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInput(inputText)) {
      setError('Please enter a valid message (2-2000 characters, at least 2 words).');
      return;
    }

    if (!llmService?.hasValidConfiguration()) {
      setError('Please configure your API key in settings (gear icon). Click the gear icon in the top right to open settings.');
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    cancelOngoingAnalysis();

    try {
      const result = await llmService.analyzeText(inputText);
      
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newMessage: Message = {
        id: messageId,
        text: inputText,
        timestamp: Date.now(),
        emotionalState: result.emotionalState,
        analysis: result.raw,
        suggestions: result.suggestions,
        confidence: result.confidence || 0.95
      };

      setMessages(prev => [...prev, newMessage]);
      setInputText('');
      updateActiveModalities(result.emotionalState, result.confidence || 0.95);

      // Update global emotional state
      dispatch(updateEmotionalState({
        emotionalState: result.emotionalState,
        confidence: result.confidence || 0.95,
        weight: 1.0
      }));

    } catch (error) {
      console.error('Analysis error:', error);
      let errorMessage = 'Failed to analyze message. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          errorMessage = 'Please check your API key in settings (gear icon). Make sure it starts with "sk-" and is properly formatted.';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (error.message.includes('quota exceeded')) {
          errorMessage = 'API quota exceeded. Please check your billing status in your OpenAI account.';
        } else if (error.message.includes('not initialized') || error.message.includes('not configured')) {
          errorMessage = 'Please configure your API key in settings. Click the gear icon in the top right to open settings.';
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
    setError(null);

    if (validateInput(newText)) {
      debouncedAnalysis(newText);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-white">Text Communication</h2>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors relative"
            aria-label="Settings"
          >
            <svg
              className="w-6 h-6 text-gray-400 hover:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {!llmService?.hasValidConfiguration() && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
            )}
          </button>
        </div>
        <p className="text-gray-400">Type your message and get real-time emotional analysis</p>
        {error && (
          <div className="mt-2 text-red-400 text-sm bg-red-900/20 p-2 rounded">{error}</div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className="bg-gray-800 rounded-lg p-4 shadow-lg"
          >
            {/* Message content */}
            <div className="text-white mb-3">{message.text}</div>
            
            {/* Analysis */}
            {message.analysis && (
              <div className="text-sm text-gray-300 mb-2">{message.analysis}</div>
            )}
            {message.suggestions && message.suggestions.length > 0 && (
              <div>
                <div className="text-sm text-gray-400 mb-1">Suggestions:</div>
                <ul className="list-disc list-inside text-sm text-gray-300">
                  {message.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="mt-auto">
        <div className="flex gap-2">
          <textarea
            value={inputText}
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
            disabled={isAnalyzing || isInitializing}
          />
          <button
            type="submit"
            disabled={isAnalyzing || isInitializing || !validateInput(inputText)}
            className={`px-4 py-2 rounded-lg ${
              isAnalyzing || isInitializing || !validateInput(inputText)
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            {isAnalyzing ? 'Analyzing...' : 'Send'}
          </button>
        </div>
      </form>

      {/* Settings Dialog */}
      <Settings 
        isOpen={isSettingsOpen} 
        onClose={() => {
          setIsSettingsOpen(false);
          // Reinitialize services after settings are closed
          initService();
        }} 
      />
    </div>
  );
};

export default TextChat; 