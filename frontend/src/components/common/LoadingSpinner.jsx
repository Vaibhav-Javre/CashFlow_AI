import React from 'react';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-fast">
      <div className="w-8 h-8 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-3" />
      <p className="text-xs font-semibold text-stone-500">{message}</p>
    </div>
  );
}
