import { EmotionalState } from '@/types/emotions';
import OpenAI from 'openai';

interface LLMAnalysisResult {
  emotionalState: EmotionalState;
  raw?: string;
  confidence?: number;
  suggestions?: string[];
}

interface AudioAnalysisResult {
  transcription: string;
  emotionalState: EmotionalState;
  analysis: string;
  suggestions: string[];
  confidence: number;
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export class LLMService {
  private static instance: LLMService;
  private apiKey: string = '';
  private openai: OpenAI | null = null;
  private model: string = 'gpt-3.5-turbo';
  private lastApiCall: number = 0;
  private minRequestInterval: number = 1000;
  private lastValidation: { key: string; timestamp: number; isValid: boolean } | null = null;
  private validationCache = new Map<string, { timestamp: number; isValid: boolean }>();
  private readonly VALIDATION_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly API_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{48,}$/;

  private constructor() {
    this.loadConfiguration();
  }

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  private loadConfiguration() {
    try {
      const savedApiKey = localStorage.getItem('openai_api_key');
      if (savedApiKey) {
        this.updateApiKey(savedApiKey);
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  }

  private validateJsonResponse(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      return typeof parsed === 'object' && parsed !== null;
    } catch (error) {
      return false;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - timeSinceLastCall);
    }
    this.lastApiCall = Date.now();
  }

  private async retryOperation<T>(operation: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.enforceRateLimit();
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Operation failed (attempt ${attempt}/${retries}):`, lastError.message);
        
        // Don't retry on certain errors
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (errorMessage.includes('invalid_api_key') || 
              errorMessage.includes('invalid api key') ||
              errorMessage.includes('401')) {
            throw error; // Don't retry on invalid API key
          }
        }
        
        if (attempt < retries) {
          const delay = RETRY_DELAY * attempt; // Exponential backoff
          console.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError || new Error('Operation failed after all retry attempts');
  }

  private validateApiKeyFormat(key: string): { isValid: boolean; error?: string } {
    if (!key || typeof key !== 'string') {
      return { isValid: false, error: 'API key is required' };
    }

    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return { isValid: false, error: 'API key cannot be empty' };
    }

    if (!trimmedKey.startsWith('sk-')) {
      return { isValid: false, error: 'API key must start with "sk-"' };
    }

    if (trimmedKey.length < 51) {
      return { 
        isValid: false, 
        error: `API key must be at least 51 characters long (current length: ${trimmedKey.length})`
      };
    }

    if (!this.API_KEY_PATTERN.test(trimmedKey)) {
      // Check for specific invalid characters
      const invalidChars = trimmedKey.replace(/[A-Za-z0-9_-]/g, '').replace('sk-', '');
      if (invalidChars.length > 0) {
        return { 
          isValid: false, 
          error: `API key contains invalid characters: "${invalidChars}". Only letters, numbers, hyphens, and underscores are allowed.`
        };
      }
      return { 
        isValid: false, 
        error: 'API key must contain only letters, numbers, hyphens, and underscores after "sk-"'
      };
    }

    return { isValid: true };
  }

  public updateApiKey(newApiKey: string): boolean {
    try {
      const validation = this.validateApiKeyFormat(newApiKey);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid API key format');
      }

      const key = newApiKey.trim();
      this.apiKey = key;
      
      // Initialize OpenAI client
      this.openai = new OpenAI({
        apiKey: this.apiKey,
        dangerouslyAllowBrowser: true
      });

      // Store the key
      localStorage.setItem('openai_api_key', this.apiKey);

      return true;
    } catch (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  }

  public updateModel(newModel: string) {
    this.model = newModel;
  }

  public async validateApiKey(key: string = this.apiKey): Promise<boolean> {
    if (!key) {
      throw new Error('API key is required');
    }

    // Allow test keys for UI/demo purposes (bypass real API call)
    if (key.startsWith('sk-test-')) {
      console.warn('Test API key detected: skipping real API validation. Analysis will not work with test keys.');
      return true;
    }

    // Clear any existing cache for this key to ensure fresh validation
    this.validationCache.delete(key);

    try {
      // Validate format first
      const validation = this.validateApiKeyFormat(key);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const tempClient = new OpenAI({
        apiKey: key,
        dangerouslyAllowBrowser: true
      });

      // Make a minimal API call to validate the key
      await this.retryOperation(async () => {
        const response = await tempClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        });
        return response;
      });

      // Cache successful validation
      this.validationCache.set(key, {
        timestamp: Date.now(),
        isValid: true
      });

      return true;
    } catch (error) {
      // Handle specific API errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('401') || errorMessage.includes('invalid_api_key') || errorMessage.includes('invalid api key')) {
          console.error('API key validation failed:', error);
          this.validationCache.set(key, {
            timestamp: Date.now(),
            isValid: false
          });
          throw new Error('Invalid API key. Please check your key and try again.');
        } else if (errorMessage.includes('429') || errorMessage.includes('rate_limit_exceeded')) {
          // Don't cache rate limit errors
          console.warn('Rate limit hit during validation:', error);
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        } else if (errorMessage.includes('insufficient_quota')) {
          console.warn('Quota exceeded during validation:', error);
          throw new Error('API quota exceeded. Please check your billing status.');
        } else {
          // For unknown errors, log them but don't cache
          console.error('Unknown error during API key validation:', error);
        }
      }
      
      throw new Error('Failed to validate API key. Please check your internet connection and try again.');
    }
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public hasValidConfiguration(): boolean {
    return Boolean(this.apiKey && this.openai);
  }

  public async chat(messages: ChatMessage[]) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Please set API key first.');
    }

    return this.retryOperation(async () => {
      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const message = response.choices[0].message;
      if (!message.content) {
        throw new Error('No content in response');
      }
      return message;
    });
  }

  public getModel(): string {
    return this.model;
  }

  private async ensureValidJsonResponse(result: Awaited<ReturnType<typeof this.chat>>): Promise<any> {
    if (!result.content) {
      throw new Error('No content in response');
    }

    if (!this.validateJsonResponse(result.content)) {
      // If JSON is invalid, retry with a more explicit instruction
      const retryMessages: ChatMessage[] = [
        {
          role: 'system',
          content: 'You MUST respond with valid JSON only. No other text or explanation is allowed.'
        },
        {
          role: 'user',
          content: 'Please reformat your previous response as valid JSON.'
        }
      ];

      const retryResult = await this.chat(retryMessages);
      if (!retryResult.content || !this.validateJsonResponse(retryResult.content)) {
        throw new Error('Failed to get valid JSON response after retry');
      }
      return JSON.parse(retryResult.content);
    }

    return JSON.parse(result.content);
  }

  public async analyzeText(text: string): Promise<LLMAnalysisResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Please set API key first.');
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an emotional analysis assistant. Analyze the emotional content of the text and provide scores for stress (0-100), clarity (0-100), and engagement (0-100)."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No analysis result received');
      }

      // Parse the result and extract scores
      const scores = this.parseAnalysisResult(result);
      
      // Calculate confidence based on response quality
      const confidence = this.calculateConfidence(result, scores);
      
      return {
        emotionalState: scores,
        raw: result,
        confidence
      };
    } catch (error) {
      console.error('Error analyzing text:', error);
      throw error;
    }
  }

  private calculateConfidence(result: string, scores: EmotionalState): number {
    let confidence = 0.7; // Base confidence

    // Increase confidence if response contains detailed analysis
    if (result.length > 100) confidence += 0.1;
    if (result.includes('because') || result.includes('indicates')) confidence += 0.1;

    // Check if scores are reasonable (not all default values)
    const hasNonDefaultScores = 
      scores.stress !== 50 ||
      scores.clarity !== 50 ||
      scores.engagement !== 50;
    if (hasNonDefaultScores) confidence += 0.1;

    // Cap confidence at 0.95
    return Math.min(0.95, confidence);
  }

  private parseAnalysisResult(result: string) {
    // Default scores
    const defaultScores = {
      stress: 50,
      clarity: 50,
      engagement: 50
    };

    try {
      // Extract numbers from the result
      const numbers = result.match(/\d+/g)?.map(Number) || [];
      
      if (numbers.length >= 3) {
        return {
          stress: Math.min(100, Math.max(0, numbers[0])),
          clarity: Math.min(100, Math.max(0, numbers[1])),
          engagement: Math.min(100, Math.max(0, numbers[2]))
        };
      }

      return defaultScores;
    } catch (error) {
      console.error('Error parsing analysis result:', error);
      return defaultScores;
    }
  }

  public async analyzeAudio(transcription: string): Promise<AudioAnalysisResult> {
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an AI speech analyst. Analyze the following transcription for emotional content and communication effectiveness.
          Consider speech patterns, word choice, and context. Provide analysis in JSON format with the following structure:
          {
            "transcription": "original transcription",
            "emotionalState": {
              "stress": 0-100 score,
              "clarity": 0-100 score,
              "engagement": 0-100 score
            },
            "analysis": "detailed analysis of speech patterns and emotional content",
            "suggestions": ["suggestion1", "suggestion2"],
            "confidence": 0-100 score
          }`
        },
        {
          role: 'user',
          content: transcription
        }
      ];

      const result = await this.chat(messages);
      return await this.ensureValidJsonResponse(result);
    } catch (error) {
      console.error('Error analyzing audio:', error);
      throw error;
    }
  }

  public async enhanceAnalysis(
    baseAnalysis: EmotionalState,
    content: string,
    mode: 'text' | 'audio'
  ): Promise<{
    analysis: string;
    suggestions: string[];
    confidence: number;
  }> {
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an AI communication enhancement specialist. Given the following ${mode} analysis results and content,
          provide detailed insights and suggestions. Return in JSON format:
          {
            "analysis": "detailed analysis combining technical and contextual factors",
            "suggestions": ["specific, actionable suggestions"],
            "confidence": 0-100 score based on analysis quality
          }`
        },
        {
          role: 'user',
          content: JSON.stringify({
            emotionalState: baseAnalysis,
            content,
            mode
          })
        }
      ];

      const result = await this.chat(messages);
      return await this.ensureValidJsonResponse(result);
    } catch (error) {
      console.error('Error enhancing analysis:', error);
      throw error;
    }
  }
}

export default LLMService; 