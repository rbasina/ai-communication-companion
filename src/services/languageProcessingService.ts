import { EmotionalState } from '@/types/emotions';

// Define response type
interface LLMResponse {
  text: string;
  emotionalAnalysis?: EmotionalState;
}

export class LanguageProcessingService {
  private static instance: LanguageProcessingService;
  private apiKey: string = ''; // Store your API key securely in environment variables
  private apiEndpoint: string = 'https://api.openai.com/v1/chat/completions'; // Example for OpenAI
  private useProxy: boolean = true; // Use proxy by default to avoid CORS issues
  
  private constructor() {}
  
  public static getInstance(): LanguageProcessingService {
    if (!LanguageProcessingService.instance) {
      LanguageProcessingService.instance = new LanguageProcessingService();
    }
    return LanguageProcessingService.instance;
  }
  
  /**
   * Configure the service with API credentials
   */
  public configure(apiKey: string, endpoint?: string): void {
    this.apiKey = apiKey;
    if (endpoint) {
      this.apiEndpoint = endpoint;
    }
  }
  
  /**
   * Set whether to use proxy or direct API calls
   */
  public setUseProxy(useProxy: boolean): void {
    this.useProxy = useProxy;
  }
  
  /**
   * Get the actual endpoint to use (proxy or direct)
   */
  private getEndpoint(): string {
    if (this.useProxy) {
      // Use our server-side proxy to avoid CORS issues
      return `/api/openai-proxy?endpoint=${encodeURIComponent(this.apiEndpoint)}`;
    }
    return this.apiEndpoint;
  }
  
  /**
   * Process user input and get AI response with emotional analysis
   */
  public async processInput(
    userInput: string, 
    conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = []
  ): Promise<LLMResponse> {
    try {
      if (!this.apiKey) {
        throw new Error('API key not configured');
      }
      
      console.log('Making LLM API request with key:', this.apiKey.substring(0, 3) + '...' + this.apiKey.substring(this.apiKey.length - 3));
      console.log('Using endpoint:', this.getEndpoint());
      
      // Create messages array with conversation history and system prompt
      const messages = [
        {
          role: 'system',
          content: `You are an empathetic communication assistant. 
          Analyze the emotional content of the user's message and respond appropriately.
          Also provide an analysis of the user's emotional state with scores for:
          - stress (0-100)
          - clarity (0-100)
          - engagement (0-100)
          Format your response as JSON with "text" and "emotionalAnalysis" fields.`
        },
        ...conversationHistory,
        { role: 'user', content: userInput }
      ];
      
      const requestBody = {
        model: 'gpt-3.5-turbo', // Using 3.5 which is more widely available
        messages,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      };
      
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      
      // Make API request - with different headers depending on proxy usage
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // When using proxy, pass API key as a header
      if (this.useProxy) {
        headers['x-api-key'] = this.apiKey;
      } else {
        // Direct API call needs Authorization header
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      console.log('Sending request to:', this.getEndpoint());
      
      const response = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      
      console.log('API response status:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = `API error: ${response.statusText} (${response.status})`;
        try {
          const errorData = await response.json();
          console.error('API error details:', errorData);
          
          // Extract useful error information
          if (errorData.error) {
            errorMessage = `API error: ${errorData.error.message || errorData.error}`;
            
            // Special handling for common OpenAI errors
            if (errorData.error.code === 'insufficient_quota') {
              errorMessage = 'Your OpenAI API quota has been exceeded. Please check your billing information.';
            } else if (errorData.error.type === 'invalid_request_error') {
              errorMessage = `Invalid request: ${errorData.error.message}`;
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.hint) {
            // Our custom proxy error
            errorMessage = `${errorData.error}: ${errorData.hint}`;
          }
          
        } catch (parseError) {
          // If we can't parse the error response as JSON
          console.error('Could not parse error response:', parseError);
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('API response data:', data);
      
      const assistantResponse = data.choices?.[0]?.message?.content;
      
      if (!assistantResponse) {
        console.error('No response content in API response:', data);
        throw new Error('No response content received from API');
      }
      
      // Parse the JSON response
      try {
        console.log('Attempting to parse response:', assistantResponse);
        const parsedResponse = JSON.parse(assistantResponse);
        return {
          text: parsedResponse.text || 'Sorry, I couldn\'t generate a proper response.',
          emotionalAnalysis: parsedResponse.emotionalAnalysis || {
            stress: 50,
            clarity: 50,
            engagement: 50
          }
        };
      } catch (parseError) {
        // Fallback if the response isn't proper JSON
        console.error('JSON parse error:', parseError);
        return {
          text: assistantResponse || 'Sorry, I couldn\'t process that properly.',
          emotionalAnalysis: {
            stress: 50,
            clarity: 50,
            engagement: 50
          }
        };
      }
    } catch (error) {
      console.error('Error processing language:', error);
      return {
        text: error instanceof Error ? error.message : 'Sorry, there was an error processing your message.',
        emotionalAnalysis: {
          stress: 50,
          clarity: 50,
          engagement: 50
        }
      };
    }
  }
  
  /**
   * Analyze text for emotional content without generating a response
   */
  public async analyzeTextEmotion(text: string): Promise<EmotionalState> {
    try {
      if (!this.apiKey) {
        throw new Error('API key not configured');
      }
      
      const messages = [
        {
          role: 'system',
          content: `Analyze the emotional content of the following text and provide scores for:
          - stress (0-100): How tense or anxious the text appears
          - clarity (0-100): How clear and coherent the text is
          - engagement (0-100): How engaged and interested the writer seems
          Respond only with a JSON object containing these three scores.`
        },
        { role: 'user', content: text }
      ];
      
      // Create headers based on whether we're using the proxy
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.useProxy) {
        headers['x-api-key'] = this.apiKey;
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      const response = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-3.5-turbo', // Using a smaller model for efficiency
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const analysisText = data.choices[0]?.message?.content;
      
      try {
        const analysis = JSON.parse(analysisText);
        return {
          stress: analysis.stress || 50,
          clarity: analysis.clarity || 50,
          engagement: analysis.engagement || 50
        };
      } catch (parseError) {
        console.error('Error parsing emotion analysis:', parseError);
        return {
          stress: 50,
          clarity: 50,
          engagement: 50
        };
      }
    } catch (error) {
      console.error('Error analyzing text emotion:', error);
      return {
        stress: 50,
        clarity: 50,
        engagement: 50
      };
    }
  }
} 