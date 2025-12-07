// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { AudioUtils } from '@/utils/audioUtils';

interface WaveformTrackProps {
  audioBuffer: AudioBuffer;
  color?: string;
  height?: number;
}

// Cache for waveform data
const waveformCache = new WeakMap<AudioBuffer, Float32Array>();

// Maximum samples for performance
const MAX_SAMPLES = 600;

const WaveformTrackComponent = ({ audioBuffer, color = '#8286ef', height = 60 }: WaveformTrackProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const lastWidthRef = useRef<number>(0);

  // Memoize waveform data with caching
  const waveformData = useMemo(() => {
    if (!audioBuffer) return null;
    
    // Check cache first
    let cachedData = waveformCache.get(audioBuffer);
    if (!cachedData) {
      cachedData = AudioUtils.generateWaveformData(audioBuffer, MAX_SAMPLES);
      waveformCache.set(audioBuffer, cachedData);
    }
    
    return cachedData;
  }, [audioBuffer]);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !audioBuffer || !waveformData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const container = canvas.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    
    // Skip if width hasn't changed significantly
    if (Math.abs(width - lastWidthRef.current) < 5) return;
    lastWidthRef.current = width;

    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    // Calculate sample step for rendering
    const samplesToRender = Math.min(waveformData.length, width);
    const sampleStep = waveformData.length / samplesToRender;

    // Draw waveform - optimized
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.imageSmoothingEnabled = false;

    const middle = height / 2;
    const amplitude = middle * 0.7;

    // Draw top waveform
    ctx.beginPath();
    for (let i = 0; i < samplesToRender; i++) {
      const dataIndex = Math.floor(i * sampleStep);
      const x = (i / samplesToRender) * width;
      const y = middle - (waveformData[dataIndex] * amplitude);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw mirror
    ctx.beginPath();
    for (let i = 0; i < samplesToRender; i++) {
      const dataIndex = Math.floor(i * sampleStep);
      const x = (i / samplesToRender) * width;
      const y = middle + (waveformData[dataIndex] * amplitude);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [audioBuffer, color, height, waveformData]);

  useEffect(() => {
    // Initial draw with requestAnimationFrame
    animationFrameRef.current = requestAnimationFrame(drawWaveform);

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        lastWidthRef.current = 0; // Reset to force redraw
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(drawWaveform);
      }, 150);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawWaveform]);

  return (
    <div className="w-full rounded-lg overflow-hidden bg-neutral-950" style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const WaveformTrack = memo(WaveformTrackComponent, (prevProps, nextProps) => {
  return (
    prevProps.audioBuffer === nextProps.audioBuffer &&
    prevProps.color === nextProps.color &&
    prevProps.height === nextProps.height
  );
});