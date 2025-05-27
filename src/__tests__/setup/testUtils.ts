import { Store } from 'redux';
import { AnyAction } from 'redux';
import configureStore from 'redux-mock-store';

export interface RootState {
  communication: {
    emotionalStates: {
      audio?: {
        emotionalState: {
          stress: number;
          clarity: number;
          engagement: number;
        };
        confidence: number;
        weight: number;
      };
      video?: {
        emotionalState: {
          stress: number;
          clarity: number;
          engagement: number;
        };
        confidence: number;
        weight: number;
      };
    };
  };
}

export type MockStore = Store<RootState, AnyAction> & {
  getActions: () => AnyAction[];
};

export const createMockStore = () => {
  const mockStore = configureStore<RootState>([]);
  return mockStore as unknown as MockStore;
};

export const initialState: RootState = {
  communication: {
    emotionalStates: {
      audio: {
        emotionalState: {
          stress: 50,
          clarity: 50,
          engagement: 50
        },
        confidence: 0.8,
        weight: 1
      },
      video: {
        emotionalState: {
          stress: 50,
          clarity: 50,
          engagement: 50
        },
        confidence: 0.8,
        weight: 1
      }
    }
  }
}; 