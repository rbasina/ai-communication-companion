import { useEffect, useState, useRef } from 'react';
import { EmotionalState } from '@/types/emotions';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

// Environment variable to control debug mode (defaults to true in development)
const DEBUG_MODE = process.env.NODE_ENV === 'development';

interface ModalityState {
  emotionalState: EmotionalState;
  confidence: number;
  weight: number;
}

interface EmotionVisualizerProps {
  activeModalities: {
    text?: ModalityState;
    audio?: ModalityState;
    video?: ModalityState;
  };
  integratedState: EmotionalState;
  overallConfidence: number;
}

const ModalityIcon = ({ type }: { type: 'text' | 'audio' | 'video' }) => {
  const icons = {
    text: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    audio: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
    video: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  };

  return icons[type];
};

const EmotionBar = ({ value, label, color }: { value: number; label: string; color: string }) => {
  // Ensure value is a valid number between 0-100
  const safeValue = isNaN(value) || value === undefined ? 50 : Math.max(0, Math.min(100, value));
  
  // State to track previous value for highlighting changes
  const [prevValue, setPrevValue] = useState(safeValue);
  const [isHighlighted, setIsHighlighted] = useState(false);
  
  // Check if the value has changed
  useEffect(() => {
    if (prevValue !== safeValue) {
      // Highlight the bar
      setIsHighlighted(true);
      
      // After a short delay, remove the highlight
      const timer = setTimeout(() => {
        setIsHighlighted(false);
        setPrevValue(safeValue);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [safeValue, prevValue]);
  
  return (
    <div className="mb-2">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-medium ${isHighlighted ? 'font-bold text-blue-700' : 'text-gray-700'}`}>
          {Math.round(safeValue)}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full ${color} ${isHighlighted ? 'transition-all duration-500 shadow-md' : ''}`}
          style={{ width: `${safeValue}%`, transition: 'width 0.3s ease-in-out' }}
        />
      </div>
    </div>
  );
};

const ModalityCard = ({
  type,
  state,
  isActive,
}: {
  type: 'text' | 'audio' | 'video';
  state?: ModalityState;
  isActive: boolean;
}) => {
  const titles = {
    text: 'Text Analysis',
    audio: 'Audio Analysis',
    video: 'Video Analysis',
  };

  return (
    <div
      className={`p-4 rounded-lg ${
        isActive ? 'bg-white shadow-md' : 'bg-gray-100'
      }`}
    >
      <div className="flex items-center mb-3">
        <div className={`mr-2 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
          <ModalityIcon type={type} />
        </div>
        <h3 className="text-lg font-semibold">{titles[type]}</h3>
      </div>
      
      {state && (
        <div>
          <div className="mb-2">
            <span className="text-sm text-gray-600">Confidence: </span>
            <span className="font-medium">{Math.round(state.confidence * 100)}%</span>
          </div>
          <div className="mb-2">
            <span className="text-sm text-gray-600">Weight: </span>
            <span className="font-medium">{Math.round(state.weight * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default function EmotionAnalysisVisualizer({
  activeModalities,
  integratedState,
  overallConfidence,
}: EmotionVisualizerProps) {
  // Get the latest history entry for the current mode and emotional state from Redux
  const { history, mode, emotionalStates } = useSelector((state: RootState) => state.communication);
  const currentState = emotionalStates[mode];
  const [lastUpdated, setLastUpdated] = useState<string>('');
  
  // Update the last updated time whenever history or mode changes
  useEffect(() => {
    if (history.length > 0) {
      const latestEntry = [...history]
        .filter(entry => entry.mode === mode)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
        
      if (latestEntry) {
        // Format the timestamp
        const date = new Date(latestEntry.timestamp);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastUpdated(timeString);
      }
    }
  }, [history, mode]);
  
  // Always use the current Redux state (which should be synchronized with the Debug Panel)
  // This ensures both displays show the same values
  const safeIntegratedState = {
    stress: currentState.stress,
    clarity: currentState.clarity,
    engagement: currentState.engagement
  };
  
  // Format confidence as percentage
  const safeConfidence = overallConfidence || 0;
  const confidencePercent = Math.round(safeConfidence * 100);
  
  return (
    <div className="bg-white p-6 rounded-xl mb-12 shadow-md border border-gray-200">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-blue-800">Integrated Emotion Analysis</h2>
          {lastUpdated && (
            <div className="text-xs text-gray-500">
              Last updated: {lastUpdated}
            </div>
          )}
        </div>
        
        <div className="mb-4">
          <EmotionBar
            value={safeIntegratedState.stress}
            label="Stress Level"
            color="bg-red-500"
          />
          <EmotionBar
            value={safeIntegratedState.clarity}
            label="Clarity"
            color="bg-blue-500"
          />
          <EmotionBar
            value={safeIntegratedState.engagement}
            label="Engagement"
            color="bg-green-500"
          />
          
          {/* Debug section to verify values - only shown in development mode */}
          {DEBUG_MODE && (
            <div className="text-xs text-gray-500 mt-1 border-t pt-1">
              Debug: Stress={safeIntegratedState.stress}%, Clarity={safeIntegratedState.clarity}%, Engagement={safeIntegratedState.engagement}%
            </div>
          )}
        </div>
        <div className="text-sm text-gray-600 border-t pt-4 mt-2">
          Overall Confidence: {confidencePercent}%
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ModalityCard
          type="text"
          state={activeModalities.text}
          isActive={!!activeModalities.text}
        />
        <ModalityCard
          type="audio"
          state={activeModalities.audio}
          isActive={!!activeModalities.audio}
        />
        <ModalityCard
          type="video"
          state={activeModalities.video}
          isActive={!!activeModalities.video}
        />
      </div>
    </div>
  );
} 