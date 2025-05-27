import { EmotionalState } from '@/types/emotions';

// Debug configuration
export const DEBUG = process.env.NODE_ENV === 'development';
export const PERFORMANCE_MONITORING = process.env.NODE_ENV === 'development';

// Debug logger type
type LogFunction = (message: string, data?: any) => void;

interface DebugLoggers {
  audio: LogFunction;
  video: LogFunction;
  text: LogFunction;
  emotion: LogFunction;
  performance: LogFunction;
  validation: LogFunction;
}

// Private helper function
function logWithNamespace(namespace: string, message: string, data?: any): void {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${namespace}] ${message}`, data || '');
}

// Namespaced debug logger
export const debugLog: DebugLoggers = {
  audio: (message: string, data?: any) => logWithNamespace('audio', message, data),
  video: (message: string, data?: any) => logWithNamespace('video', message, data),
  text: (message: string, data?: any) => logWithNamespace('text', message, data),
  emotion: (message: string, data?: any) => logWithNamespace('emotion', message, data),
  performance: (message: string, data?: any) => logWithNamespace('performance', message, data),
  validation: (message: string, data?: any) => logWithNamespace('validation', message, data)
};

// Performance monitoring
export const measurePerformance = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  if (!PERFORMANCE_MONITORING) return fn();
  
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    debugLog.performance(`${name}: ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    debugLog.performance(`Error in ${name}:`, error);
    throw error;
  }
};

// Validation utilities
export const validateEmotionalState = (state: any): state is EmotionalState => {
  if (!state || typeof state !== 'object') return false;

  const hasRequiredProperties = 
    'stress' in state &&
    'clarity' in state &&
    'engagement' in state;

  if (!hasRequiredProperties) return false;

  const valuesAreValid = Object.values(state).every(value => 
    typeof value === 'number' &&
    !isNaN(value) &&
    isFinite(value) &&
    value >= 0 &&
    value <= 100
  );

  return valuesAreValid;
}; 