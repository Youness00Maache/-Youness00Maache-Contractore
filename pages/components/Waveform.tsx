import React from 'react';

/** A static voice waveform (decorative), used for dictation hints on the landing page. */
const WAVE = [5, 9, 14, 8, 17, 11, 6, 13, 18, 10, 7, 15, 9, 5, 12, 8, 4];

export const Waveform: React.FC<{ className?: string; barClassName?: string; bars?: number; scale?: number }> = ({
  className = '',
  barClassName = 'bg-current',
  bars = WAVE.length,
  scale = 1,
}) => (
  <span aria-hidden="true" className={`flex items-center gap-[2px] ${className}`}>
    {WAVE.slice(0, bars).map((h, i) => (
      <span key={i} className={`w-[2.5px] flex-none rounded-full ${barClassName}`} style={{ height: `${Math.max(2, Math.round(h * scale))}px` }} />
    ))}
  </span>
);
