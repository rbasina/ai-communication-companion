import React from 'react';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  error?: any;
}

interface TestRunnerProps {
  isRunning: boolean;
  result: TestResult | null;
  onRunTest: () => void;
}

const TestRunner: React.FC<TestRunnerProps> = ({ isRunning, result, onRunTest }) => {
  return (
    <div className="bg-gray-100 rounded-lg shadow-md p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Video Chat Test Runner</h3>
        <button
          onClick={onRunTest}
          disabled={isRunning}
          className={`px-4 py-2 rounded transition-colors ${
            isRunning
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {isRunning ? 'Running Tests...' : 'Run Tests'}
        </button>
      </div>

      {result && (
        <div className={`rounded-lg p-4 ${
          result.success ? 'bg-green-50' : 'bg-red-50'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-1 ${
              result.success ? 'text-green-600' : 'text-red-600'
            }`}>
              {result.success ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <p className={`font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.message}
              </p>
              
              {result.success && result.details && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(result.details)
                      .filter(([key]) => typeof result.details[key] === 'boolean')
                      .map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 bg-white p-2 rounded shadow-sm">
                          <div className={`w-2 h-2 rounded-full ${
                            value ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <span className="text-sm text-gray-700">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                        </div>
                      ))}
                  </div>
                  
                  {result.details.videoFrameAnalysis && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        Video Frame Analysis
                      </h4>
                      <pre className="text-xs bg-white p-3 rounded shadow-sm overflow-auto max-h-32 text-gray-700">
                        {JSON.stringify(result.details.videoFrameAnalysis, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {result.details.integratedAnalysis && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        Integrated Analysis
                      </h4>
                      <pre className="text-xs bg-white p-3 rounded shadow-sm overflow-auto max-h-32 text-gray-700">
                        {JSON.stringify(result.details.integratedAnalysis, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              {!result.success && result.error && (
                <pre className="mt-3 text-xs text-red-700 bg-red-50 p-3 rounded shadow-sm overflow-auto max-h-32">
                  {result.error instanceof Error 
                    ? result.error.message 
                    : JSON.stringify(result.error, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestRunner; 