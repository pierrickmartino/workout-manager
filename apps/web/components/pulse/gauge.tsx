import * as React from "react";

interface GaugeProps {
  // 0–100 completion percentage.
  value: number;
  size?: number;
  // Big number shown in the middle; defaults to the rounded value.
  display?: React.ReactNode;
  // Small mono caption under the number, e.g. "READY %".
  caption?: string;
}

// The circular progress ring from the Home hero and Profile avatar: an elevated
// track with a cyan arc drawn on top via SVG stroke-dashoffset.
export function Gauge({
  value,
  size = 78,
  display,
  caption,
}: GaugeProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = Math.max(4, Math.round(size * 0.08));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-elevated)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold text-text-primary">
          {display ?? Math.round(clamped)}
        </span>
        {caption ? (
          <span className="label-mono text-[7px] text-text-muted">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
