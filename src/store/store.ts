import { EmotionalState } from '@/types/emotions';

export interface CommunicationState {
  messages: any[];
  emotionalStates: {
    text: EmotionalState;
    audio: EmotionalState;
  };
  isProcessing: boolean;
  error: string | null;
}

export interface RootState {
  communication: CommunicationState;
} 