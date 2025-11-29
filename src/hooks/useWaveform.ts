import { useEffect, useRef, useCallback } from 'react';
import { AudioUtils } from '@/utils/audioUtils';

interface UseWaveformProps {
  audioBuffer: AudioBuffer | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  color?: string;
  zoom?: number;
}

export const useWaveform = ({ audioBuffer, canvasRef, color = '#8286ef', zoom = 1 }: UseWaveformProps) => {
  const animationFrameRef = useRef<number>();

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !audioBuffer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement?.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const height = canvas.parentElement?.clientHeight || 192;

    // Set canvas size based on zoom - higher resolution for crisp rendering
    const width = Math.floor(containerWidth * zoom);
    canvas.width = width;
    canvas.height = height;

    // Set CSS size to match container
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Generate waveform data with more samples for zoomed view
    const samples = Math.min(width, audioBuffer.length);
    const waveformData = AudioUtils.generateWaveformData(audioBuffer, samples);

    // Clear canvas
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform with anti-aliasing
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Enable smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.beginPath();
    const middle = height / 2;
    
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * width;
      const y = middle - (waveformData[i] * middle * 0.75);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw mirror
    ctx.beginPath();
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * width;
      const y = middle + (waveformData[i] * middle * 0.75);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }, [audioBuffer, canvasRef, color, zoom]);

  useEffect(() => {
    drawWaveform();

    const handleResize = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(drawWaveform);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawWaveform]);

  return { redraw: drawWaveform };
};