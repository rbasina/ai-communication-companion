import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updateEmotionalState, EmotionalState } from '@/store/slices/communicationSlice';
import { EmotionAnalysisService } from '@/services/emotionAnalysis';

export default function DebugPanel() {
  const dispatch = useDispatch();
  const { mode, emotionalStates, history } = useSelector((state: RootState) => state.communication);
  const currentEmotionalState = emotionalStates[mode];
  const [emotionService, setEmotionService] = useState<EmotionAnalysisService | null>(null);
  
  // Track latest analyzed emotion from history
  const [latestEmotion, setLatestEmotion] = useState<EmotionalState | null>(null);
  
  // Sync slider values with current emotional state
  const [values, setValues] = useState({
    stress: currentEmotionalState.stress,
    clarity: currentEmotionalState.clarity,
    engagement: currentEmotionalState.engagement
  });
  
  // Keep values in sync with Redux emotional state
  useEffect(() => {
    setValues({
      stress: currentEmotionalState.stress,
      clarity: currentEmotionalState.clarity,
      engagement: currentEmotionalState.engagement
    });
  }, [currentEmotionalState]);
  
  // Keep track of the latest emotion from history
  useEffect(() => {
    if (history.length > 0) {
      // Get the latest entry that matches the current mode
      const latestEntry = [...history]
        .filter(entry => entry.mode === mode)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
        
      if (latestEntry) {
        setLatestEmotion(latestEntry.emotionalState);
        
        // Automatically sync on load and whenever history changes
        // This ensures Integrated Analysis and Debug Panel are always in sync
        const autoSyncValues = latestEntry.emotionalState;
        setValues(autoSyncValues);
        dispatch(updateEmotionalState(autoSyncValues));
        
        if (emotionService) {
          emotionService.updateFromRedux(mode, autoSyncValues);
        }
      }
    }
  }, [history, mode, dispatch, emotionService]);
  
  // Initialize emotion service
  useEffect(() => {
    const initService = async () => {
      try {
        const service = await EmotionAnalysisService.getInstance();
        setEmotionService(service);
      } catch (err) {
        console.error('Failed to initialize emotion service:', err);
      }
    };
    initService();
  }, []);

  const generateRandomValues = () => {
    const newValues = {
      stress: Math.round(40 + Math.random() * 40), // 40-80 range
      clarity: Math.round(60 + Math.random() * 30), // 60-90 range
      engagement: Math.round(50 + Math.random() * 45)  // 50-95 range
    };
    
    setValues(newValues);
    dispatch(updateEmotionalState(newValues));
    
    // Update the emotion service directly
    if (emotionService) {
      console.log('Directly updating emotion service from debug panel with random values');
      emotionService.updateFromRedux(mode, newValues);
    }
  };

  const handleValueChange = (key: keyof EmotionalState, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      const newValues = { ...values, [key]: numValue };
      setValues(newValues);
    }
  };
  
  const applyValues = () => {
    dispatch(updateEmotionalState(values));
    
    // Also update the emotion service directly
    if (emotionService) {
      console.log('Directly updating emotion service from debug panel with applied values');
      emotionService.updateFromRedux(mode, values);
    }
    
    // Add visual feedback when values are applied
    const applyButton = document.querySelector('button.bg-blue-600') as HTMLButtonElement;
    if (applyButton) {
      const originalText = applyButton.textContent;
      applyButton.textContent = '✓ Applied!';
      applyButton.classList.add('bg-green-600');
      applyButton.classList.remove('bg-blue-600');
      
      setTimeout(() => {
        applyButton.textContent = originalText;
        applyButton.classList.remove('bg-green-600');
        applyButton.classList.add('bg-blue-600');
      }, 1500);
    }
  };
  
  // Function to sync with latest analyzed emotion
  const syncWithLatest = () => {
    if (latestEmotion) {
      setValues(latestEmotion);
      dispatch(updateEmotionalState(latestEmotion));
      
      if (emotionService) {
        emotionService.updateFromRedux(mode, latestEmotion);
      }
      
      // Visual feedback
      const button = document.getElementById('sync-button') as HTMLButtonElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✓ Synced!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 1500);
      }
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mt-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-bold text-blue-700">Emotion Debug Panel</h2>
        
        {/* Add sync button */}
        {latestEmotion && (
          <button
            id="sync-button"
            onClick={syncWithLatest}
            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Sync with Latest Analysis
          </button>
        )}
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium">Current Mode:</span>
          <span className="font-bold">{mode}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium">Current Stress:</span>
          <span>{currentEmotionalState.stress}%</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium">Current Clarity:</span>
          <span>{currentEmotionalState.clarity}%</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium">Current Engagement:</span>
          <span>{currentEmotionalState.engagement}%</span>
        </div>
      </div>
      
      {latestEmotion && (
        <div className="mb-4 bg-blue-50 p-2 rounded text-sm">
          <div className="font-medium text-blue-700 mb-1">Latest Analysis:</div>
          <div className="grid grid-cols-3 gap-2">
            <div>Stress: {latestEmotion.stress}%</div>
            <div>Clarity: {latestEmotion.clarity}%</div>
            <div>Engagement: {latestEmotion.engagement}%</div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div>
          <label className="block text-sm text-gray-600">Stress</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={values.stress}
            onChange={(e) => handleValueChange('stress', e.target.value)}
            className="w-full" 
          />
          <input 
            type="number" 
            min="0" 
            max="100" 
            value={values.stress}
            onChange={(e) => handleValueChange('stress', e.target.value)}
            className="w-full text-center text-sm" 
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Clarity</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={values.clarity}
            onChange={(e) => handleValueChange('clarity', e.target.value)}
            className="w-full" 
          />
          <input 
            type="number" 
            min="0" 
            max="100" 
            value={values.clarity}
            onChange={(e) => handleValueChange('clarity', e.target.value)}
            className="w-full text-center text-sm" 
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Engagement</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={values.engagement}
            onChange={(e) => handleValueChange('engagement', e.target.value)}
            className="w-full" 
          />
          <input 
            type="number" 
            min="0" 
            max="100" 
            value={values.engagement}
            onChange={(e) => handleValueChange('engagement', e.target.value)}
            className="w-full text-center text-sm" 
          />
        </div>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={applyValues}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded"
        >
          Apply Values
        </button>
        <button
          onClick={generateRandomValues}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded"
        >
          Generate Random Values
        </button>
      </div>
      
      {/* Force update button for debugging */}
      <div className="mt-4 text-center">
        <button
          onClick={() => {
            if (emotionService) {
              // Force strong emotion values to ensure visibility
              const forceValues = {
                stress: 90,
                clarity: 85,
                engagement: 95
              };
              
              // Update both local state and the service
              dispatch(updateEmotionalState(forceValues));
              emotionService.updateFromRedux(mode, forceValues);
              
              // Visual feedback
              const btn = document.activeElement as HTMLButtonElement;
              if (btn) {
                const originalText = btn.textContent;
                btn.textContent = '✓ Force Updated!';
                setTimeout(() => {
                  btn.textContent = originalText;
                }, 1000);
              }
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded"
        >
          FORCE UI UPDATE (90%+)
        </button>
      </div>
    </div>
  );
} 