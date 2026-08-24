import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, PlusSquare, History, Server, Zap } from 'lucide-react';
import { useMetrics } from '../hooks/useMetrics';

export default function Sidebar() {
  const { connected, isRunning } = useMetrics();

  return (
    <aside className="w-64 bg-surface border-r border-slate-700 flex flex-col">
      <div className="p-4 flex items-center space-x-3 border-b border-slate-700">
        <Zap className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">LoadForge</h1>
          <div className="flex items-center text-xs mt-1">
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? 'bg-success' : 'bg-danger'}`}></span>
            <span className="text-slate-400">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <Activity className="w-5 h-5" />
          <span>Dashboard</span>
          {isRunning && (
            <span className="ml-auto flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
          )}
        </NavLink>
        
        <NavLink
          to="/new-test"
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <PlusSquare className="w-5 h-5" />
          <span>New Test</span>
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <History className="w-5 h-5" />
          <span>History</span>
        </NavLink>

        <NavLink
          to="/workers"
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <Server className="w-5 h-5" />
          <span>Workers</span>
        </NavLink>
      </nav>
    </aside>
  );
}
