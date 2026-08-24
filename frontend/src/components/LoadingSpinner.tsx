import React from 'react';

export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 h-full">
      <div className="w-10 h-10 border-4 border-slate-700 border-t-primary rounded-full animate-spin mb-4"></div>
      <p className="text-slate-400">{message}</p>
    </div>
  );
}
