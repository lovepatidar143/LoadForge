import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTest } from '../services/api';
import { TestConfig } from '../types';
import { Play, Plus, Trash2, AlertCircle } from 'lucide-react';

export default function TestForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<Partial<TestConfig>>({
    targetUrl: 'http://localhost:3000',
    method: 'GET',
    requestsPerSecond: 100,
    concurrency: 10,
    durationSeconds: 30,
    rampUpSeconds: 5,
    rampDownSeconds: 0,
    timeoutMs: 5000,
    keepAlive: true,
    maxConnections: 100,
    body: ''
  });

  const [headers, setHeaders] = useState<{key: string, value: string}[]>([
    { key: 'Accept', value: '*/*' }
  ]);

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
  
  const removeHeader = (index: number) => {
    const newHeaders = [...headers];
    newHeaders.splice(index, 1);
    setHeaders(newHeaders);
  };

  const updateHeader = (index: number, field: 'key'|'value', val: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = val;
    setHeaders(newHeaders);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.targetUrl) return;

    const headersObj: Record<string, string> = {};
    headers.forEach(h => {
      if (h.key && h.key.trim() !== '') headersObj[h.key] = h.value;
    });

    setLoading(true);
    setError(null);

    try {
      await createTest({ ...config, headers: headersObj });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to start test');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isNumber = type === 'number';
    const isCheckbox = type === 'checkbox';
    
    setConfig(prev => ({
      ...prev,
      [name]: isCheckbox ? (e.target as HTMLInputElement).checked : (isNumber ? Number(value) : value)
    }));
  };

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(config.method || 'GET');

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Configure Load Test</h1>
        <p className="text-slate-400">Set up the parameters for your next performance test.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-danger/10 border border-danger/30 rounded-lg flex items-center space-x-3 text-danger">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-sm">
          <h2 className="text-lg font-medium text-white mb-4">Target</h2>
          
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="w-full md:w-32 shrink-0">
              <label className="block text-sm font-medium text-slate-400 mb-1">Method</label>
              <select 
                name="method" 
                value={config.method} 
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>DELETE</option>
                <option>PATCH</option>
              </select>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-400 mb-1">URL <span className="text-danger">*</span></label>
              <input 
                type="url" 
                name="targetUrl" 
                value={config.targetUrl} 
                onChange={handleChange}
                required
                placeholder="https://api.example.com/v1/users"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-400">Headers</label>
              <button 
                type="button" 
                onClick={addHeader}
                className="text-xs text-primary hover:text-primary/80 flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Header</span>
              </button>
            </div>
            
            <div className="space-y-2">
              {headers.map((header, idx) => (
                <div key={idx} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Key (e.g. Authorization)" 
                    value={header.key}
                    onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                  />
                  <input 
                    type="text" 
                    placeholder="Value" 
                    value={header.value}
                    onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                    className="flex-[2] bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                  />
                  <button 
                    type="button" 
                    onClick={() => removeHeader(idx)}
                    className="p-2 text-slate-500 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {hasBody && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Request Body</label>
              <textarea 
                name="body" 
                value={config.body} 
                onChange={handleChange}
                rows={4}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-primary"
                placeholder='{"key": "value"}'
              />
            </div>
          )}
        </div>

        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-sm">
          <h2 className="text-lg font-medium text-white mb-4">Load Profile</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Requests Per Second</label>
              <input 
                type="number" 
                name="requestsPerSecond" 
                value={config.requestsPerSecond} 
                onChange={handleChange}
                min="0"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-slate-500 mt-1">0 for unlimited (stress test)</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Concurrency</label>
              <input 
                type="number" 
                name="concurrency" 
                value={config.concurrency} 
                onChange={handleChange}
                min="1"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-slate-500 mt-1">Number of parallel users</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Duration (seconds)</label>
              <input 
                type="number" 
                name="durationSeconds" 
                value={config.durationSeconds} 
                onChange={handleChange}
                min="1"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Ramp Up (seconds)</label>
              <input 
                type="number" 
                name="rampUpSeconds" 
                value={config.rampUpSeconds} 
                onChange={handleChange}
                min="0"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-sm">
          <h2 className="text-lg font-medium text-white mb-4">Advanced</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Timeout (ms)</label>
              <input 
                type="number" 
                name="timeoutMs" 
                value={config.timeoutMs} 
                onChange={handleChange}
                min="100"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Max Connections</label>
              <input 
                type="number" 
                name="maxConnections" 
                value={config.maxConnections} 
                onChange={handleChange}
                min="1"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col justify-center pt-5">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="keepAlive"
                  checked={config.keepAlive}
                  onChange={handleChange}
                  className="w-5 h-5 bg-slate-800 border border-slate-600 rounded focus:ring-primary focus:ring-offset-slate-900 text-primary"
                />
                <span className="text-sm font-medium text-slate-300">HTTP Keep-Alive</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={loading}
            className="flex items-center space-x-2 bg-success hover:bg-success/90 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-success/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Play className="w-5 h-5 fill-current" />
            )}
            <span>{loading ? 'Starting...' : 'Start Test'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
