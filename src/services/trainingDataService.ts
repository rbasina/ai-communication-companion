import { EmotionalState } from '@/types/emotions';

export interface TrainingData {
  audioData: Float32Array;
  emotionalState: EmotionalState;
  timestamp: number;
}

export class TrainingDataService {
  private static instance: TrainingDataService | null = null;
  private trainingData: TrainingData[] = [];

  private constructor() {}

  public static getInstance(): TrainingDataService {
    if (!TrainingDataService.instance) {
      TrainingDataService.instance = new TrainingDataService();
    }
    return TrainingDataService.instance;
  }

  public async getTrainingData(): Promise<TrainingData[]> {
    return this.trainingData;
  }

  public async addTrainingData(data: TrainingData): Promise<void> {
    this.trainingData.push(data);
    // Keep only last 100 training samples
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
  }

  public clearTrainingData(): void {
    this.trainingData = [];
  }
} 