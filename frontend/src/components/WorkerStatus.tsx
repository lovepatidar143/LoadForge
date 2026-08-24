import React, { useEffect, useState } from 'react';
import { listWorkers, registerWorker, removeWorker } from '../services/api';
import { WorkerInfo } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { Server, Cpu, MemoryStick, Trash2, Plus, Clock, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { formatTimestamp, truncateId } from '../utils/format';

export default function WorkerStatus() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [newAddress, setNewAddress] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchWorkers = async () => {
    try {
      const data = await listWorkers();
      setWorkers(data || []);
      setError(null);
    } catch (err: any) {
      console.error(err);
      // Don't overwrite general UI with error after initial load if just a poll fails
      if (workers.length === 0) setError('Failed to load workers');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddress) return;
    setRegistering(true);
    try {
      await registerWorker(newAddress);
      setNewAddress('');
      await fetchWorkers();
    } catch (err: any) {
      alert(err.message || 'Failed to register worker');
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = async (workerId: string) => {
    if (!confirm('Are you sure you want to remove this worker?')) return;
    try {
      await removeWorker(workerId);
      await fetchWorkers();
    } catch (err: any) {
      alert(err.message || 'Failed to remove worker');
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'idle': return <CheckCircle2 className="w-5 h-5 text-success" />;
      case 'running': return <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>;
      case 'error': return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'offline': return <XCircle className="w-5 h-5 text-danger" />;
      default: return <Server className="w-5 h-5 text-slate-500" />;
    }
  };

  if (loading && workers.length === 0) return <LoadingSpinner message="Loading workers..." />;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Worker Nodes</h1>
          <p className="text-slate-400">Manage distributed load generation nodes.</p>
        </div>
        
        <form onSubmit={handleRegister} className="flex gap-2">
          <input 
            type="text" 
            placeholder="http://worker-address:3002"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary w-64"
          />
          <button 
            type="submit"
            disabled={registering || !newAddress}
            className="flex items-center space-x-1 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-6 bg-danger/10 border border-danger/30 text-danger p-4 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {workers.map(worker => (
          <div key={worker.workerId} className="bg-surface rounded-xl border border-slate-700 p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
              <div 
                className={`h-full ${
                  worker.status === 'running' ? 'bg-primary' :
                  worker.status === 'idle' ? 'bg-success' :
                  worker.status === 'error' ? 'bg-warning' : 'bg-danger'
                }`}
                style={{ width: '100%' }}
              ></div>
            </div>

            <div className="flex justify-between items-start mb-4 mt-2">
              <div className="flex items-center space-x-3">
                {getStatusIcon(worker.status)}
                <div>
                  <h3 className="text-white font-medium">{truncateId(worker.workerId)}</h3>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">{worker.status}</p>
                </div>
              </div>
              <button 
                onClick={() => handleRemove(worker.workerId)}
                className="text-slate-500 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                title="Remove Worker"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-slate-300 mb-4 bg-slate-800/50 p-2 rounded truncate" title={worker.address}>
              {worker.address}
            </div>

            <div className="space-y-3 mt-auto">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 flex items-center"><Cpu className="w-3 h-3 mr-1"/> CPU</span>
                  <span className="text-white">{worker.cpuPercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div 
                    className="bg-primary rounded-full h-1.5" 
                    style={{ width: `${Math.min(worker.cpuPercent, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 flex items-center"><MemoryStick className="w-3 h-3 mr-1"/> Memory</span>
                  <span className="text-white">{worker.memoryMb.toFixed(0)} MB</span>
                </div>
              </div>

              <div className="pt-2 mt-2 border-t border-slate-700/50 flex justify-between text-xs text-slate-500">
                <span className="flex items-center"><Clock className="w-3 h-3 mr-1"/> Last seen</span>
                <span>{formatTimestamp(worker.lastHeartbeatMs).split(' ')[1]}</span>
              </div>
            </div>
          </div>
        ))}
        
        {workers.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-700 rounded-xl">
            <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-1">No workers registered</p>
            <p className="text-sm text-slate-500">Add a worker URL above to connect a node.</p>
          </div>
        )}
      </div>
    </div>
  );
}
