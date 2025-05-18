import { useState, useEffect } from 'react';
import { LanguageProcessingService } from '@/services/languageProcessingService';

const languageService = LanguageProcessingService.getInstance();

export default function LLMConfig() {
  const [apiKey, setApiKey] = useState<string>('');
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
    const savedApiKey = localStorage.getItem('llm-api-key') || '';
    const savedEndpoint = localStorage.getItem('llm-endpoint') || 'https://api.openai.com/v1/chat/completions';
    const savedModel = localStorage.getItem('llm-model') || 'gpt-3.5-turbo';
    const savedUseProxy = localStorage.getItem('llm-use-proxy') !== 'false'; // default to true if not set
    
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
  
  const saveConfig = () => {
    // Save to localStorage
    localStorage.setItem('llm-api-key', apiKey);
    localStorage.setItem('llm-endpoint', endpoint);
    localStorage.setItem('llm-model', model);
    localStorage.setItem('llm-use-proxy', useProxy.toString());
    
    // Configure the service
    languageService.configure(apiKey, endpoint);
    languageService.setUseProxy(useProxy);
    
    setStatus('saved');
    setMessage('Configuration saved');
  };
  
  const resetConfig = () => {
    setApiKey('');
    setEndpoint('https://api.openai.com/v1/chat/completions');
    setModel('gpt-3.5-turbo');
    setUseProxy(true);
    setStatus('saved');
    setMessage('Configuration reset');
    
    // Clear localStorage
    localStorage.removeItem('llm-api-key');
    localStorage.removeItem('llm-endpoint');
    localStorage.removeItem('llm-model');
    localStorage.setItem('llm-use-proxy', 'true');
    
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
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-blue-800">LLM Configuration</h2>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            type="password"
            className="w-full p-2 border border-gray-300 rounded"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
          />
          <p className="text-xs text-gray-500 mt-1">
            This will be stored in your browser's local storage.
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