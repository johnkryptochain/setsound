import { useEffect, useRef } from 'react';
import { AudioUtils } from '@/utils/audioUtils';

interface WaveformTrackProps {
  audioBuffer: AudioBuffer;
  color?: string;
  height?: number;
}

export const WaveformTrack = ({ audioBuffer, color = '#8286ef', height = 60 }: WaveformTrackProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !audioBuffer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    canvas.width = width;
    canvas.height = height;

    // Generate waveform data
    const waveformData = AudioUtils.generateWaveformData(audioBuffer, width);

    // Clear canvas
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const middle = height / 2;
    for (let i = 0; i < width; i++) {
      const x = i;
      const y = middle - (waveformData[i] * middle * 0.7);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw mirror
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      const x = i;
      const y = middle + (waveformData[i] * middle * 0.7);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }, [audioBuffer, color, height]);

  return (
    <div className="w-full rounded-lg overflow-hidden bg-neutral-950" style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};