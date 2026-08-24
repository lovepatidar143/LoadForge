import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { MetricsSnapshot, TestResult } from '../types';

export function useMetrics() {
  const { connected, lastMessage } = useWebSocket('/ws');
  const [currentMetrics, setCurrentMetrics] = useState<MetricsSnapshot | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsSnapshot[]>([]);
  const [activeTest, setActiveTest] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.event === 'test_started') {
      setActiveTest(lastMessage.data);
      setIsRunning(true);
      setMetricsHistory([]);
      setCurrentMetrics(null);
    } else if (lastMessage.event === 'metrics_update') {
      const metrics: MetricsSnapshot = lastMessage.data;
      setCurrentMetrics(metrics);
      setMetricsHistory(prev => {
        const newHistory = [...prev, metrics];
        // Keep last 300 data points (e.g., 5 mins of 1s updates)
        if (newHistory.length > 300) {
          return newHistory.slice(newHistory.length - 300);
        }
        return newHistory;
      });
    } else if (lastMessage.event === 'test_completed' || lastMessage.event === 'test_failed' || lastMessage.event === 'test_cancelled') {
      setActiveTest(lastMessage.data);
      setIsRunning(false);
    }
  }, [lastMessage]);

  const clearMetrics = useCallback(() => {
    setMetricsHistory([]);
    setCurrentMetrics(null);
  }, []);

  return { 
    currentMetrics, 
    metricsHistory, 
    activeTest, 
    isRunning,
    connected,
    clearMetrics 
  };
}
