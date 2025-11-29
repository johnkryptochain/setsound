import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioPlayerProps {
  audioBuffer: AudioBuffer | null;
  audioContext: AudioContext | null;
  onTimeUpdate?: (currentTime: number) => void;
}

export const useAudioPlayer = ({ audioBuffer, audioContext, onTimeUpdate }: UseAudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  const duration = audioBuffer?.duration || 0;

  const updateTime = useCallback(() => {
    if (!audioContext) return;

    const elapsed = audioContext.currentTime - startTimeRef.current + pauseTimeRef.current;
    const newTime = Math.min(elapsed, duration);
    
    setCurrentTime(newTime);
    onTimeUpdate?.(newTime);

    if (newTime < duration - 0.01) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
      pauseTimeRef.current = 0;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [audioContext, duration, onTimeUpdate]);

  // Start/stop animation loop based on isPlaying state
  useEffect(() => {
    if (isPlaying && audioContext) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, audioContext, updateTime]);

  const play = useCallback(async (startFrom?: number) => {
    if (!audioBuffer || !audioContext) {
      console.log('Cannot play: missing audioBuffer or audioContext');
      return;
    }

    // Check if context is closed
    if (audioContext.state === 'closed') {
      console.error('AudioContext is closed');
      return;
    }

    const playFrom = startFrom !== undefined ? startFrom : pauseTimeRef.current;

    // Stop any existing playback
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch (e) {
        // Ignore if already stopped
      }
    }

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Create new source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Store references
    sourceRef.current = source;
    gainNodeRef.current = gainNode;

    // Start playback
    try {
      source.start(0, playFrom);
      startTimeRef.current = audioContext.currentTime;
      pauseTimeRef.current = playFrom;

      setIsPlaying(true);

      // Handle end of playback
      source.onended = () => {
        const elapsed = audioContext.currentTime - startTimeRef.current + pauseTimeRef.current;
        if (elapsed >= duration - 0.1) {
          setIsPlaying(false);
          setCurrentTime(0);
          pauseTimeRef.current = 0;
        }
      };
    } catch (error) {
      console.error('Error starting playback:', error);
      setIsPlaying(false);
    }
  }, [audioBuffer, audioContext, volume, duration, updateTime]);

  const pause = useCallback(() => {
    if (sourceRef.current && audioContext) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;

      pauseTimeRef.current = audioContext.currentTime - startTimeRef.current + pauseTimeRef.current;
      setIsPlaying(false);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [audioContext]);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    setIsPlaying(false);
    setCurrentTime(0);
    pauseTimeRef.current = 0;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const seek = useCallback((time: number) => {
    const wasPlaying = isPlaying;
    
    if (wasPlaying) {
      pause();
    }

    pauseTimeRef.current = Math.max(0, Math.min(time, duration));
    setCurrentTime(pauseTimeRef.current);

    if (wasPlaying) {
      play(pauseTimeRef.current);
    }
  }, [isPlaying, duration, pause, play]);

  const changeVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clampedVolume;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    play,
    pause,
    stop,
    seek,
    changeVolume
  };
};