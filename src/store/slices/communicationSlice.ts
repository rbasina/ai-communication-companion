import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EmotionalState } from '@/types/emotions';

interface EmotionalStateWithMetadata {
  emotionalState: EmotionalState;
  confidence: number;
  weight: number;
}

interface AudioState {
  isRecording: boolean;
  isPlaying: boolean;
  duration: number;
  audioLevel: number;
  timeRemaining: number;
  transcription: string;
  isAnalyzing: boolean;
  emotionalFeedback?: {
    analysis: string;
    suggestions: string[];
    confidence: number;
  };
  currentlyPlayingId?: string;
  isPlaybackLocked: boolean;
  confidence: number;
}

interface CommunicationState {
  mode: 'text' | 'audio' | 'video';
  emotionalStates: {
    text?: EmotionalStateWithMetadata;
    audio?: EmotionalStateWithMetadata;
    video?: EmotionalStateWithMetadata;
  };
  audioState: AudioState;
  history: Array<{
    message: string;
    emotionalState: EmotionalState;
    timestamp?: number;
    mode?: 'text' | 'audio' | 'video';
    confidence?: number;
  }>;
  overallConfidence: number;
  textMessages: Array<{
    id: string;
    text: string;
    timestamp: number;
    emotionalState: EmotionalState;
    analysis: string;
    suggestions: string[];
    confidence: number;
  }>;
}

const initialEmotionalState: EmotionalState = {
  stress: 50,
  clarity: 50,
  engagement: 50
};

const initialModalityState: EmotionalStateWithMetadata = {
  emotionalState: { ...initialEmotionalState },
  confidence: 0.3,
  weight: 1
};

const initialAudioState: AudioState = {
  isRecording: false,
  isPlaying: false,
  duration: 0,
  audioLevel: 0,
  timeRemaining: 60,
  transcription: '',
  isAnalyzing: false,
  isPlaybackLocked: false,
  confidence: 30
};

const initialState: CommunicationState = {
  mode: 'text',
  emotionalStates: {},
  audioState: { ...initialAudioState },
  history: [],
  overallConfidence: 0.3,
  textMessages: []
};

// Helper function to validate emotional state values
const validateEmotionalState = (state: EmotionalState | undefined): EmotionalState => {
  if (!state) {
    return { ...initialEmotionalState };
  }
  return {
    stress: isNaN(state.stress) ? 50 : Math.min(100, Math.max(0, state.stress)),
    clarity: isNaN(state.clarity) ? 50 : Math.min(100, Math.max(0, state.clarity)),
    engagement: isNaN(state.engagement) ? 50 : Math.min(100, Math.max(0, state.engagement))
  };
};

// Helper function to check if an emotional state is active (different from default)
const isEmotionalStateActive = (state: EmotionalState): boolean => {
  const defaultState = initialEmotionalState;
  return state.stress !== defaultState.stress ||
         state.clarity !== defaultState.clarity ||
         state.engagement !== defaultState.engagement;
};

export const communicationSlice = createSlice({
  name: 'communication',
  initialState,
  reducers: {
    setMode: (state, action: PayloadAction<'text' | 'audio' | 'video'>) => {
      state.mode = action.payload;
      // Initialize modality state with default values
      state.emotionalStates[action.payload] = { ...initialModalityState };
    },
    updateEmotionalState: (state, action: PayloadAction<{
      emotionalState: EmotionalState;
      confidence: number;
      weight: number;
    }>) => {
      const { mode } = state;
      const { emotionalState, confidence, weight } = action.payload;
      const currentState = state.emotionalStates[mode];

      // Validate and normalize the emotional state
      const validatedState = validateEmotionalState(emotionalState);
      
      // Validate confidence (ensure it's between 0 and 1)
      const validConfidence = confidence !== undefined ? 
        Math.min(1, Math.max(0, isNaN(confidence) ? 0.3 : confidence)) :
        currentState?.confidence || 0.3;

      // Update the modality state
      state.emotionalStates[mode] = {
        emotionalState: validatedState,
        confidence: validConfidence,
        weight: weight || currentState?.weight || 1,
      };

      // Calculate overall confidence based on active modalities
      const activeModalities = Object.entries(state.emotionalStates)
        .filter(([_, modalityState]) => {
          const isActive = isEmotionalStateActive(modalityState.emotionalState);
          const hasConfidence = modalityState.confidence > 0;
          return isActive && hasConfidence;
        });

      if (activeModalities.length > 0) {
        const totalConfidence = activeModalities.reduce(
          (sum, [_, modalityState]) => sum + modalityState.confidence * modalityState.weight,
          0
        );
        const totalWeight = activeModalities.reduce(
          (sum, [_, modalityState]) => sum + modalityState.weight,
          0
        );
        state.overallConfidence = totalWeight > 0 ? 
          Math.min(1, Math.max(0, totalConfidence / totalWeight)) : 
          0.3;
      } else {
        state.overallConfidence = 0.3; // Default confidence when no active modalities
      }
    },
    updateAudioState: (state, action: PayloadAction<Partial<AudioState>>) => {
      state.audioState = { ...state.audioState, ...action.payload };
    },
    addToHistory: (state, action: PayloadAction<{
      message: string;
      emotionalState: EmotionalState;
      confidence?: number;
    }>) => {
      state.history.push({
        ...action.payload,
        timestamp: Date.now(),
        mode: state.mode,
        confidence: action.payload.confidence || state.emotionalStates[state.mode]?.confidence || 0.3
      });
    },
    addTextMessage: (state, action: PayloadAction<{
      id: string;
      text: string;
      timestamp: number;
      emotionalState: EmotionalState;
      analysis: string;
      suggestions: string[];
      confidence: number;
    }>) => {
      state.textMessages.push(action.payload);
    },
    resetEmotionalStates: (state) => {
      state.emotionalStates = {};
      state.history = [];
      state.overallConfidence = 0.3;
      state.audioState = { ...initialAudioState };
      // Don't reset text messages when resetting emotional states
    }
  }
});

export const { setMode, updateEmotionalState, updateAudioState, addToHistory, addTextMessage, resetEmotionalStates } = communicationSlice.actions;

export default communicationSlice.reducer; 