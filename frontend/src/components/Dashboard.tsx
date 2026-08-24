import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, ExternalLink } from 'lucide-react';
import { useMetrics } from '../hooks/useMetrics';
import MetricsPanel from './MetricsPanel';
import RpsChart from './RpsChart';
import LatencyChart from './LatencyChart';
import ErrorChart from './ErrorChart';
import StatusCodeChart from './StatusCodeChart';
import ConnectionsChart from './ConnectionsChart';
import { stopTest } from '../services/api';
import { truncateId } from '../utils/format';

export default function Dashboard() {
  const { currentMetrics, metricsHistory, activeTest, isRunning } = useMetrics();
  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    if (!activeTest?.testId) return;
    setStopping(true);
    try {
      await stopTest(activeTest.testId);
    } catch (e) {
      console.error('Failed to stop test', e);
    } finally {
      setStopping(false);
    }
  };

  if (!isRunning && !activeTest) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center">
        <div className="bg-surface border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-lg">
          <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <Play className="w-8 h-8 ml-1" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Active Test</h2>
          <p className="text-slate-400 mb-8">Ready to generate some traffic? Configure and start a new load test.</p>
          <Link 
            to="/new-test" 
            className="inline-flex items-center justify-center space-x-2 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-medium transition-colors w-full"
          >
            <Play className="w-4 h-4" />
            <span>Create New Test</span>
          </Link>
        </div>
      </div>
    );
  }

  const lastSnapshot = currentMetrics || (metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1] : null);

  return (
    <div className="p-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 bg-surface p-4 rounded-xl border border-slate-700 shadow-sm">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h2 className="text-xl font-bold text-white">
              Test {activeTest ? truncateId(activeTest.testId) : 'Running'}
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isRunning ? 'bg-primary/20 text-primary border border-primary/30 animate-pulse' : 
              activeTest?.status === 'completed' ? 'bg-success/20 text-success border border-success/30' : 
              'bg-danger/20 text-danger border border-danger/30'
            }`}>
              {isRunning ? 'RUNNING' : (activeTest?.status || 'STOPPED').toUpperCase()}
            </span>
          </div>
          <p className="text-slate-400 text-sm flex items-center space-x-2">
            <ExternalLink className="w-3 h-3" />
            <span>{activeTest?.config?.method} {activeTest?.config?.targetUrl}</span>
          </p>
        </div>
        
        <div className="mt-4 md:mt-0 flex space-x-3">
          {isRunning && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="flex items-center space-x-2 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 px-4 py-2 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>{stopping ? 'Stopping...' : 'Stop Test'}</span>
            </button>
          )}
          {!isRunning && (
            <Link
              to="/new-test"
              className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>New Test</span>
            </Link>
          )}
        </div>
      </div>

      <MetricsPanel metrics={lastSnapshot} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <RpsChart data={metricsHistory} targetRps={activeTest?.config?.requestsPerSecond} />
        <LatencyChart data={metricsHistory} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <ErrorChart data={metricsHistory} />
          <ConnectionsChart data={metricsHistory} />
        </div>
        <div>
          <StatusCodeChart metrics={lastSnapshot} />
        </div>
      </div>
    </div>
  );
}
