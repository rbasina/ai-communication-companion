'use client';

import React, { useEffect, useState } from 'react';
import { EmotionalState } from '@/types/emotions';

interface EmotionAnalysisVisualizerProps {
  activeModalities: {
    text?: { emotionalState: EmotionalState; confidence: number; weight: number };
    audio?: { emotionalState: EmotionalState; confidence: number; weight: number };
    video?: { emotionalState: EmotionalState; confidence: number; weight: number };
  };
  integratedState: EmotionalState;
  overallConfidence: number;
}

const EmotionAnalysisVisualizer: React.FC<EmotionAnalysisVisualizerProps> = ({
  activeModalities,
  integratedState,
  overallConfidence
}) => {
  const [animatedState, setAnimatedState] = useState(integratedState);

  // Smooth animation for state changes
  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      setAnimatedState(prev => ({
        stress: prev.stress + (integratedState.stress - prev.stress) * 0.2,
        clarity: prev.clarity + (integratedState.clarity - prev.clarity) * 0.2,
        engagement: prev.engagement + (integratedState.engagement - prev.engagement) * 0.2
      }));
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [integratedState]);

  const metrics = [
    { key: 'stress', label: 'Stress Level', color: 'from-red-500 to-orange-500', bgColor: 'bg-red-900/20' },
    { key: 'clarity', label: 'Clarity', color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-900/20' },
    { key: 'engagement', label: 'Engagement', color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-900/20' }
  ];

  const getConfidenceColor = (confidence: number) => {
    if (isNaN(confidence)) return 'text-red-400';
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (isNaN(confidence)) return 'Invalid';
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Moderate';
    return 'Low';
  };

  const getModalityColor = (modality: string) => {
    switch (modality) {
      case 'text': return 'bg-blue-500/20 text-blue-400';
      case 'audio': return 'bg-green-500/20 text-green-400';
      case 'video': return 'bg-purple-500/20 text-purple-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  // Helper function to format confidence percentage
  const formatConfidence = (confidence: number) => {
    if (isNaN(confidence)) return '0';
    return Math.round(confidence * 100).toString();
  };

  // Helper function to check if a modality is active
  const isModalityActive = (data?: { emotionalState: EmotionalState; confidence: number; weight: number }) => {
    if (!data) return false;
    const { emotionalState } = data;
    return emotionalState.stress !== 50 || emotionalState.clarity !== 50 || emotionalState.engagement !== 50;
  };

  return (
    <div className="space-y-8 p-4 bg-gray-800/50 rounded-xl backdrop-blur-sm">
      {/* Overall Confidence */}
      <div className="text-center bg-gray-700/50 rounded-lg p-4 backdrop-blur-sm">
        <div className="text-sm font-medium text-gray-300 mb-2">Analysis Confidence</div>
        <div className={`text-3xl font-bold ${getConfidenceColor(overallConfidence)} flex items-center justify-center gap-2`}>
          <span>{formatConfidence(overallConfidence)}%</span>
          <span className="text-sm font-medium opacity-80">
            ({getConfidenceLabel(overallConfidence)})
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-6">
        {metrics.map(({ key, label, color, bgColor }) => (
          <div key={key} className={`p-4 rounded-lg ${bgColor} backdrop-blur-sm transition-all duration-300`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="text-sm font-bold text-white/90">
                {Math.round(animatedState[key as keyof EmotionalState])}%
              </span>
            </div>
            <div className="h-3 bg-gray-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${color} transition-all duration-500 shadow-lg`}
                style={{ width: `${animatedState[key as keyof EmotionalState]}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Active Modalities */}
      <div className="space-y-4">
        <div className="text-sm font-medium text-white">Active Modalities</div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(activeModalities).map(([modality, data]) => (
            <div
              key={modality}
              className={`${getModalityColor(modality)} rounded-lg p-3 text-center backdrop-blur-sm transition-all duration-300 ${
                isModalityActive(data) ? 'opacity-100' : 'opacity-50'
              }`}
            >
              <div className="text-xs font-medium mb-2 capitalize">{modality}</div>
              <div className={`text-lg font-bold ${getConfidenceColor(data?.confidence || 0)}`}>
                {formatConfidence(data?.confidence || 0)}%
              </div>
              <div className="text-xs mt-1">
                {getConfidenceLabel(data?.confidence || 0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmotionAnalysisVisualizer; 