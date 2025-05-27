import { useState, useEffect } from 'react';
import { LanguageProcessingService } from '@/services/languageProcessingService';
import { LLMService } from '@/services/llmService';

const languageService = LanguageProcessingService.getInstance();

export default function LLMConfig() {
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [endpoint, setEndpoint] = useState<string>('https://api.openai.com/v1/chat/completions');
  const [model, setModel] = useState<string>('gpt-3.5-turbo');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('');
  const [testResponse, setTestResponse] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [useProxy, setUseProxy] = useState<boolean>(true);
  
  useEffect(() => {
    // Load saved values from localStorage
    const savedApiKey = localStorage.getItem('openai_api_key') || '';
    const savedEndpoint = localStorage.getItem('llm_endpoint') || 'https://api.openai.com/v1/chat/completions';
    const savedModel = localStorage.getItem('llm_model') || 'gpt-3.5-turbo';
    const savedUseProxy = localStorage.getItem('llm_use_proxy') !== 'false'; // default to true if not set
    
    setApiKey(savedApiKey);
    setEndpoint(savedEndpoint);
    setModel(savedModel);
    setUseProxy(savedUseProxy);
    
    // Configure service with saved values
    languageService.configure(savedApiKey, savedEndpoint);
    languageService.setUseProxy(savedUseProxy);
    
    if (savedApiKey) {
      setStatus('saved');
      setMessage('Configuration loaded from storage');
    }
  }, []);
  
  const saveConfig = async () => {
    // Reset status
    setStatus('idle');
    setMessage('');

    try {
      // Get LLM service instance
      const llmService = LLMService.getInstance();
      
      // Try to update the API key first - this will validate format
      await llmService.updateApiKey(apiKey);
      
      // Then validate with the API
      await llmService.validateApiKey(apiKey);

      // If we get here, both format and API validation passed
      localStorage.setItem('openai_api_key', apiKey);
      localStorage.setItem('llm_endpoint', endpoint);
      localStorage.setItem('llm_model', model);
      localStorage.setItem('llm_use_proxy', useProxy.toString());
      
      setStatus('saved');
      setMessage('API key validated and saved successfully! You can now return to the chat.');
    } catch (error) {
      console.error('Configuration error:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save configuration');
    }
  };
  
  const resetConfig = () => {
    setApiKey('');
    setEndpoint('https://api.openai.com/v1/chat/completions');
    setModel('gpt-3.5-turbo');
    setUseProxy(true);
    setStatus('saved');
    setMessage('Configuration reset');
    
    // Clear localStorage
    localStorage.removeItem('openai_api_key');
    localStorage.removeItem('llm_endpoint');
    localStorage.removeItem('llm_model');
    localStorage.setItem('llm_use_proxy', 'true');
    
    // Update service config
    languageService.configure('', 'https://api.openai.com/v1/chat/completions');
    languageService.setUseProxy(true);
  };
  
  const testLLM = async () => {
    if (!apiKey) {
      setStatus('error');
      setMessage('API Key is required');
      return;
    }

    // Validate API key format first
    if (!apiKey.startsWith('sk-') || apiKey.length < 35) {
      setStatus('error');
      setMessage('Invalid API key format. The key must start with "sk-" and be at least 35 characters long.');
      return;
    }
    
    // Check for common URL mistakes
    if (endpoint !== 'https://api.openai.com/v1/chat/completions' && 
        endpoint.includes('openai') && endpoint.includes('chat')) {
      setStatus('error');
      setMessage(`Warning: Your endpoint URL might be incorrect. For OpenAI, it should be exactly: https://api.openai.com/v1/chat/completions`);
      // Continue anyway, they might be using a custom endpoint
    }
    
    setIsTesting(true);
    setTestResponse('');
    
    try {
      console.log('Testing LLM connection...');
      // Configure the service with the current UI values (not just saved values)
      languageService.configure(apiKey, endpoint);
      languageService.setUseProxy(useProxy);
      
      // Use a simple test message
      const testPrompt = testMessage || 'Hello, can you analyze the emotional content of this message and respond with "text" and "emotionalAnalysis" fields?';
      console.log('Test prompt:', testPrompt);
      
      // Add error handling for CORS issues
      try {
        const response = await languageService.processInput(testPrompt);
        console.log('LLM test response:', response);
        
        setTestResponse(JSON.stringify(response, null, 2));
        setStatus('saved');
        setMessage('Test completed successfully');
      } catch (error: any) {
        console.error('Fetch error during test:', error);
        
        // Check if it's a CORS error
        if (error.message && typeof error.message === 'string' && error.message.includes('CORS')) {
          setStatus('error');
          setMessage(`CORS error: Please enable the "Use proxy" option below to avoid CORS restrictions.`);
        } else {
          throw error; // re-throw for the outer catch
        }
      }
    } catch (error) {
      console.error('Test error:', error);
      setStatus('error');
      setMessage(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Show the error in the response area too
      setTestResponse(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        tip: "Check browser console (F12) for more details. If you're seeing API errors, verify your API key and billing status."
      }, null, 2));
    } finally {
      setIsTesting(false);
    }
  };
  
  const validateApiKeyFormat = (key: string): { isValid: boolean; error?: string } => {
    if (!key || typeof key !== 'string' || !key.trim()) {
      return { isValid: false, error: 'API key is required' };
    }

    const trimmedKey = key.trim();
    if (!trimmedKey.startsWith('sk-')) {
      return { isValid: false, error: 'API key must start with "sk-"' };
    }

    if (trimmedKey.length < 51) {
      return { isValid: false, error: 'API key must be at least 51 characters long' };
    }

    if (!/^sk-[A-Za-z0-9_-]{48,}$/.test(trimmedKey)) {
      return { isValid: false, error: 'API key must contain only letters, numbers, hyphens, and underscores' };
    }

    return { isValid: true };
  };
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-blue-800">Settings</h2>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            OpenAI API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              className={`w-full p-2 pr-10 border rounded ${
                apiKey && !validateApiKeyFormat(apiKey).isValid
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
              value={apiKey}
              onChange={(e) => {
                const newKey = e.target.value;
                setApiKey(newKey);
                setStatus('idle');
                setMessage('');
                
                // Show immediate validation feedback
                if (newKey) {
                  const validation = validateApiKeyFormat(newKey);
                  if (!validation.isValid) {
                    setStatus('error');
                    setMessage(validation.error || 'Invalid API key format');
                  }
                }
              }}
              placeholder="sk-..."
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
            >
              {showApiKey ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Your API key is stored locally and never sent to our servers.
            {apiKey && !apiKey.startsWith('sk-') && (
              <span className="block text-red-500 mt-1">
                API key must start with "sk-"
              </span>
            )}
            {apiKey && apiKey.startsWith('sk-') && apiKey.length < 51 && (
              <span className="block text-red-500 mt-1">
                API key must be at least 51 characters long
              </span>
            )}
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Endpoint
          </label>
          <input
            type="text"
            className="w-full p-2 border border-gray-300 rounded"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="API endpoint URL"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Model
          </label>
          <select
            className="w-full p-2 border border-gray-300 rounded"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="claude-3-opus">Claude 3 Opus</option>
            <option value="claude-3-sonnet">Claude 3 Sonnet</option>
            <option value="gemini-pro">Gemini Pro</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="useProxy"
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            checked={useProxy}
            onChange={(e) => setUseProxy(e.target.checked)}
          />
          <label htmlFor="useProxy" className="ml-2 block text-sm text-gray-700">
            Use proxy (recommended to avoid CORS issues)
          </label>
        </div>
        
        <div className="bg-blue-50 p-3 rounded border border-blue-200 text-sm text-blue-700">
          <p><strong>About CORS:</strong> Browsers block direct API calls from websites to different domains for security reasons. 
          The proxy option routes requests through your own server to avoid these restrictions.</p>
        </div>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={saveConfig}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Save Settings
        </button>
        
        <button
          onClick={resetConfig}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          Clear Settings
        </button>
      </div>
      
      {status !== 'idle' && (
        <div className={`mt-4 p-2 rounded ${status === 'saved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}
      
      <div className="mt-8 border-t pt-6">
        <h3 className="text-lg font-semibold mb-3">Test Connection</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Test Message
          </label>
          <textarea
            className="w-full p-2 border border-gray-300 rounded"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Enter a test message to analyze"
            rows={3}
          />
        </div>
        
        <button
          onClick={testLLM}
          disabled={isTesting}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {isTesting ? 'Testing...' : 'Test LLM Connection'}
        </button>
        
        {testResponse && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-1">Response:</h4>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-60">
              {testResponse}
            </pre>
          </div>
        )}
        
        <div className="mt-6 bg-gray-50 p-4 rounded border border-gray-200">
          <h4 className="text-base font-medium mb-2">Troubleshooting</h4>
          <ul className="list-disc ml-5 text-sm text-gray-700 space-y-2">
            <li>
              <strong>Exact URL:</strong> For OpenAI, the endpoint must be exactly: 
              <code className="bg-gray-100 px-1 ml-1 text-xs">https://api.openai.com/v1/chat/completions</code>
            </li>
            <li>
              <strong>API Key:</strong> Verify your API key is valid and has sufficient quota
            </li>
            <li>
              <strong>CORS errors:</strong> Enable the "Use proxy" option above
            </li>
            <li>
              <strong>Rate limits:</strong> If you're getting rate limit errors, wait a minute and try again
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
} 