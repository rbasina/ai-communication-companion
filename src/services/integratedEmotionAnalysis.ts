import { AudioFeatures } from './tensorflowService';
import { EmotionalState } from '@/types/emotions';

interface ModalityWeights {
  text: number;
  audio: number;
  video: number;
}

interface CrossModalAnalysis {
  emotionalState: EmotionalState;
  confidence: number;
  activeModalities: ('text' | 'audio' | 'video')[];
}

interface TrainingData {
  features: AudioFeatures;
  labels: EmotionalState;
}

export class IntegratedEmotionAnalysis {
  private static instance: IntegratedEmotionAnalysis | null = null;
  private isInitialized: boolean = false;
  private modalityWeights: ModalityWeights = {
    text: 0.3,
    audio: 0.35,
    video: 0.35,
  };

  private constructor() {}

  public static getInstance(): IntegratedEmotionAnalysis {
    if (!IntegratedEmotionAnalysis.instance) {
      IntegratedEmotionAnalysis.instance = new IntegratedEmotionAnalysis();
    }
    return IntegratedEmotionAnalysis.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    // Initialize models and resources
    this.isInitialized = true;
  }

  public async analyzeAudioFeatures(features: AudioFeatures): Promise<EmotionalState> {
    if (!this.isInitialized) {
      throw new Error('IntegratedEmotionAnalysis not initialized');
    }

    // Analyze features and return emotional state
    return {
      stress: this.calculateStress(features),
      clarity: this.calculateClarity(features),
      engagement: this.calculateEngagement(features)
    };
  }

  public async train(data: TrainingData[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('IntegratedEmotionAnalysis not initialized');
    }

    try {
      // Implement training logic here
      for (const sample of data) {
        await this.trainOnSample(sample);
      }
    } catch (error) {
      console.error('Error during integrated analysis training:', error);
      throw error;
    }
  }

  private async trainOnSample(sample: TrainingData): Promise<void> {
    // Implement single sample training
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate training
  }

  private calculateStress(features: AudioFeatures): number {
    // Implement stress calculation
    return 50;
  }

  private calculateClarity(features: AudioFeatures): number {
    // Implement clarity calculation
    return 50;
  }

  private calculateEngagement(features: AudioFeatures): number {
    // Implement engagement calculation
    return 50;
  }

  private validateEmotions(emotions: EmotionalState[]): boolean {
    return emotions.every(emotion => 
      typeof emotion.stress === 'number' &&
      typeof emotion.clarity === 'number' &&
      typeof emotion.engagement === 'number'
    );
  }

  private calculateConfidence(activeModalities: ('text' | 'audio' | 'video')[]): number {
    // If no active modalities, confidence is 0
    if (activeModalities.length === 0) return 0;
    
    // Give higher confidence based on number of active modalities
    const baseConfidence = activeModalities.length / 3;
    
    // Add weight for each active modality
    const weightedConfidence = activeModalities.reduce((sum, modality) => 
      sum + this.modalityWeights[modality], 0
    ) / (this.modalityWeights.text + this.modalityWeights.audio + this.modalityWeights.video);
    
    // Combine both factors, with a minimum of 0.3 if any modality is active
    return Math.max(0.3, (baseConfidence + weightedConfidence) / 2);
  }

  private detectEmotionalConflict(emotions: EmotionalState[]): boolean {
    if (emotions.length < 2) return false;

    const threshold = 30; // 30% difference threshold
    for (let i = 0; i < emotions.length - 1; i++) {
      for (let j = i + 1; j < emotions.length; j++) {
        if (
          Math.abs(emotions[i].stress - emotions[j].stress) > threshold ||
          Math.abs(emotions[i].clarity - emotions[j].clarity) > threshold ||
          Math.abs(emotions[i].engagement - emotions[j].engagement) > threshold
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private adjustWeightsForConflict(
    emotions: EmotionalState[],
    modalities: ('text' | 'audio' | 'video')[]
  ): ModalityWeights {
    const weights = { ...this.modalityWeights };
    
    // If there's a conflict, adjust weights based on reliability hierarchy
    if (this.detectEmotionalConflict(emotions)) {
      const reliabilityOrder = ['video', 'audio', 'text'];
      const activeReliableModalities = reliabilityOrder.filter(m => 
        modalities.includes(m as 'text' | 'audio' | 'video')
      );
      
      if (activeReliableModalities.length > 0) {
        const primaryModality = activeReliableModalities[0];
        const boost = 0.2; // Boost weight by 20%
        const reduction = boost / (modalities.length - 1);
        
        modalities.forEach(modality => {
          if (modality === primaryModality) {
            weights[modality] += boost;
          } else {
            weights[modality] -= reduction;
          }
        });
      }
    }

    return weights;
  }

  public analyzeIntegratedEmotions(
    emotionalStates: {
      text?: EmotionalState;
      audio?: EmotionalState;
      video?: EmotionalState;
    }
  ): CrossModalAnalysis {
    const activeModalities = Object.entries(emotionalStates)
      .filter(([_, state]) => state !== undefined)
      .map(([modality]) => modality) as ('text' | 'audio' | 'video')[];

    const emotions = activeModalities.map(modality => emotionalStates[modality]!);

    // Check for empty array of emotions
    if (emotions.length === 0) {
      console.warn('No active modalities found, returning default state');
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

    if (!this.validateEmotions(emotions)) {
      console.error('Invalid emotional state data', emotions);
      throw new Error('Invalid emotional state data');
    }

    const adjustedWeights = this.adjustWeightsForConflict(emotions, activeModalities);
    
    // Calculate weighted average for each emotional component
    const weightedSum = emotions.reduce((sum, emotion, index) => {
      const modality = activeModalities[index];
      const weight = adjustedWeights[modality];
      
      // Force all values to be numbers
      const stressValue = Number(emotion.stress) || 50;
      const clarityValue = Number(emotion.clarity) || 50;
      const engagementValue = Number(emotion.engagement) || 50;
      
      return {
        stress: sum.stress + (stressValue * weight),
        clarity: sum.clarity + (clarityValue * weight),
        engagement: sum.engagement + (engagementValue * weight),
      };
    }, { stress: 0, clarity: 0, engagement: 0 });

    const totalWeight = activeModalities.reduce((sum, modality) => 
      sum + adjustedWeights[modality], 0
    );

    // Ensure totalWeight is not zero to avoid division by zero
    const safeTotalWeight = totalWeight > 0 ? totalWeight : 1;

    const integratedEmotions: EmotionalState = {
      stress: Math.round(weightedSum.stress / safeTotalWeight),
      clarity: Math.round(weightedSum.clarity / safeTotalWeight),
      engagement: Math.round(weightedSum.engagement / safeTotalWeight),
    };

    // Debug log
    console.log('Integrated emotions calculated:', {
      integratedEmotions,
      activeModalities,
      confidence: this.calculateConfidence(activeModalities)
    });

    return {
      emotionalState: integratedEmotions,
      confidence: this.calculateConfidence(activeModalities),
      activeModalities,
    };
  }

  public updateModalityWeights(newWeights: Partial<ModalityWeights>): void {
    this.modalityWeights = {
      ...this.modalityWeights,
      ...newWeights,
    };
  }
} 