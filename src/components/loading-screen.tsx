'use client';

import { useState, useEffect, useRef } from 'react';
import { Target, TrendingUp, BarChart3, Zap, Activity } from 'lucide-react';

interface LoadingScreenProps {
  /** Progress 0-100 indicating how much data has loaded */
  progress: number;
  /** Which loading step we're on */
  step: string;
}

/**
 * Animated full-screen loading component for TradeIQ.
 * Shows a sleek animated logo, progress bar, and loading status.
 * Fades out smoothly when loading completes.
 */
export function LoadingScreen({ progress, step }: LoadingScreenProps) {
  const isComplete = progress >= 100;
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);
  const triggeredRef = useRef(false);

  // When progress reaches 100%, start the fade-out sequence.
  // Using a ref guard to ensure this only fires once.
  useEffect(() => {
    if (isComplete && !triggeredRef.current) {
      triggeredRef.current = true;
      // Small delay so user sees "100%" before fade starts
      const fadeTimer = setTimeout(() => setFadeOut(true), 300);
      const hideTimer = setTimeout(() => setHidden(true), 1100);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isComplete]);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center trading-bg transition-opacity duration-700 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Animated background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="loading-grid" />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="loading-particle"
            style={{
              left: `${15 + i * 15}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i * 0.4}s`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-8 z-10">
        {/* Logo animation */}
        <div className="relative">
          {/* Outer ring pulse */}
          <div className="absolute inset-[-20px] rounded-full loading-ring-pulse" />

          {/* Icon container */}
          <div className="relative w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center loading-logo-glow">
            <Target className="w-10 h-10 text-emerald-400 loading-icon-pulse" />
          </div>

          {/* Orbiting icons */}
          <div className="absolute inset-[-32px] loading-orbit">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400/60 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="absolute inset-[-32px] loading-orbit loading-orbit-delayed">
            <BarChart3 className="w-3.5 h-3.5 text-yellow-400/60 absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
          </div>
          <div className="absolute inset-[-32px] loading-orbit loading-orbit-slow">
            <Zap className="w-3.5 h-3.5 text-blue-400/60 absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Title */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">TradeIQ</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium">
              BETA
            </span>
          </div>
          <p className="text-sm text-gray-500 loading-text-shimmer">
            Semi-Automatic AI Trading Platform
          </p>
        </div>

        {/* Progress section */}
        <div className="w-64 flex flex-col items-center gap-3">
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full loading-progress-bar"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>

          {/* Loading status */}
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-emerald-400 loading-spin-slow" />
            <span className="text-xs text-gray-500">{step}</span>
          </div>
        </div>

        {/* Loading steps indicators */}
        <div className="flex items-center gap-6 mt-2">
          <LoadingStep label="Market Data" active={progress > 0} done={progress >= 30} />
          <LoadingStep label="Providers" active={progress >= 30} done={progress >= 75} />
          <LoadingStep label="Charts" active={progress >= 75} done={progress >= 100} />
        </div>
      </div>
    </div>
  );
}

function LoadingStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full transition-all duration-500 ${
          done
            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
            : active
            ? 'bg-emerald-400/40 loading-pulse-dot'
            : 'bg-white/10'
        }`}
      />
      <span
        className={`text-[9px] font-medium transition-colors duration-500 ${
          done ? 'text-emerald-400' : active ? 'text-gray-400' : 'text-gray-600'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
