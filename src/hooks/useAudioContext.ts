import { useEffect, useRef, useState } from 'react';

export const useAudioContext = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      setIsReady(true);
    }

    // Don't close on unmount - keep it alive for the app
    return () => {
      // Context stays open
    };
  }, []);

  const resumeContext = async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  return {
    audioContext: audioContextRef.current,
    isReady,
    resumeContext
  };
};