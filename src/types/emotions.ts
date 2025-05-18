export interface EmotionalState {
  stress: number;    // 0-100 scale
  clarity: number;   // 0-100 scale
  engagement: number; // 0-100 scale
}

export interface EmotionalAnalysis extends EmotionalState {
  timestamp: number;
  confidence: number; // 0-1 scale
}

export interface EmotionalSuggestion {
  id: string;
  text: string;
  context: string;
  emotionalState: EmotionalState;
  timestamp: number;
} 