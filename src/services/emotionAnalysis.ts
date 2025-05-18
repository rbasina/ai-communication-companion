import { EmotionalState } from '@/types/emotions';
import { TensorflowService } from './tensorflowService';
import { AudioAnalysisService } from './audioAnalysisService';
import { VideoAnalysisService } from './videoAnalysisService';
import { IntegratedEmotionAnalysis } from './integratedEmotionAnalysis';

export interface EmotionAnalysisService {
  analyzeAudio(buffer: ArrayBuffer): Promise<EmotionalState>;
  analyzeSpeechContext(prompt: string): Promise<EmotionalFeedback>;
}

export interface EmotionalFeedback {
  analysis: string;
  suggestions: string[];
  confidence: number;
}

export class EmotionAnalysisService {
  private static instance: EmotionAnalysisService;
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

  private constructor() {
    // Don't initialize services in constructor
    this.integratedAnalysis = IntegratedEmotionAnalysis.getInstance();
  }

  public static async getInstance(): Promise<EmotionAnalysisService> {
    if (!EmotionAnalysisService.instance) {
      EmotionAnalysisService.instance = new EmotionAnalysisService();
      // Initialize only once
      if (!EmotionAnalysisService.initializationPromise) {
        EmotionAnalysisService.initializationPromise = EmotionAnalysisService.instance.initialize();
      }
      // Wait for initialization
      await EmotionAnalysisService.initializationPromise;
    }
    return EmotionAnalysisService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      console.log('Initializing EmotionAnalysisService...');
      
      // Initialize services in parallel
      const [tensorflowService, audioService, videoService] = await Promise.all([
        TensorflowService.getInstance(),
        AudioAnalysisService.getInstance(),
        VideoAnalysisService.getInstance()
      ]);

      this.tensorflowService = tensorflowService;
      this.audioService = audioService;
      this.videoService = videoService;

      console.log('EmotionAnalysisService initialized successfully');
    } catch (error) {
      console.error('Error initializing EmotionAnalysisService:', error);
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

  public async analyzeText(text: string): Promise<EmotionalState> {
    try {
      if (!this.tensorflowService) {
        throw new Error('Text analysis service not initialized');
      }
      const analysis = await this.tensorflowService.analyzeText(text);
      const integrated = this.updateCurrentState('text', analysis);
      return integrated.emotionalState;
    } catch (error) {
      console.error('Error in text analysis:', error);
      throw error;
    }
  }

  public async analyzeAudio(audioBuffer: ArrayBuffer): Promise<EmotionalState> {
    try {
      console.log('🎯 Starting audio analysis');
      
      if (!this.audioService) {
        console.warn('❌ Audio analysis service not initialized, using baseline values');
        return {
          stress: 55,
          clarity: 54,
          engagement: 58
        };
      }

      // Validate audio buffer
      if (!audioBuffer || audioBuffer.byteLength < 100) {
        console.warn('❌ Invalid audio buffer, using baseline values:', {
          exists: !!audioBuffer,
          size: audioBuffer?.byteLength
        });
        return {
          stress: 55,
          clarity: 54,
          engagement: 58
        };
      }

      // Define baseline values
      const baselineValues = {
        stress: 55,
        clarity: 54,
        engagement: 58
      };
      console.log('ℹ️ Using baseline values:', baselineValues);

      try {
        // Analyze audio with validation
        console.log('🔍 Analyzing audio data...');
        const analysis = await this.audioService.analyzeAudio(audioBuffer);
        console.log('✅ Raw analysis results:', analysis);

        // Validate analysis results
        if (!analysis || typeof analysis !== 'object') {
          console.warn('⚠️ Invalid analysis result, using baseline values');
          return baselineValues;
        }

        const { stress, clarity, engagement } = analysis;

        // Validate individual metrics and apply baselines if needed
        const validateMetric = (value: number, baseline: number, name: string) => {
          if (typeof value !== 'number' || isNaN(value) || value < 0 || value > 100) {
            console.warn(`⚠️ Invalid ${name} value: ${value}, using baseline: ${baseline}`);
            return baseline;
          }
          // Blend with baseline (70% actual, 30% baseline)
          const result = Math.round(value * 0.7 + baseline * 0.3);
          console.log(`✅ ${name} validation passed:`, { raw: value, baseline, blended: result });
          return result;
        };

        // Create validated emotional state with baseline blending
        const validatedState: EmotionalState = {
          stress: validateMetric(stress, baselineValues.stress, 'stress'),
          clarity: validateMetric(clarity, baselineValues.clarity, 'clarity'),
          engagement: validateMetric(engagement, baselineValues.engagement, 'engagement')
        };

        console.log('✅ Final validated state:', validatedState);

        // Ensure at least one metric has a non-zero value
        if (validatedState.stress === 0 && validatedState.clarity === 0 && validatedState.engagement === 0) {
          console.warn('⚠️ All metrics are zero, using baseline values');
          return baselineValues;
        }

        // Update integrated analysis
        const integrated = this.updateCurrentState('audio', validatedState);
        console.log('✅ Analysis complete:', integrated.emotionalState);
        return integrated.emotionalState;

      } catch (error) {
        console.warn('❌ Error in audio analysis, using baseline values:', error);
        return baselineValues;
      }

    } catch (error) {
      console.warn('❌ Fatal error in audio analysis, using baseline values:', error);
      return {
        stress: 55,
        clarity: 54,
        engagement: 58
      };
    }
  }

  public async analyzeVideo(frameData: ImageData): Promise<EmotionalState> {
    try {
      if (!this.videoService) {
        throw new Error('Video analysis service not initialized');
      }
      const analysis = await this.videoService.analyzeFrame(frameData);
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
      if (!this.tensorflowService) {
        console.warn('Text analysis service not initialized');
        return {
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
          analysis: "Waiting for speech input...",
          suggestions: [],
          confidence: 0
        };
      }

      // Initialize analysis components
      let analysisPoints: string[] = [];
      const suggestions: string[] = [];
      let confidence = 75;

      // Enhanced speech pattern analysis
      const words = speech.split(/\s+/);
      const wordCount = words.length;
      const sentenceCount = (speech.match(/[.!?]+/g) || []).length;
      const wordsPerSentence = wordCount / Math.max(1, sentenceCount);
      const wordsPerSecond = wordCount / 5; // Approximate speaking duration
      
      // Analyze pauses and rhythm
      const pausePatterns = speech.match(/[,.!?]\s+/g) || [];
      const hasPauses = pausePatterns.length > 0;
      const pauseFrequency = pausePatterns.length / wordCount;
      
      // Enhanced filler word analysis
      const fillerWords = speech.match(/\b(um|uh|like|you know|basically|actually|literally|sort of|kind of)\b/gi) || [];
      const fillerWordCount = fillerWords.length;
      const fillerWordRatio = fillerWordCount / wordCount;
      
      // Analyze sentence complexity
      const complexWords = words.filter(word => word.length > 6).length;
      const complexityRatio = complexWords / wordCount;
      
      // Analyze repetition
      const wordFrequency = new Map<string, number>();
      words.forEach(word => {
        const normalized = word.toLowerCase();
        wordFrequency.set(normalized, (wordFrequency.get(normalized) || 0) + 1);
      });
      const repeatedWords = Array.from(wordFrequency.entries())
        .filter(([_, count]) => count > 2)
        .map(([word]) => word);

      // Dynamic confidence calculation based on speech metrics
      confidence = Math.min(100, Math.round(
        75 + // Base confidence
        (hasPauses ? 5 : -5) + // Proper pausing
        (fillerWordRatio < 0.1 ? 5 : -5) + // Limited filler words
        (wordsPerSentence > 5 && wordsPerSentence < 20 ? 5 : -5) + // Good sentence length
        (complexityRatio > 0.1 && complexityRatio < 0.4 ? 5 : -5) + // Balanced complexity
        (repeatedWords.length < 3 ? 5 : -5) // Limited repetition
      ));

      // Dynamic analysis based on multiple factors
      if (stress > 60) {
        if (wordsPerSecond > 3) {
          analysisPoints.push("Your speaking pace suggests elevated stress");
          suggestions.push("Try taking deeper breaths between sentences to maintain a more relaxed pace");
        } else if (!hasPauses) {
          analysisPoints.push("Your speech pattern indicates some tension");
          suggestions.push("Include natural pauses to help manage stress and improve clarity");
        }
      } else if (stress < 40 && engagement < 50) {
        if (complexityRatio < 0.1) {
          analysisPoints.push("Your relaxed tone could benefit from more expressive language");
          suggestions.push("Try incorporating more descriptive words while maintaining your calm delivery");
        } else {
          analysisPoints.push("Your relaxed tone could be more engaging");
          suggestions.push("Add more vocal variety while maintaining your composure");
        }
      }

      // Enhanced clarity analysis
      if (clarity < 60) {
        if (fillerWordRatio > 0.15) {
          analysisPoints.push(`Frequent use of filler words (${Math.round(fillerWordRatio * 100)}% of speech) is affecting clarity`);
          suggestions.push("Practice replacing filler words with brief pauses");
        } else if (wordsPerSecond > 3) {
          analysisPoints.push("Your quick pace may be impacting clarity");
          suggestions.push("Try slowing down slightly and emphasizing key words");
        } else if (repeatedWords.length > 2) {
          analysisPoints.push("Word repetition is affecting your message clarity");
          suggestions.push(`Consider using alternatives for frequently repeated words: ${repeatedWords.join(', ')}`);
        }
      } else if (clarity > 75) {
        analysisPoints.push("Excellent clarity in your speech");
      }

      // Enhanced engagement analysis
      if (engagement < 55) {
        if (pauseFrequency < 0.1) {
          analysisPoints.push("More dynamic pacing could increase engagement");
          suggestions.push("Try varying your pace and including strategic pauses");
        } else if (complexityRatio < 0.15) {
          analysisPoints.push("More varied vocabulary could enhance engagement");
          suggestions.push("Include more descriptive and precise words to make your message more compelling");
        }
      } else if (engagement > 70) {
        if (stress < 50) {
          analysisPoints.push("You're maintaining an engaging and natural communication style");
        } else {
          analysisPoints.push("Good engagement, though slightly tense");
          suggestions.push("Focus on maintaining your engaging style while taking calming breaths");
        }
      }

      // Combine analysis points intelligently
      let analysis = '';
      if (analysisPoints.length > 0) {
        // Select most relevant points based on current metrics
        const sortedPoints = analysisPoints.sort((a, b) => {
          const aRelevance = a.toLowerCase().includes('stress') ? stress : 
                           a.toLowerCase().includes('clarity') ? (100 - clarity) :
                           a.toLowerCase().includes('engage') ? (100 - engagement) : 50;
          const bRelevance = b.toLowerCase().includes('stress') ? stress :
                           b.toLowerCase().includes('clarity') ? (100 - clarity) :
                           b.toLowerCase().includes('engage') ? (100 - engagement) : 50;
          return bRelevance - aRelevance;
        });

        // Take top 2 most relevant points
        analysis = sortedPoints.slice(0, 2).join('. ');
      } else {
        analysis = "Your communication is well-balanced";
      }

      // Limit to top 2 most relevant suggestions
      const finalSuggestions = suggestions
        .filter((s, i, arr) => arr.indexOf(s) === i) // Remove duplicates
        .slice(0, 2);

      return {
        analysis,
        suggestions: finalSuggestions,
        confidence
      };

    } catch (error) {
      console.error('Error in speech context analysis:', error);
      return {
        analysis: "Unable to analyze speech context",
        suggestions: [],
        confidence: 0
      };
    }
  }
} 