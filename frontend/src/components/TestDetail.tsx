import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTest } from '../services/api';
import { TestResult } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { formatNumber, formatDuration, formatPercent, formatLatency, formatBytes, formatTimestamp } from '../utils/format';
import { ArrowLeft, ExternalLink, Activity, Clock, CheckCircle, XCircle } from 'lucide-react';
import RpsChart from './RpsChart';
import LatencyChart from './LatencyChart';
import StatusCodeChart from './StatusCodeChart';

export default function TestDetail() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (testId) fetchTestDetails(testId);
  }, [testId]);

  const fetchTestDetails = async (id: string) => {
    try {
      setLoading(true);
      const data = await getTest(id);
      setTest(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load test details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading test details..." />;
  if (error || !test) {
    return (
      <div className="p-8">
        <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-lg">
          {error || 'Test not found'}
        </div>
        <Link to="/history" className="text-primary hover:underline mt-4 inline-block">Back to History</Link>
      </div>
    );
  }

  const { config, latency } = test;
  // Fallback to fake metrics snapshot for status chart if timeline isn't complete
  const snapshotFallback = { statusCodes: test.statusCodes } as any;

  return (
    <div className="p-6">
      <Link to="/history" className="inline-flex items-center text-slate-400 hover:text-white mb-6 transition-colors text-sm font-medium">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to History
      </Link>

      <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-white">Test Report</h1>
              <span className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase ${
                test.status === 'completed' ? 'bg-success/20 text-success border border-success/30' : 
                test.status === 'failed' ? 'bg-danger/20 text-danger border border-danger/30' : 
                'bg-slate-700 text-slate-300'
              }`}>
                {test.status}
              </span>
            </div>
            <p className="text-slate-400 font-mono text-sm mb-4">ID: {test.testId}</p>
            <div className="flex items-center space-x-2 text-slate-300">
              <span className="font-bold text-white bg-slate-800 px-2 py-1 rounded">{config.method}</span>
              <span className="text-lg">{config.targetUrl}</span>
              <a href={config.targetUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-primary">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
          <div className="text-right text-sm text-slate-400">
            <p>Started: {formatTimestamp(test.startTimeMs)}</p>
            <p>Duration: {formatDuration(test.actualDurationSeconds * 1000)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface p-5 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm font-medium mb-1">Total Requests</p>
          <p className="text-3xl font-bold text-white">{formatNumber(test.totalRequests)}</p>
          <div className="flex items-center mt-2 text-xs">
            <span className="text-success flex items-center mr-3"><CheckCircle className="w-3 h-3 mr-1"/> {formatNumber(test.successfulRequests)}</span>
            <span className="text-danger flex items-center"><XCircle className="w-3 h-3 mr-1"/> {formatNumber(test.failedRequests)}</span>
          </div>
        </div>
        
        <div className="bg-surface p-5 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm font-medium mb-1">Mean RPS</p>
          <p className="text-3xl font-bold text-white">{formatNumber(Math.round(test.meanRps))}</p>
          <p className="text-xs text-slate-400 mt-2">Peak: {formatNumber(Math.round(test.peakRps))}</p>
        </div>

        <div className="bg-surface p-5 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm font-medium mb-1">Error Rate</p>
          <p className={`text-3xl font-bold ${test.errorRate > 0 ? 'text-danger' : 'text-success'}`}>
            {formatPercent(test.errorRate)}
          </p>
          <p className="text-xs text-slate-400 mt-2">Target &lt; 1%</p>
        </div>

        <div className="bg-surface p-5 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm font-medium mb-1">Data Transfer</p>
          <p className="text-3xl font-bold text-white">{formatBytes(test.totalBytesReceived)}</p>
          <p className="text-xs text-slate-400 mt-2">Sent: {formatBytes(test.totalBytesSent)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {test.timeline && test.timeline.length > 0 && (
          <>
            <RpsChart data={test.timeline} targetRps={config.requestsPerSecond} />
            <LatencyChart data={test.timeline} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-surface p-6 rounded-xl border border-slate-700">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center"><Clock className="w-5 h-5 mr-2 text-primary"/> Latency Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">Min</p>
              <p className="text-lg font-semibold text-white">{formatLatency(latency?.minMs || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">Mean</p>
              <p className="text-lg font-semibold text-white">{formatLatency(latency?.meanMs || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">P50 (Median)</p>
              <p className="text-lg font-semibold text-success">{formatLatency(latency?.p50Ms || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">P90</p>
              <p className="text-lg font-semibold text-white">{formatLatency(latency?.p90Ms || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">P95</p>
              <p className="text-lg font-semibold text-warning">{formatLatency(latency?.p95Ms || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">P99</p>
              <p className="text-lg font-semibold text-danger">{formatLatency(latency?.p99Ms || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">P99.9</p>
              <p className="text-lg font-semibold text-danger">{formatLatency(latency?.p999Ms || 0)}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">Max</p>
              <p className="text-lg font-semibold text-white">{formatLatency(latency?.maxMs || 0)}</p>
            </div>
          </div>
        </div>

        <div>
          <StatusCodeChart metrics={snapshotFallback} />
        </div>
      </div>

      <div className="bg-surface p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-4">Configuration Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-8 text-sm">
          <div>
            <span className="text-slate-400 block mb-1">Target RPS</span>
            <span className="text-white font-medium">{config.requestsPerSecond === 0 ? 'Unlimited' : config.requestsPerSecond}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Concurrency</span>
            <span className="text-white font-medium">{config.concurrency} users</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Configured Duration</span>
            <span className="text-white font-medium">{config.durationSeconds}s</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Timeout</span>
            <span className="text-white font-medium">{config.timeoutMs}ms</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Keep-Alive</span>
            <span className="text-white font-medium">{config.keepAlive ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="col-span-3">
            <span className="text-slate-400 block mb-1">Headers</span>
            <span className="text-white font-mono text-xs">{JSON.stringify(config.headers)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
