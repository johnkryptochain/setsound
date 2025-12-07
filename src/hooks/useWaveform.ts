// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioUtils } from '@/utils/audioUtils';

interface UseWaveformProps {
  audioBuffer: AudioBuffer | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  color?: string;
  zoom?: number;
}

// Cache for waveform data to avoid recalculating
const waveformCache = new WeakMap<AudioBuffer, Map<number, Float32Array>>();

// Maximum samples for performance on low-end hardware
const MAX_SAMPLES_LOW_END = 800;
const MAX_SAMPLES_HIGH_END = 2000;

// Detect if we're on low-end hardware (rough heuristic)
const isLowEndDevice = (): boolean => {
  // Check for hardware concurrency (number of logical processors)
  const cores = navigator.hardwareConcurrency || 2;
  // Check for device memory (in GB, if available)
  const memory = (navigator as { deviceMemory?: number }).deviceMemory || 4;
  
  return cores <= 4 || memory <= 4;
};

const maxSamples = isLowEndDevice() ? MAX_SAMPLES_LOW_END : MAX_SAMPLES_HIGH_END;

export const useWaveform = ({ audioBuffer, canvasRef, color = '#8286ef', zoom = 1 }: UseWaveformProps) => {
  const animationFrameRef = useRef<number>();
  const lastDrawParamsRef = useRef<{ width: number; height: number; zoom: number } | null>(null);
  const isDrawingRef = useRef(false);

  // Memoize the waveform data to avoid recalculating on every render
  const waveformData = useMemo(() => {
    if (!audioBuffer) return null;
    
    // Check cache first
    let bufferCache = waveformCache.get(audioBuffer);
    if (!bufferCache) {
      bufferCache = new Map();
      waveformCache.set(audioBuffer, bufferCache);
    }
    
    // Use a fixed sample count for caching (based on max samples)
    const cacheKey = maxSamples;
    let cachedData = bufferCache.get(cacheKey);
    
    if (!cachedData) {
      cachedData = AudioUtils.generateWaveformData(audioBuffer, maxSamples);
      bufferCache.set(cacheKey, cachedData);
    }
    
    return cachedData;
  }, [audioBuffer]);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !audioBuffer || !waveformData || isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const container = canvas.parentElement?.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const height = canvas.parentElement?.clientHeight || 192;

    // Limit canvas width for performance - cap at reasonable size
    const maxCanvasWidth = Math.min(containerWidth * zoom, 4000);
    const width = Math.floor(maxCanvasWidth);
    
    // Skip redraw if parameters haven't changed significantly
    const lastParams = lastDrawParamsRef.current;
    if (lastParams &&
        Math.abs(lastParams.width - width) < 5 &&
        Math.abs(lastParams.height - height) < 5 &&
        lastParams.zoom === zoom) {
      return;
    }

    isDrawingRef.current = true;
    lastDrawParamsRef.current = { width, height, zoom };

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Set CSS size to match container
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Clear canvas with background
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    // Calculate how many samples to actually draw based on canvas width
    const samplesToRender = Math.min(waveformData.length, width);
    const sampleStep = waveformData.length / samplesToRender;

    // Draw waveform - simplified for performance
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    // Disable expensive smoothing on low-end devices
    ctx.imageSmoothingEnabled = false;

    const middle = height / 2;
    const amplitude = middle * 0.75;

    // Draw top waveform using Path2D for better performance
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

    // Draw bottom waveform (mirror)
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

    isDrawingRef.current = false;
  }, [audioBuffer, canvasRef, color, zoom, waveformData]);

  useEffect(() => {
    // Use requestAnimationFrame for initial draw
    animationFrameRef.current = requestAnimationFrame(drawWaveform);

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Reset last params to force redraw
        lastDrawParamsRef.current = null;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(drawWaveform);
      }, 150); // 150ms debounce for resize
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

  // Force redraw when zoom changes
  useEffect(() => {
    lastDrawParamsRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [zoom, drawWaveform]);

  const redraw = useCallback(() => {
    lastDrawParamsRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [drawWaveform]);

  return { redraw };
};