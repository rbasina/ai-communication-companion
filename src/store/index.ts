import { configureStore } from '@reduxjs/toolkit';
import communicationReducer from './slices/communicationSlice';

export const store = configureStore({
  reducer: {
    communication: communicationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch; 