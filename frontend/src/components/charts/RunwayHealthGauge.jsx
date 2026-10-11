import React from 'react';

export default function RunwayHealthGauge({ score = 75, status = 'Healthy', runwayDays = 65, runwayMonths = 2.2 }) {
  let strokeColor = '#059669'; // emerald
  let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';

  if (score < 55) {
    strokeColor = '#e11d48'; // rose
    badgeBg = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (score < 75) {
    strokeColor = '#d97706'; // amber
    badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  const radius = 55;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-36 h-20 flex items-end justify-center">
        <svg className="w-36 h-20 overflow-visible" viewBox="0 0 130 65">
          <path
            d="M 10 65 A 55 55 0 0 1 120 65"
            fill="none"
            stroke="#ede8e1"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 10 65 A 55 55 0 0 1 120 65"
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
        </svg>

        <div className="absolute top-6 flex flex-col items-center">
          <span className="text-2xl font-black text-stone-900 tracking-tight font-mono">{score}</span>
          <span className="text-[9px] font-bold tracking-wider uppercase text-stone-600">Health Index</span>
        </div>
      </div>

      <div className="mt-2 flex flex-col items-center">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badgeBg}`}>
          {status}
        </span>
        <div className="mt-1 text-[11px] text-stone-600">
          <strong className="text-stone-900 font-bold">{runwayDays} Days</strong> ({runwayMonths}m) runway
        </div>
      </div>
    </div>
  );
}
