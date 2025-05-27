import { EmotionalState } from '@/types/emotions';
import { TensorflowService } from './tensorflowService';
import { AudioAnalysisService } from './audioAnalysisService';
import { VideoAnalysisService } from './videoAnalysisService';
import { IntegratedEmotionAnalysis } from './integratedEmotionAnalysis';
import LLMService from './llmService';
import OpenAI from 'openai';
import { debugLog, measurePerformance, DEBUG } from '@/utils/debugUtils';

export interface IEmotionAnalysisService {
  analyzeText(text: string): Promise<{
    emotionalState: EmotionalState;
    analysis: string;
    suggestions: string[];
    confidence: number;
  }>;
  analyzeAudio(audioData: ArrayBuffer): Promise<{
    emotionalState: EmotionalState;
    analysis: string;
    suggestions: string[];
    confidence: number;
  }>;
  analyzeSpeechContext(prompt: string): Promise<EmotionalFeedback>;
  reset(): Promise<void>;
  updateApiKey(apiKey: string): void;
}

export interface EmotionalFeedback {
  emotionalState: EmotionalState;
  analysis: string;
  suggestions: string[];
  confidence: number;
  conversationInsights?: ConversationInsights;
}

export interface ConversationInsights {
  turnTaking: {
    balance: number; // 0-100, how balanced the conversation is
    dominance: number; // 0-100, how dominant the user is
    interruptions: number;
  };
  interaction: {
    responsiveness: number; // 0-100, how well user responds to others
    engagement: number; // 0-100, how engaged user is with others
    empathy: number; // 0-100, how empathetic user's responses are
  };
  dynamics: {
    flow: string; // 'smooth', 'interrupted', 'one-sided'
    pattern: string; // 'balanced', 'dominant', 'passive'
    quality: string; // 'high', 'medium', 'low'
  };
}

interface QuickAnalysisResult {
  emotionalState: EmotionalState;
  analysis: string;
  suggestions: string[];
  confidence: number;
}

export class EmotionAnalysisService implements IEmotionAnalysisService {
  private static instance: EmotionAnalysisService | null = null;
  private static initializationPromise: Promise<void> | null = null;
  private tensorflowService: TensorflowService | null = null;
  private audioService: AudioAnalysisService | null = null;
  private videoService: VideoAnalysisService | null = null;
  private integratedAnalysis: IntegratedEmotionAnalysis | null = null;
  private currentEmotionalStates: {
    text?: EmotionalState;
    audio?: EmotionalState;
    video?: EmotionalState;
  } = {};

  // Add state tracking for analysis
  private analysisHistory: {
    timestamp: number;
    speech: string;
    metrics: {
      stress: number;
      clarity: number;
      engagement: number;
    };
    style: {
      pace: string;
      structure: string;
      tone: string;
      engagement: string;
    };
  }[] = [];

  // Add constants for engagement calculation
  private readonly ENGAGEMENT_FACTORS = {
    PERSONAL_PRONOUNS: 0.3,
    EMOTIONAL_WORDS: 0.2,
    VARIED_PUNCTUATION: 0.15,
    COMPLEX_SENTENCES: 0.15,
    TECHNICAL_TERMS: 0.1,
    TRANSITIONS: 0.1
  };

  private conversationHistory: {
    timestamp: number;
    speaker: 'user' | 'other';
    speech: string;
    metrics: {
      stress: number;
      clarity: number;
      engagement: number;
    };
  }[] = [];

  private model: any; // Replace with actual model type

  private isInitialized: boolean = false;
  private analysisQueue: Array<() => Promise<void>> = [];
  private processingLock: boolean = false;
  private apiKey: string;

  private llmService: LLMService | null = null;
  private currentState: {
    text: EmotionalState;
    audio: EmotionalState;
    video: EmotionalState;
  };

  private openai: OpenAI | null = null;
  private lastAnalysis: number = 0;
  private MIN_ANALYSIS_INTERVAL = 50; // Reduced from 100ms to 50ms for faster updates
  private QUICK_ANALYSIS_THRESHOLD = 150; // Reduced from 300ms to 150ms for faster response
  private isProcessing = false;
  private lastAnalysisTime = 0;
  private lastEmotionalState: EmotionalState = {
    stress: 50,
    clarity: 50,
    engagement: 50
  };

  private analysisCount: number = 0;
  private readonly smoothingFactor: number = 0.3;

  private constructor() {
    this.apiKey = localStorage.getItem('emotion_api_key') || '';
    // Initialize model
    this.integratedAnalysis = IntegratedEmotionAnalysis.getInstance();
    this.currentState = {
      text: { stress: 50, clarity: 50, engagement: 50 },
      audio: { stress: 50, clarity: 50, engagement: 50 },
      video: { stress: 50, clarity: 50, engagement: 50 }
    };
    this.initializeOpenAI();
  }

  public static async getInstance(): Promise<EmotionAnalysisService> {
    if (!EmotionAnalysisService.instance) {
      const instance = new EmotionAnalysisService();
      EmotionAnalysisService.instance = instance;
      
      if (!EmotionAnalysisService.initializationPromise) {
        EmotionAnalysisService.initializationPromise = (async () => {
          await instance.initialize();
          if (DEBUG) {
            await instance.runTests();
          }
        })();
      }
      await EmotionAnalysisService.initializationPromise;
    }
    return EmotionAnalysisService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      debugLog.emotion('Initializing EmotionAnalysisService...');
      
      // Initialize LLM service first
      this.llmService = LLMService.getInstance();
      
      // Initialize other services in parallel
      const [tensorflowService, audioService, videoService] = await Promise.all([
        TensorflowService.getInstance(),
        AudioAnalysisService.getInstance(),
        VideoAnalysisService.getInstance()
      ]);

      this.tensorflowService = tensorflowService;
      this.audioService = audioService;
      this.videoService = videoService;

      // Verify LLM service configuration
      if (!this.llmService.hasValidConfiguration()) {
        throw new Error('LLM service not properly configured. Please check your API key.');
      }

      debugLog.emotion('All services initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      debugLog.emotion('Error initializing services:', error);
      throw error;
    }
  }

  private updateCurrentState(mode: 'text' | 'audio' | 'video', state: EmotionalState) {
    if (!this.integratedAnalysis) {
      throw new Error('Integrated analysis service not initialized');
    }
    this.currentEmotionalStates[mode] = state;
    return this.integratedAnalysis.analyzeIntegratedEmotions(this.currentEmotionalStates);
  }

  public async analyzeText(text: string): Promise<{
    emotionalState: EmotionalState;
    analysis: string;
    suggestions: string[];
    confidence: number;
  }> {
    if (!this.llmService) {
      throw new Error('LLM service not initialized. Please set API key first.');
    }

    try {
      const result = await this.llmService.analyzeText(text);
      
      return {
        emotionalState: result.emotionalState,
        analysis: result.raw || '',
        suggestions: result.suggestions || this.generateSuggestions(result.emotionalState),
        confidence: result.confidence || 0.95
      };
    } catch (error) {
      console.error('Error analyzing text:', error);
      throw error;
    }
  }

  public async analyzeAudio(audioData: ArrayBuffer): Promise<{
    emotionalState: EmotionalState;
    analysis: string;
    suggestions: string[];
    confidence: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      debugLog.audio('Analyzing audio data', { size: audioData.byteLength });
      this.analysisCount++;

      // Simulate audio analysis with more realistic values
      const audioFeatures = this.extractAudioFeatures(audioData);
      const emotionalState = this.calculateEmotionalState(audioFeatures);
      
      // Apply smoothing to avoid jarring changes
      const smoothedState = this.smoothEmotionalState(emotionalState);
      
      // Generate contextual analysis and suggestions
      const { analysis, suggestions } = this.generateFeedback(smoothedState);

      debugLog.audio('Analysis complete', { emotionalState: smoothedState });
      return {
        emotionalState: smoothedState,
        analysis,
        suggestions,
        confidence: 0.6
      };
    } catch (error) {
      debugLog.audio('Error analyzing audio', error);
      return {
        emotionalState: this.lastEmotionalState,
        analysis: "Unable to analyze audio at this moment",
        suggestions: ["Please continue speaking naturally"],
        confidence: 0.3
      };
    }
  }

  private extractAudioFeatures(audioData: ArrayBuffer): any {
    // Simulate feature extraction from audio
    const dataView = new DataView(audioData);
    const sampleCount = Math.min(1000, audioData.byteLength / 2);
    let energy = 0;
    let zeroCrossings = 0;
    
    for (let i = 0; i < sampleCount; i++) {
      const sample = dataView.getInt16(i * 2, true) / 32768.0;
      energy += sample * sample;
      if (i > 0 && Math.sign(sample) !== Math.sign(dataView.getInt16((i - 1) * 2, true))) {
        zeroCrossings++;
      }
    }
    
    return {
      energy: energy / sampleCount,
      zeroCrossings: (zeroCrossings * 1000) / sampleCount,
      duration: audioData.byteLength / 44100 // Assuming 44.1kHz sample rate
    };
  }

  private calculateEmotionalState(features: any): EmotionalState {
    // More sophisticated emotional state calculation
    let stress = 50;
    let clarity = 50;
    let engagement = 50;

    if ('energy' in features) {
      // Audio features - Increased multipliers for more noticeable changes
      stress += features.energy * 50; // Increased from 30
      clarity += (features.zeroCrossings - 50) * 0.8; // Increased from 0.5
      engagement += features.energy * 40; // Increased from 20
    } else {
      // Text features - Increased multipliers
      clarity += Math.min(30, features.wordCount); // Increased from 20
      engagement += features.punctuationCount * 8; // Increased from 5
    }

    // Normalize values
    return {
      stress: Math.min(100, Math.max(0, Math.round(stress))),
      clarity: Math.min(100, Math.max(0, Math.round(clarity))),
      engagement: Math.min(100, Math.max(0, Math.round(engagement)))
    };
  }

  private smoothEmotionalState(newState: EmotionalState): EmotionalState {
    // Increased smoothing factor for more noticeable changes
    const smoothingFactor = 0.6; // Increased from 0.3
    
    const smoothed = {
      stress: this.smoothValue(newState.stress, this.lastEmotionalState.stress),
      clarity: this.smoothValue(newState.clarity, this.lastEmotionalState.clarity),
      engagement: this.smoothValue(newState.engagement, this.lastEmotionalState.engagement)
    };
    
    this.lastEmotionalState = smoothed;
    return smoothed;
  }

  private smoothValue(newValue: number, oldValue: number): number {
    // Increased smoothing factor for more noticeable changes
    const factor = 0.6; // Increased from default
    return Math.round(oldValue + (newValue - oldValue) * factor);
  }

  private generateFeedback(state: EmotionalState): { analysis: string; suggestions: string[] } {
    const analysis = this.generateAnalysis(state);
    const suggestions = this.generateSuggestions(state);
    
    return { analysis, suggestions };
  }

  private generateAnalysis(state: EmotionalState): string {
    const stressLevel = this.getStressLevel(state.stress);
    const clarityLevel = this.getClarityLevel(state.clarity);
    const engagementLevel = this.getEngagementLevel(state.engagement);

    return `Your communication shows ${stressLevel} stress levels, ${clarityLevel} clarity, and ${engagementLevel} engagement.`;
  }

  private generateSuggestions(state: EmotionalState): string[] {
    const suggestions: string[] = [];

    if (state.stress > 70) {
      suggestions.push("Try taking a deep breath to reduce stress");
    } else if (state.stress < 30) {
      suggestions.push("Consider adding more emphasis to convey importance");
    }

    if (state.clarity < 50) {
      suggestions.push("Speak more slowly and articulate clearly");
    }

    if (state.engagement < 50) {
      suggestions.push("Try varying your tone to increase engagement");
    }

    if (suggestions.length === 0) {
      suggestions.push("Continue your current communication style");
    }

    return suggestions;
  }

  private getStressLevel(stress: number): string {
    if (stress < 30) return "very low";
    if (stress < 45) return "low";
    if (stress < 55) return "moderate";
    if (stress < 70) return "elevated";
    return "high";
  }

  private getClarityLevel(clarity: number): string {
    if (clarity < 30) return "low";
    if (clarity < 50) return "moderate";
    if (clarity < 70) return "good";
    return "excellent";
  }

  private getEngagementLevel(engagement: number): string {
    if (engagement < 30) return "low";
    if (engagement < 50) return "moderate";
    if (engagement < 70) return "good";
    return "high";
  }

  private parseAnalysisResult(result: string): EmotionalState {
    const defaultScores = {
      stress: 50,
      clarity: 50,
      engagement: 50
    };

    try {
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

  private initializeOpenAI() {
    const apiKey = localStorage.getItem('openai_api_key');
    if (apiKey) {
      this.updateApiKey(apiKey);
    }
  }

  public updateApiKey(apiKey: string) {
    try {
      this.openai = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
    } catch (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  }

  private async processAnalysisQueue() {
    if (this.isProcessing || this.analysisQueue.length === 0) return;

    this.isProcessing = true;
    try {
      const analysis = this.analysisQueue.shift();
      if (analysis) {
        await analysis();
      }
    } finally {
      this.isProcessing = false;
      if (this.analysisQueue.length > 0) {
        await this.processAnalysisQueue();
      }
    }
  }

  private shouldSkipAnalysis(): boolean {
    const now = Date.now();
    if (now - this.lastAnalysis < this.MIN_ANALYSIS_INTERVAL) {
      return true;
    }
    this.lastAnalysis = now;
    return false;
  }

  public async analyzeVideo(videoElement: HTMLVideoElement): Promise<EmotionalState> {
    try {
      if (!this.videoService) {
        throw new Error('Video analysis service not initialized');
      }
      const analysis = await this.videoService.analyzeVideoFrame(videoElement);
      const integrated = this.updateCurrentState('video', analysis);
      return integrated.emotionalState;
    } catch (error) {
      console.error('Error in video analysis:', error);
      throw error;
    }
  }

  public clearModalityState(mode: 'text' | 'audio' | 'video'): void {
    delete this.currentEmotionalStates[mode];
  }

  // Add direct method to update from Redux
  public updateFromRedux(mode: 'text' | 'audio' | 'video', state: EmotionalState): void {
    console.log(`🔄 Directly updating ${mode} state from Redux:`, state);
    
    // Validate the state
    const validState = {
      stress: !isNaN(state.stress) ? Math.min(100, Math.max(0, state.stress)) : 50,
      clarity: !isNaN(state.clarity) ? Math.min(100, Math.max(0, state.clarity)) : 50,
      engagement: !isNaN(state.engagement) ? Math.min(100, Math.max(0, state.engagement)) : 50
    };
    
    // Update internal state directly
    this.currentEmotionalStates[mode] = validState;
    console.log(`✅ Updated internal emotional state for ${mode}:`, this.currentEmotionalStates);
  }

  public getCurrentAnalysis(): {
    emotionalState: EmotionalState;
    confidence: number;
    activeModalities: ('text' | 'audio' | 'video')[];
  } {
    if (!this.integratedAnalysis) {
      throw new Error('Integrated analysis service not initialized');
    }
    
    try {
      // Make sure we have at least one valid modality
      const hasAnyModality = Object.values(this.currentEmotionalStates).length > 0;
      
      if (!hasAnyModality) {
        console.warn('No emotional states available for analysis, using defaults');
        return {
          emotionalState: {
            stress: 50,
            clarity: 50,
            engagement: 50
          },
          confidence: 0,
          activeModalities: []
        };
      }
      
      // Log current state before analysis
      console.log('Current emotional states before analysis:', this.currentEmotionalStates);
      
      const analysis = this.integratedAnalysis.analyzeIntegratedEmotions(this.currentEmotionalStates);
      
      // Validate the emotional state to prevent NaN values
      const validatedState = {
        emotionalState: {
          stress: !isNaN(analysis.emotionalState.stress) ? analysis.emotionalState.stress : 50,
          clarity: !isNaN(analysis.emotionalState.clarity) ? analysis.emotionalState.clarity : 50,
          engagement: !isNaN(analysis.emotionalState.engagement) ? analysis.emotionalState.engagement : 50
        },
        confidence: !isNaN(analysis.confidence) ? analysis.confidence : 0,
        activeModalities: analysis.activeModalities || []
      };
      
      console.log('Validated analysis result:', validatedState);
      return validatedState;
    } catch (error) {
      console.error('Error in getCurrentAnalysis:', error);
      // Return safe default values
      return {
        emotionalState: {
          stress: 50,
          clarity: 50,
          engagement: 50
        },
        confidence: 0,
        activeModalities: []
      };
    }
  }

  public async analyzeSpeechContext(prompt: string): Promise<EmotionalFeedback> {
    try {
      if (!this.audioService || !this.tensorflowService) {
        console.warn('Services not initialized');
        return {
          emotionalState: {
            stress: 0,
            clarity: 0,
            engagement: 0
          },
          analysis: "Unable to analyze speech - service not initialized",
          suggestions: [],
          confidence: 0
        };
      }

      // Extract emotional metrics from the prompt
      const stressMatch = prompt.match(/Stress Level: (\d+)%/);
      const clarityMatch = prompt.match(/Clarity: (\d+)%/);
      const engagementMatch = prompt.match(/Engagement: (\d+)%/);
      
      const stress = stressMatch ? parseInt(stressMatch[1]) : 0;
      const clarity = clarityMatch ? parseInt(clarityMatch[1]) : 0;
      const engagement = engagementMatch ? parseInt(engagementMatch[1]) : 0;

      // Extract speech content
      const speechMatch = prompt.match(/Speech: "([^"]+)"/);
      const speech = speechMatch ? speechMatch[1].trim() : '';

      if (!speech) {
        return {
          emotionalState: {
            stress: 0,
            clarity: 0,
            engagement: 0
          },
          analysis: "Waiting for speech input...",
          suggestions: [],
          confidence: 0
        };
      }

      // Get personalized baselines
      const personalizedBaselines = this.audioService.getPersonalizedBaselines();

      // Initialize analysis components
      let suggestions: string[] = [];
      let confidence = 75;

      // Calculate differences from baselines
      const stressDiff = stress - personalizedBaselines.stress;
      const clarityDiff = clarity - personalizedBaselines.clarity;
      const engagementDiff = engagement - personalizedBaselines.engagement;

      // Enhanced speech pattern analysis
      const words = speech.split(/\s+/);
      const wordCount = words.length;
      const sentenceCount = (speech.match(/[.!?]+/g) || []).length;
      const wordsPerSentence = wordCount / Math.max(1, sentenceCount);
      const wordsPerSecond = wordCount / 5; // Approximate speaking duration

      // Analyze speech characteristics
      const hasEmphasis = /[!?]|[A-Z]{2,}/.test(speech);
      const hasVariedPunctuation = /[,;:]/.test(speech);
      const hasComplexSentences = speech.includes(' because ') || speech.includes(' however ') || speech.includes(' although ');
      const hasPersonalPronouns = /\b(I|we|you|they)\b/i.test(speech);
      const hasEmotionalWords = /(feel|think|believe|hope|wish|want|need|must|should)\b/i.test(speech);
      
      // Enhanced pattern analysis
      const speakingStyle = {
        isDescriptive: /(beautiful|wonderful|amazing|great|interesting|fascinating)\b/i.test(speech),
        isAnalytical: /(analyze|consider|compare|evaluate|examine)\b/i.test(speech),
        isPersuasive: /(should|must|need|important|crucial|essential)\b/i.test(speech),
        isNarrative: /(then|after|before|when|while|during)\b/i.test(speech),
        hasMetaphors: /(like|as if|seems|appears|resembles)\b/i.test(speech),
        isInquisitive: (speech.match(/\?/g) || []).length > 0,
        hasTechnicalTerms: /\b(process|system|method|technique|approach)\b/i.test(speech),
        hasTransitions: /\b(however|therefore|furthermore|moreover|additionally)\b/i.test(speech)
      };

      // Calculate engagement score based on content factors
      const engagementScore = Math.min(100, Math.round(
        (hasPersonalPronouns ? this.ENGAGEMENT_FACTORS.PERSONAL_PRONOUNS : 0) * 100 +
        (hasEmotionalWords ? this.ENGAGEMENT_FACTORS.EMOTIONAL_WORDS : 0) * 100 +
        (hasVariedPunctuation ? this.ENGAGEMENT_FACTORS.VARIED_PUNCTUATION : 0) * 100 +
        (hasComplexSentences ? this.ENGAGEMENT_FACTORS.COMPLEX_SENTENCES : 0) * 100 +
        (speakingStyle.hasTechnicalTerms ? this.ENGAGEMENT_FACTORS.TECHNICAL_TERMS : 0) * 100 +
        (speakingStyle.hasTransitions ? this.ENGAGEMENT_FACTORS.TRANSITIONS : 0) * 100
      ));

      // Overall communication style analysis
      const communicationStyle = {
        pace: wordsPerSecond > 3 ? "rapid" : wordsPerSecond < 2 ? "deliberate" : "moderate",
        structure: hasComplexSentences ? "detailed" : "direct",
        tone: hasEmotionalWords ? "emotive" : "factual",
        engagement: engagementScore > 70 ? "interactive" : engagementScore > 40 ? "balanced" : "informative"
      };

      // Store current analysis in history
      this.analysisHistory.push({
        timestamp: Date.now(),
        speech,
        metrics: { stress, clarity, engagement: engagementScore },
        style: communicationStyle
      });

      // Keep only last 5 analyses
      if (this.analysisHistory.length > 5) {
        this.analysisHistory.shift();
      }

      // Analyze recent patterns
      const recentPatterns = this.analyzeRecentPatterns();

      // Generate dynamic analysis
      const { analysis: dynamicAnalysis, suggestions: dynamicSuggestions } = this.generateDynamicAnalysis(
        communicationStyle,
        recentPatterns,
        { stress, clarity, engagement: engagementScore },
        speakingStyle
      );

      // Generate overall summary
      const overallSummary = dynamicAnalysis.join(". ");
      
      // Ensure we have at least two suggestions
      if (dynamicSuggestions.length < 2) {
        dynamicSuggestions.push(
          "Maintain your natural communication style while being mindful of pace and structure",
          "Consider the balance between detail and conciseness in your delivery"
        );
      }

      // Add conversation analysis
      const conversationInsights = this.analyzeConversationDynamics();
      
      // Add conversation-specific suggestions
      if (conversationInsights.turnTaking.interruptions > 0) {
        dynamicSuggestions.push("Try to avoid interrupting others and wait for natural pauses");
      }
      
      if (conversationInsights.turnTaking.dominance > 70) {
        dynamicSuggestions.push("Consider giving others more opportunities to speak");
      }
      
      if (conversationInsights.interaction.empathy < 40) {
        dynamicSuggestions.push("Try to acknowledge others' perspectives more explicitly");
      }

      if (conversationInsights.interaction.responsiveness < 40) {
        dynamicSuggestions.push("Make sure to address the points raised by others in your responses");
      }

      // Trigger automatic model training after analysis
      this.triggerModelTraining();

      return {
        emotionalState: {
          stress: Math.min(100, Math.max(0, stress)),
          clarity: Math.min(100, Math.max(0, clarity)),
          engagement: Math.min(100, Math.max(0, engagement))
        },
        analysis: overallSummary,
        suggestions: dynamicSuggestions.slice(0, 3),
        confidence,
        conversationInsights
      };

    } catch (error) {
      console.error('Error in speech context analysis:', error);
      return {
        emotionalState: {
          stress: 0,
          clarity: 0,
          engagement: 0
        },
        analysis: "Unable to analyze speech context",
        suggestions: [],
        confidence: 0
      };
    }
  }

  private analyzeRecentPatterns() {
    if (this.analysisHistory.length < 2) {
      return {
        consistentPace: false,
        consistentStructure: false,
        consistentTone: false,
        consistentEngagement: false,
        patternChanges: []
      };
    }

    const recentAnalyses = this.analysisHistory.slice(-3);
    const patternChanges = [];
    
    // Analyze changes in speech patterns
    for (let i = 1; i < recentAnalyses.length; i++) {
      const prev = recentAnalyses[i - 1];
      const curr = recentAnalyses[i];
      
      // Check for significant changes in metrics
      const stressChange = Math.abs(curr.metrics.stress - prev.metrics.stress);
      const clarityChange = Math.abs(curr.metrics.clarity - prev.metrics.clarity);
      const engagementChange = Math.abs(curr.metrics.engagement - prev.metrics.engagement);
      
      if (stressChange > 15) {
        patternChanges.push(`Stress level ${curr.metrics.stress > prev.metrics.stress ? 'increased' : 'decreased'} significantly`);
      }
      if (clarityChange > 10) {
        patternChanges.push(`Clarity ${curr.metrics.clarity > prev.metrics.clarity ? 'improved' : 'decreased'}`);
      }
      if (engagementChange > 15) {
        patternChanges.push(`Engagement level ${curr.metrics.engagement > prev.metrics.engagement ? 'increased' : 'decreased'}`);
      }
      
      // Check for style changes
      if (curr.style.pace !== prev.style.pace) {
        patternChanges.push(`Speaking pace changed from ${prev.style.pace} to ${curr.style.pace}`);
      }
      if (curr.style.structure !== prev.style.structure) {
        patternChanges.push(`Communication structure changed from ${prev.style.structure} to ${curr.style.structure}`);
      }
      if (curr.style.tone !== prev.style.tone) {
        patternChanges.push(`Communication tone changed from ${prev.style.tone} to ${curr.style.tone}`);
      }
    }
    
    return {
      consistentPace: this.isConsistent(recentAnalyses, 'style.pace'),
      consistentStructure: this.isConsistent(recentAnalyses, 'style.structure'),
      consistentTone: this.isConsistent(recentAnalyses, 'style.tone'),
      consistentEngagement: this.isConsistent(recentAnalyses, 'style.engagement'),
      patternChanges
    };
  }

  private generateDynamicAnalysis(
    communicationStyle: any,
    recentPatterns: any,
    metrics: { stress: number; clarity: number; engagement: number },
    speakingStyle: any
  ): { analysis: string[]; suggestions: string[] } {
    const analysis: string[] = [];
    const suggestions: string[] = [];

    // Generate unique analysis based on current metrics and patterns
    const metricAnalysis = this.analyzeMetrics(metrics);
    analysis.push(...metricAnalysis.insights);
    suggestions.push(...metricAnalysis.suggestions);

    // Add pattern-based analysis
    if (recentPatterns.patternChanges.length > 0) {
      analysis.push(`Recent changes in your communication: ${recentPatterns.patternChanges.join(', ')}`);
    }

    // Add style-specific analysis
    const styleAnalysis = this.analyzeStyle(communicationStyle, speakingStyle);
    analysis.push(...styleAnalysis.insights);
    suggestions.push(...styleAnalysis.suggestions);

    return { analysis, suggestions };
  }

  private analyzeMetrics(metrics: { stress: number; clarity: number; engagement: number }) {
    const insights: string[] = [];
    const suggestions: string[] = [];

    // Stress analysis
    if (metrics.stress > 75) {
      insights.push("Your current stress level is elevated");
      suggestions.push("Consider taking brief pauses to manage stress while maintaining your message");
    } else if (metrics.stress < 40) {
      insights.push("Your stress level is quite low");
      suggestions.push("You might want to add more energy to your delivery");
    }

    // Clarity analysis
    if (metrics.clarity > 80) {
      insights.push("Your message is very clear and well-structured");
      suggestions.push("Maintain this level of clarity while adding more engagement elements");
    } else if (metrics.clarity < 60) {
      insights.push("Your message could be clearer");
      suggestions.push("Try simplifying complex points and using more concrete examples");
    }

    // Engagement analysis
    if (metrics.engagement > 75) {
      insights.push("Your communication is highly engaging");
      suggestions.push("Build on this engagement by varying your pace and tone");
    } else if (metrics.engagement < 50) {
      insights.push("Your communication could be more engaging");
      suggestions.push("Try incorporating more personal elements and emotional content");
    }

    return { insights, suggestions };
  }

  private analyzeStyle(communicationStyle: any, speakingStyle: any) {
    const insights: string[] = [];
    const suggestions: string[] = [];

    // Pace analysis
    if (communicationStyle.pace === "rapid") {
      insights.push("Your rapid pace shows enthusiasm and energy");
      suggestions.push("Consider strategic pauses to emphasize key points");
    } else if (communicationStyle.pace === "deliberate") {
      insights.push("Your deliberate pace allows for clear articulation");
      suggestions.push("Try varying your pace to maintain listener interest");
    }

    // Structure analysis
    if (communicationStyle.structure === "detailed") {
      insights.push("Your detailed approach provides comprehensive information");
      suggestions.push("Consider adding brief summaries to reinforce key points");
    } else {
      insights.push("Your direct approach makes information easily digestible");
      suggestions.push("Add more context to enhance understanding");
    }

    // Tone analysis
    if (communicationStyle.tone === "emotive") {
      insights.push("Your emotional tone creates strong connection");
      suggestions.push("Balance emotional content with factual information");
    } else {
      insights.push("Your factual tone provides clear information");
      suggestions.push("Consider adding more personal elements to increase engagement");
    }

    // Style-specific analysis
    if (speakingStyle.isDescriptive) {
      insights.push("Your descriptive style creates vivid imagery");
      suggestions.push("Use this strength to illustrate key points");
    }
    if (speakingStyle.isAnalytical) {
      insights.push("Your analytical approach shows thorough understanding");
      suggestions.push("Consider adding more concrete examples to illustrate your points");
    }
    if (speakingStyle.isPersuasive) {
      insights.push("Your persuasive style effectively conveys conviction");
      suggestions.push("Support your arguments with specific examples");
    }

    return { insights, suggestions };
  }

  private isConsistent(analyses: any[], path: string): boolean {
    const values = analyses.map(a => {
      const parts = path.split('.');
      return parts.reduce((obj, part) => obj[part], a);
    });
    return values.every(v => v === values[0]);
  }

  public async trainModel(): Promise<void> {
    try {
      if (!this.audioService) {
        throw new Error('Audio analysis service not initialized');
      }

      console.log('Starting model training...');
      await this.audioService.trainOnUserData();
      console.log('Model training completed successfully');
    } catch (error) {
      console.error('Error training model:', error);
      throw error;
    }
  }

  private async triggerModelTraining(): Promise<void> {
    try {
      // Only train if we have enough new data (at least 3 recordings)
      if (this.analysisHistory.length >= 3) {
        console.log('Triggering automatic model training...');
        await this.trainModel();
        console.log('Automatic model training completed');
      }
    } catch (error) {
      console.error('Error in automatic model training:', error);
      // Don't throw the error to prevent disrupting the analysis flow
    }
  }

  private analyzeConversationDynamics(): ConversationInsights {
    if (this.conversationHistory.length < 2) {
      return {
        turnTaking: {
          balance: 50,
          dominance: 50,
          interruptions: 0
        },
        interaction: {
          responsiveness: 50,
          engagement: 50,
          empathy: 50
        },
        dynamics: {
          flow: 'smooth',
          pattern: 'balanced',
          quality: 'medium'
        }
      };
    }

    const userTurns = this.conversationHistory.filter(turn => turn.speaker === 'user');
    const otherTurns = this.conversationHistory.filter(turn => turn.speaker === 'other');
    
    // Calculate turn-taking metrics
    const totalTurns = this.conversationHistory.length;
    const userTurnCount = userTurns.length;
    const otherTurnCount = otherTurns.length;
    
    const turnBalance = Math.abs(userTurnCount - otherTurnCount) / totalTurns * 100;
    const dominance = (userTurnCount / totalTurns) * 100;
    
    // Detect interruptions (turns less than 1 second apart)
    let interruptions = 0;
    for (let i = 1; i < this.conversationHistory.length; i++) {
      const timeDiff = this.conversationHistory[i].timestamp - this.conversationHistory[i-1].timestamp;
      if (timeDiff < 1000) { // Less than 1 second
        interruptions++;
      }
    }

    // Calculate interaction metrics
    const responsiveness = this.calculateResponsiveness();
    const engagement = this.calculateEngagement();
    const empathy = this.calculateEmpathy();

    // Determine conversation flow and pattern
    const flow = this.determineConversationFlow();
    const pattern = this.determineConversationPattern(dominance);
    const quality = this.determineConversationQuality(responsiveness, engagement, empathy);

    return {
      turnTaking: {
        balance: 100 - turnBalance,
        dominance,
        interruptions
      },
      interaction: {
        responsiveness,
        engagement,
        empathy
      },
      dynamics: {
        flow,
        pattern,
        quality
      }
    };
  }

  private calculateResponsiveness(): number {
    let totalResponsiveness = 0;
    let count = 0;

    for (let i = 1; i < this.conversationHistory.length; i++) {
      if (this.conversationHistory[i].speaker === 'user') {
        const prevTurn = this.conversationHistory[i-1];
        const currentTurn = this.conversationHistory[i];
        
        // Check if user's response is relevant to previous turn
        const relevance = this.calculateRelevance(prevTurn.speech, currentTurn.speech);
        totalResponsiveness += relevance;
        count++;
      }
    }

    return count > 0 ? Math.round(totalResponsiveness / count) : 50;
  }

  private calculateEngagement(): number {
    const userTurns = this.conversationHistory.filter(turn => turn.speaker === 'user');
    if (userTurns.length === 0) return 50;

    const engagementScores = userTurns.map(turn => {
      const hasQuestions = /\?/.test(turn.speech);
      const hasEmotionalWords = /(feel|think|believe|hope|wish|want|need|must|should)\b/i.test(turn.speech);
      const hasPersonalPronouns = /\b(I|we|you|they)\b/i.test(turn.speech);
      
      return (hasQuestions ? 30 : 0) + (hasEmotionalWords ? 40 : 0) + (hasPersonalPronouns ? 30 : 0);
    });

    return Math.round(engagementScores.reduce((a, b) => a + b, 0) / userTurns.length);
  }

  private calculateEmpathy(): number {
    const userTurns = this.conversationHistory.filter(turn => turn.speaker === 'user');
    if (userTurns.length === 0) return 50;

    const empathyScores = userTurns.map(turn => {
      const hasEmpatheticPhrases = /(I understand|I see|I hear you|that must be|I can imagine|I feel for you)\b/i.test(turn.speech);
      const hasSupportiveWords = /(support|help|assist|guide|encourage)\b/i.test(turn.speech);
      const hasAcknowledgment = /(yes|indeed|absolutely|certainly|of course)\b/i.test(turn.speech);
      
      return (hasEmpatheticPhrases ? 40 : 0) + (hasSupportiveWords ? 30 : 0) + (hasAcknowledgment ? 30 : 0);
    });

    return Math.round(empathyScores.reduce((a, b) => a + b, 0) / userTurns.length);
  }

  private determineConversationFlow(): string {
    const interruptions = this.conversationHistory.filter((turn, i) => {
      if (i === 0) return false;
      return turn.timestamp - this.conversationHistory[i-1].timestamp < 1000;
    }).length;

    if (interruptions > this.conversationHistory.length * 0.3) {
      return 'interrupted';
    } else if (this.conversationHistory.length < 4) {
      return 'one-sided';
    } else {
      return 'smooth';
    }
  }

  private determineConversationPattern(dominance: number): string {
    if (dominance > 70) return 'dominant';
    if (dominance < 30) return 'passive';
    return 'balanced';
  }

  private determineConversationQuality(
    responsiveness: number,
    engagement: number,
    empathy: number
  ): string {
    const average = (responsiveness + engagement + empathy) / 3;
    if (average > 75) return 'high';
    if (average < 40) return 'low';
    return 'medium';
  }

  private calculateRelevance(prevSpeech: string, currentSpeech: string): number {
    // Simple relevance calculation based on common words and phrases
    const prevWords = new Set(prevSpeech.toLowerCase().split(/\W+/));
    const currentWords = new Set(currentSpeech.toLowerCase().split(/\W+/));
    
    const commonWords = [...prevWords].filter(word => currentWords.has(word));
    return Math.min(100, Math.round((commonWords.length / Math.max(prevWords.size, currentWords.size)) * 100));
  }

  public addConversationTurn(speaker: 'user' | 'other', speech: string, metrics: {
    stress: number;
    clarity: number;
    engagement: number;
  }): void {
    this.conversationHistory.push({
      timestamp: Date.now(),
      speaker,
      speech,
      metrics
    });

    // Keep only last 10 turns
    if (this.conversationHistory.length > 10) {
      this.conversationHistory.shift();
    }
  }

  public clearConversationHistory(): void {
    this.conversationHistory = [];
  }

  private async initializeModel(): Promise<void> {
    // Initialize model logic
  }

  public async train(data: any[]): Promise<void> {
    try {
      if (!this.tensorflowService) {
        throw new Error('TensorflowService not initialized');
      }

      // Extract features from training data
      const trainingFeatures = await Promise.all(
        data.map(async (sample) => {
          const features = await this.tensorflowService!.extractAudioFeatures(sample.buffer);
          return {
            features,
            labels: sample.emotionalState
          };
        })
      );

      // Train the integrated analysis model
      await this.integratedAnalysis!.train(trainingFeatures);

      // Clear conversation history after training
      this.conversationHistory = [];
    } catch (error) {
      console.error('Error during training:', error);
      throw error;
    }
  }

  async reset(): Promise<void> {
    this.lastEmotionalState = { stress: 50, clarity: 50, engagement: 50 };
    this.analysisCount = 0;
    debugLog.audio('Emotion analysis service reset');
  }

  // Add automated test cases
  private async runTests(): Promise<void> {
    if (!DEBUG) return;

    debugLog.emotion('Running EmotionAnalysisService tests...');

    // Test 1: Service Initialization
    try {
      await measurePerformance('initializationTest', async () => {
        await this.initialize();
        debugLog.emotion('✅ Initialization test passed');
      });
    } catch (error) {
      debugLog.emotion('❌ Initialization test failed:', error);
    }

    // Test 2: Audio Analysis
    try {
      await measurePerformance('audioAnalysisTest', async () => {
        const testBuffer = new ArrayBuffer(1024);
        const result = await this.analyzeAudio(testBuffer);
        debugLog.audio('✅ Audio analysis test result:', result);
      });
    } catch (error) {
      debugLog.audio('❌ Audio analysis test failed:', error);
    }

    // Test 3: State Management
    try {
      await measurePerformance('stateManagementTest', async () => {
        const testState = { stress: 50, clarity: 50, engagement: 50 };
        this.updateCurrentState('audio', testState);
        const currentAnalysis = this.getCurrentAnalysis();
        debugLog.emotion('✅ State management test result:', currentAnalysis);
      });
    } catch (error) {
      debugLog.emotion('❌ State management test failed:', error);
    }
  }

  public getPersonalizedBaselines(): EmotionalState {
    return {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
  }

  public async trainOnUserData(): Promise<void> {
    try {
      // Train on recent analysis history
      if (this.analysisHistory.length > 0) {
        const recentData = this.analysisHistory.slice(-5); // Use last 5 analyses
        
        // Update baselines based on recent data
        const averages = recentData.reduce((acc, curr) => {
          acc.stress += curr.metrics.stress;
          acc.clarity += curr.metrics.clarity;
          acc.engagement += curr.metrics.engagement;
          return acc;
        }, { stress: 0, clarity: 0, engagement: 0 });

        this.lastEmotionalState = {
          stress: Math.round(averages.stress / recentData.length),
          clarity: Math.round(averages.clarity / recentData.length),
          engagement: Math.round(averages.engagement / recentData.length)
        };
      }
    } catch (error) {
      console.error('Error training on user data:', error);
      throw error;
    }
  }

  private async quickAnalysis(audioBuffer: ArrayBuffer): Promise<QuickAnalysisResult> {
    const audioData = new Float32Array(audioBuffer);
    let sum = 0;
    let max = 0;
    let crossings = 0;

    // Analyze only a subset of samples for speed
    const step = 2; // Reduced from 4 to 2 for better accuracy
    for (let i = 0; i < audioData.length; i += step) {
      const amplitude = Math.abs(audioData[i]);
      sum += amplitude;
      max = Math.max(max, amplitude);
      if (i > 0 && audioData[i] * audioData[i - step] < 0) {
        crossings++;
      }
    }

    const average = sum / (audioData.length / step);
    const normalizedCrossings = (crossings / (audioData.length / step)) * 1000;

    // More responsive emotional state updates with larger adjustments
    const newState = {
      stress: Math.min(100, Math.max(0, this.lastEmotionalState.stress + (max * 35 - 15))), // Increased from 25-12
      clarity: Math.min(100, Math.max(0, this.lastEmotionalState.clarity + (normalizedCrossings * 0.5 - 20))), // Increased from 0.3-15
      engagement: Math.min(100, Math.max(0, this.lastEmotionalState.engagement + (average * 45 - 20))) // Increased from 35-17
    };

    // Update analysis history
    this.analysisHistory.push({
      timestamp: Date.now(),
      speech: '',
      metrics: newState,
      style: {
        pace: 'moderate',
        structure: 'direct',
        tone: 'neutral',
        engagement: 'balanced'
      }
    });

    // Keep only last 5 analyses for faster response
    if (this.analysisHistory.length > 5) {
      this.analysisHistory.shift();
    }

    return {
      emotionalState: newState,
      analysis: 'Quick real-time analysis based on audio characteristics',
      suggestions: [
        'Continue speaking naturally',
        `Current stress level: ${newState.stress}% - ${this.getStressLevel(newState.stress)}`,
        `Speech clarity: ${newState.clarity}% - ${this.getClarityLevel(newState.clarity)}`,
        `Engagement: ${newState.engagement}% - ${this.getEngagementLevel(newState.engagement)}`
      ],
      confidence: 0.7 // Increased from 0.6 for more stable updates
    };
  }

  private getLastAnalysis(): EmotionalFeedback {
    return {
      emotionalState: this.currentState.video || this.getDefaultState(),
      analysis: '',
      suggestions: [],
      confidence: 0
    };
  }

  private getDefaultState(): EmotionalState {
    return {
      stress: 50,
      clarity: 50,
      engagement: 50
    };
  }

  private getDefaultAnalysis(): EmotionalFeedback {
    return {
      emotionalState: this.getDefaultState(),
      analysis: '',
      suggestions: [],
      confidence: 0
    };
  }

  private async analyzeEmotions(input: any, type: 'text' | 'audio' | 'video'): Promise<EmotionalFeedback> {
    const now = Date.now();
    
    if (now - this.lastAnalysis < this.MIN_ANALYSIS_INTERVAL) {
      return this.getLastAnalysis();
    }

    try {
      let result;
      switch (type) {
        case 'text':
          result = await this.llmService?.analyzeText(input);
          break;
        case 'audio':
          result = await this.audioService?.analyzeAudio(input);
          break;
        case 'video':
          result = await this.videoService?.analyzeVideoFrame(input);
          break;
      }

      if (!result) {
        throw new Error(`No analysis result for ${type}`);
      }

      this.lastAnalysis = now;

      // Combine with TensorFlow analysis for more accurate results
      const tfAnalysis = await this.tensorflowService?.analyze(input, type);
      
      // Weight the results (give more weight to TensorFlow for real-time)
      const combinedState = this.combineAnalysis(result.emotionalState, tfAnalysis ?? null, type);
      
      return {
        emotionalState: combinedState,
        analysis: result.analysis || '',
        suggestions: result.suggestions || [],
        confidence: result.confidence || 0
      };
    } catch (error) {
      console.error(`Error in ${type} analysis:`, error);
      return this.getDefaultAnalysis();
    }
  }

  private combineAnalysis(llmState: EmotionalState, tfState: EmotionalState | null, type: 'text' | 'audio' | 'video'): EmotionalState {
    if (!tfState) return llmState;

    // Give more weight to TensorFlow for real-time analysis
    const weights = {
      text: { llm: 0.7, tf: 0.3 },
      audio: { llm: 0.3, tf: 0.7 },
      video: { llm: 0.2, tf: 0.8 }
    };

    const weight = weights[type];

    return {
      stress: Math.round(llmState.stress * weight.llm + tfState.stress * weight.tf),
      clarity: Math.round(llmState.clarity * weight.llm + tfState.clarity * weight.tf),
      engagement: Math.round(llmState.engagement * weight.llm + tfState.engagement * weight.tf)
    };
  }
} 