import { useState, useRef, useEffect, FormEvent, ChangeEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, addToHistory } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';
import { AIResponseService } from '@/services/aiResponse';
import { LanguageProcessingService } from '@/services/languageProcessingService';
import { Message } from '@/types/chat';

export default function TextChat() {
  const dispatch = useDispatch();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);
  const [aiService, setAIService] = useState<AIResponseService | null>(null);
  const [languageService, setLanguageService] = useState<LanguageProcessingService | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [useAdvancedLLM, setUseAdvancedLLM] = useState<boolean>(false);
  const [configReset, setConfigReset] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { emotionalStates } = useSelector((state: RootState) => state.communication);
  const currentEmotionalState = emotionalStates.text;
  
  // Function to reload configuration
  const reloadConfig = () => {
    setConfigReset(prev => prev + 1);
  };
  
  // Check if LLM is configured
  useEffect(() => {
    const apiKey = localStorage.getItem('llm-api-key');
    setUseAdvancedLLM(!!apiKey);
  }, [configReset]);

  // Initialize services
  useEffect(() => {
    const initServices = async () => {
      try {
        setIsInitializing(true);
        setError('Initializing services...');
        
        // Initialize services in parallel
        const [emotion, ai, language] = await Promise.all([
          EmotionAnalysisService.getInstance(),
          AIResponseService.getInstance(),
          LanguageProcessingService.getInstance()
        ]);
        
        setEmotionService(emotion);
        setAIService(ai);
        setLanguageService(language);
        
        // Configure language service with saved API key
        const apiKey = localStorage.getItem('llm-api-key');
        const endpoint = localStorage.getItem('llm-endpoint');
        const useProxy = localStorage.getItem('llm-use-proxy') !== 'false'; // default to true
        
        if (apiKey) {
          language.configure(apiKey, endpoint || undefined);
          language.setUseProxy(useProxy);
          setUseAdvancedLLM(true);
          console.log('LLM configured with saved API key and endpoint:', endpoint);
        } else {
          console.log('No API key found, using basic services');
          setUseAdvancedLLM(false);
        }
        
        setError(null);
      } catch (error) {
        console.error('Error initializing services:', error);
        setError('Failed to initialize services. Please refresh the page.');
      } finally {
        setIsInitializing(false);
      }
    };

    initServices();
  }, [configReset]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() || isAnalyzing || isInitializing) return;

    if (!emotionService) {
      setError('Services not initialized. Please wait a moment and try again.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: 'user',
      timestamp: Date.now(),
    };

    setMessages((prev: Message[]) => [...prev, newMessage]);
    setMessage('');

    try {
      let emotionalAnalysis;
      let response;
      
      // Use either the advanced LLM or the basic services
      if (useAdvancedLLM && languageService) {
        // Convert existing messages to the format required by the language service
        const conversationHistory = messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.text
        }));
        
        // Process with LLM
        const llmResponse = await languageService.processInput(message, conversationHistory);
        
        // Get emotional analysis and response text
        emotionalAnalysis = llmResponse.emotionalAnalysis || {
          stress: 50,
          clarity: 50,
          engagement: 50
        };
        response = llmResponse.text;
        
        console.log('Using advanced LLM for analysis and response:', llmResponse);
      } else {
        // Use basic services (fallback)
        emotionalAnalysis = await emotionService.analyzeText(message);
        
        if (aiService) {
          response = await aiService.generateResponse(
            message,
            emotionalAnalysis,
            messages.map((m: Message) => m.text)
          );
        } else {
          response = "I'm sorry, I can't generate a proper response at the moment.";
        }
        
        console.log('Using basic services for analysis and response');
      }

      // Update emotional state in Redux
      dispatch(updateEmotionalState(emotionalAnalysis));

      // Add to history
      dispatch(addToHistory({
        message: newMessage.text,
        emotionalState: emotionalAnalysis,
      }));

      // Add AI response to messages
      const aiResponse: Message = {
        id: Date.now().toString(),
        text: response,
        sender: 'ai',
        timestamp: Date.now(),
      };
      setMessages((prev: Message[]) => [...prev, aiResponse]);

    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : "I'm having trouble processing your message. Please try again.";
      
      // Add error message to chat
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: errorMessage,
          sender: 'ai',
          timestamp: Date.now(),
        },
      ]);
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  return (
    <div className="flex flex-col h-[600px] card">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p>Start a conversation</p>
            {useAdvancedLLM && (
              <div className="mt-2 text-xs bg-blue-100 p-2 rounded inline-block">
                Using advanced LLM for analysis and responses
              </div>
            )}
          </div>
        )}
        
        {messages.map((msg: Message) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.sender === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-900'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={handleInputChange}
            placeholder={isInitializing ? 'Initializing...' : 'Type your message...'}
            className="input flex-1"
            disabled={isAnalyzing || isInitializing}
          />
          <button
            type="submit"
            className={`btn-primary whitespace-nowrap ${
              (isAnalyzing || isInitializing) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isAnalyzing || isInitializing}
          >
            {isInitializing ? 'Initializing...' : isAnalyzing ? 'Processing...' : 'Send Message'}
          </button>
        </form>
        {error && (
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-red-600">{error}</p>
            <div className="flex space-x-2">
              <button 
                onClick={reloadConfig}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Reload Config
              </button>
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    // Remove the last AI message if it was an error
                    if (messages.length > 0 && messages[messages.length - 1].sender === 'ai') {
                      setMessages(messages.slice(0, -1));
                      setError(null);
                    }
                  }}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
        {useAdvancedLLM && !error && (
          <div className="mt-2 text-xs text-gray-500">
            Using advanced LLM for analysis and responses
          </div>
        )}
      </div>
    </div>
  );
} 