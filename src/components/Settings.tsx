'use client';

import React, { useState, useEffect } from 'react';
import { LLMService } from '@/services/llmService';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load saved API key when dialog opens
      const llmService = LLMService.getInstance();
      const savedKey = llmService.getApiKey();
      if (savedKey) {
        setApiKey(savedKey);
        validateApiKey(savedKey, false); // Validate silently on load
      }
    } else {
      // Reset state when dialog closes
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [validationTimeout]);

  const validateApiKeyFormat = (key: string): { isValid: boolean; error?: string } => {
    if (!key || typeof key !== 'string' || !key.trim()) {
      return { isValid: false, error: 'API key is required' };
    }

    const trimmedKey = key.trim();
    if (!trimmedKey.startsWith('sk-')) {
      return { isValid: false, error: 'API key must start with "sk-"' };
    }

    if (trimmedKey.length < 51) {
      return { 
        isValid: false, 
        error: `API key must be at least 51 characters long (current length: ${trimmedKey.length})`
      };
    }

    if (!/^sk-[A-Za-z0-9_-]{48,}$/.test(trimmedKey)) {
      const invalidChars = trimmedKey.replace(/[A-Za-z0-9_-]/g, '').replace('sk-', '');
      if (invalidChars.length > 0) {
        return { 
          isValid: false, 
          error: `API key contains invalid characters: "${invalidChars}". Only letters, numbers, hyphens, and underscores are allowed.`
        };
      }
      return { 
        isValid: false, 
        error: 'API key must contain only letters, numbers, hyphens, and underscores after "sk-"'
      };
    }

    return { isValid: true };
  };

  const validateApiKey = async (key: string, showFeedback = true) => {
    if (!key.trim()) {
      if (showFeedback) {
        setError('API key is required');
      }
      return false;
    }

    // Validate format first
    const formatValidation = validateApiKeyFormat(key);
    if (!formatValidation.isValid) {
      if (showFeedback) {
        setError(formatValidation.error || 'Invalid API key format');
      }
      return false;
    }
    
    if (showFeedback) {
      setIsValidating(true);
      setError(null);
      setSuccess(null);
    }

    try {
      const llmService = LLMService.getInstance();
      await llmService.validateApiKey(key);
      
      // Update the service with the validated key
      llmService.updateApiKey(key);
      
      if (showFeedback) {
        setSuccess('API key validated and saved successfully!');
      }
      return true;
    } catch (error) {
      if (showFeedback) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to validate API key';
        setError(errorMessage);
      }
      return false;
    } finally {
      if (showFeedback) {
        setIsValidating(false);
      }
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setIsValidating(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate and save the API key
      const isValid = await validateApiKey(apiKey, true);
      
      if (isValid) {
        // Close dialog after a short delay
        const timeout = setTimeout(() => {
          onClose();
          setSuccess(null);
          // Reload the page to reinitialize services
          window.location.reload();
        }, 1500);
        setValidationTimeout(timeout);
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save API key';
      setError(errorMessage);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isOpen ? '' : 'hidden'}`}>
      <div className="bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
            disabled={isValidating}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            OpenAI API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              className={`w-full p-2 pr-10 rounded bg-gray-700 text-white border ${
                error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                     : 'border-gray-600 focus:ring-blue-500 focus:border-blue-500'
              }`}
              value={apiKey}
              onChange={(e) => {
                const newKey = e.target.value;
                setApiKey(newKey);
                setError(null);
                setSuccess(null);
                
                // Show immediate validation feedback
                if (newKey) {
                  const validation = validateApiKeyFormat(newKey);
                  if (!validation.isValid) {
                    setError(validation.error || 'Invalid API key format');
                  }
                }
              }}
              placeholder="sk-..."
              disabled={isValidating}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-300"
            >
              {showApiKey ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Your API key is stored locally and never sent to our servers.
          </p>
          {error && (
            <p className="text-sm text-red-400 mt-1">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-400 mt-1">{success}</p>
          )}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600"
            disabled={isValidating}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
              isValidating
                ? 'bg-blue-500/50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            disabled={isValidating}
          >
            {isValidating ? 'Validating...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings; 