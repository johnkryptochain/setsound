// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { AudioUtils } from '@/utils/audioUtils';
import { AudioEncoders } from '@/utils/audioEncoders';
import { AudioTrack, AudioSegment } from '@/types';
import { useHistory } from '@/hooks/useHistory';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useWaveform } from '@/hooks/useWaveform';
import { ExportModal } from '@/components/ExportModal';

interface AudioJoinerProps {
  audioContext: AudioContext;
}

interface TrackWithSegments extends AudioTrack {
  segments: AudioSegment[];
  selectedSegmentId: string | null;
}

// Debounce utility for performance
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
};

// Throttle utility for high-frequency updates
const useThrottle = <T,>(value: T, interval: number): T => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());
  
  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdated.current >= interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timeoutId = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, interval - (now - lastUpdated.current));
      
      return () => clearTimeout(timeoutId);
    }
  }, [value, interval]);
  
  return throttledValue;
};

export const AudioJoiner = ({ audioContext }: AudioJoinerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [trackZooms, setTrackZooms] = useState<Record<string, number>>({});
  const [mergedBuffer, setMergedBuffer] = useState<AudioBuffer | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  // Separate selection state from history to avoid unnecessary history entries
  const [trackSelections, setTrackSelections] = useState<Record<string, string | null>>({});
  // Track playback state for individual tracks
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  // Track playback time for individual track playhead synchronization
  const [trackPlaybackTime, setTrackPlaybackTime] = useState<number>(0);
  // Multi-track playback state - stores each track's current playhead position
  const [trackPlayheadPositions, setTrackPlayheadPositions] = useState<Record<string, number>>({});
  // Multi-track playback active state
  const [isMultiTrackPlaying, setIsMultiTrackPlaying] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mixTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const trackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const trackAnimationFrameRef = useRef<number | null>(null);
  const trackPlaybackStartRef = useRef<{ contextTime: number; position: number } | null>(null);
  // Multi-track playback refs
  const multiTrackSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const multiTrackStartTimesRef = useRef<Map<string, { contextTime: number; position: number }>>(new Map());
  const multiTrackAnimationFrameRef = useRef<number | null>(null);

  // History management
  const { current: tracks, push, undo, redo, canUndo, canRedo } = useHistory<TrackWithSegments[]>({
    initialState: []
  });

  // Keep the hook for duration calculation but we'll handle playback ourselves for multi-track
  const { duration } = useAudioPlayer({
    audioBuffer: mergedBuffer,
    audioContext,
    onTimeUpdate: undefined // Remove callback to prevent re-renders
  });

  // Calculate current time based on multi-track playback
  const currentTime = useMemo(() => {
    if (!isMultiTrackPlaying) return 0;
    // Return the maximum playhead position across all tracks
    const positions = Object.values(trackPlayheadPositions);
    return positions.length > 0 ? Math.max(...positions) : 0;
  }, [isMultiTrackPlaying, trackPlayheadPositions]);

  // Throttle currentTime updates for smoother playhead movement on low-end hardware
  const throttledCurrentTime = useThrottle(currentTime, 50);

  // Mix all tracks when they change - Optimized with longer debounce
  const debouncedTracks = useDebounce(tracks, 300);
  
  useEffect(() => {
    if (debouncedTracks.length > 0) {
      mixTracks();
    }
  }, [debouncedTracks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mixTimeoutRef.current) {
        clearTimeout(mixTimeoutRef.current);
      }
      // Cancel any running animation frame
      if (trackAnimationFrameRef.current) {
        cancelAnimationFrame(trackAnimationFrameRef.current);
        trackAnimationFrameRef.current = null;
      }
      // Stop any playing track audio
      if (trackSourceRef.current) {
        try {
          trackSourceRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
        trackSourceRef.current = null;
      }
      // Cleanup multi-track playback
      if (multiTrackAnimationFrameRef.current) {
        cancelAnimationFrame(multiTrackAnimationFrameRef.current);
        multiTrackAnimationFrameRef.current = null;
      }
      multiTrackSourcesRef.current.forEach((source) => {
        try {
          source.stop();
        } catch (e) {
          // Ignore if already stopped
        }
      });
      multiTrackSourcesRef.current.clear();
      multiTrackStartTimesRef.current.clear();
    };
  }, []);

  // Stop track playback when track selection changes
  useEffect(() => {
    if (trackSourceRef.current) {
      // Cancel animation frame
      if (trackAnimationFrameRef.current) {
        cancelAnimationFrame(trackAnimationFrameRef.current);
        trackAnimationFrameRef.current = null;
      }
      try {
        trackSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      trackSourceRef.current = null;
      trackPlaybackStartRef.current = null;
      setPlayingTrackId(null);
    }
  }, [trackSelections]);

  // Update track playhead position from TrackTimeline component
  const updateTrackPlayheadPosition = useCallback((trackId: string, position: number) => {
    setTrackPlayheadPositions(prev => ({
      ...prev,
      [trackId]: position
    }));
  }, []);

  // Play all tracks simultaneously from their individual playhead positions
  const playAllTracks = useCallback(() => {
    // Stop any individual track playback first
    if (playingTrackId) {
      if (trackAnimationFrameRef.current) {
        cancelAnimationFrame(trackAnimationFrameRef.current);
        trackAnimationFrameRef.current = null;
      }
      if (trackSourceRef.current) {
        try {
          trackSourceRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
        trackSourceRef.current = null;
      }
      trackPlaybackStartRef.current = null;
      setPlayingTrackId(null);
    }

    // Stop any existing multi-track playback
    if (multiTrackAnimationFrameRef.current) {
      cancelAnimationFrame(multiTrackAnimationFrameRef.current);
      multiTrackAnimationFrameRef.current = null;
    }
    multiTrackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    });
    multiTrackSourcesRef.current.clear();
    multiTrackStartTimesRef.current.clear();

    // Create and start a source for each track
    const contextStartTime = audioContext.currentTime;
    
    tracks.forEach((track) => {
      // Get the current playhead position for this track (default to 0)
      const startPosition = trackPlayheadPositions[track.id] || 0;
      const clampedStartPosition = Math.max(0, Math.min(startPosition, track.buffer.duration));

      // Create a new source node for the track
      const source = audioContext.createBufferSource();
      source.buffer = track.buffer;
      source.connect(audioContext.destination);

      // Store the start time and position for playhead synchronization
      multiTrackStartTimesRef.current.set(track.id, {
        contextTime: contextStartTime,
        position: clampedStartPosition
      });

      // Handle when playback ends for this track
      source.onended = () => {
        multiTrackSourcesRef.current.delete(track.id);
        // If all tracks have ended, stop the animation
        if (multiTrackSourcesRef.current.size === 0) {
          if (multiTrackAnimationFrameRef.current) {
            cancelAnimationFrame(multiTrackAnimationFrameRef.current);
            multiTrackAnimationFrameRef.current = null;
          }
          setIsMultiTrackPlaying(false);
        }
      };

      // Start playback from the track's individual position
      source.start(0, clampedStartPosition);
      multiTrackSourcesRef.current.set(track.id, source);
    });

    setIsMultiTrackPlaying(true);

    // Animation loop to update all playhead positions
    const updatePlayheads = () => {
      const newPositions: Record<string, number> = {};
      let allEnded = true;

      tracks.forEach((track) => {
        const startInfo = multiTrackStartTimesRef.current.get(track.id);
        if (!startInfo) return;

        const elapsed = audioContext.currentTime - startInfo.contextTime;
        const newTime = startInfo.position + elapsed;

        // Check if this track has reached its end
        if (newTime >= track.buffer.duration) {
          newPositions[track.id] = track.buffer.duration;
        } else {
          newPositions[track.id] = newTime;
          allEnded = false;
        }
      });

      setTrackPlayheadPositions(newPositions);

      if (!allEnded && multiTrackSourcesRef.current.size > 0) {
        multiTrackAnimationFrameRef.current = requestAnimationFrame(updatePlayheads);
      } else {
        setIsMultiTrackPlaying(false);
      }
    };

    // Start the animation loop
    multiTrackAnimationFrameRef.current = requestAnimationFrame(updatePlayheads);
  }, [tracks, audioContext, playingTrackId, trackPlayheadPositions]);

  // Pause all tracks
  const pauseAllTracks = useCallback(() => {
    // Cancel animation frame
    if (multiTrackAnimationFrameRef.current) {
      cancelAnimationFrame(multiTrackAnimationFrameRef.current);
      multiTrackAnimationFrameRef.current = null;
    }

    // Calculate final positions before stopping
    const finalPositions: Record<string, number> = {};
    tracks.forEach((track) => {
      const startInfo = multiTrackStartTimesRef.current.get(track.id);
      if (startInfo) {
        const elapsed = audioContext.currentTime - startInfo.contextTime;
        const newTime = Math.min(startInfo.position + elapsed, track.buffer.duration);
        finalPositions[track.id] = newTime;
      }
    });

    // Stop all sources
    multiTrackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    });
    multiTrackSourcesRef.current.clear();
    multiTrackStartTimesRef.current.clear();

    // Update positions to where playback stopped
    setTrackPlayheadPositions(finalPositions);
    setIsMultiTrackPlaying(false);
  }, [tracks, audioContext]);

  // Play a single track's audio
  const playTrack = useCallback((trackId: string, startPosition: number = 0) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // Stop multi-track playback if active
    if (isMultiTrackPlaying) {
      pauseAllTracks();
    }

    // Stop any currently playing track
    if (trackSourceRef.current) {
      // Cancel any running animation frame
      if (trackAnimationFrameRef.current) {
        cancelAnimationFrame(trackAnimationFrameRef.current);
        trackAnimationFrameRef.current = null;
      }
      try {
        trackSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      trackSourceRef.current = null;
    }

    // Clamp start position to valid range
    const clampedStartPosition = Math.max(0, Math.min(startPosition, track.buffer.duration));

    // Create a new source node for the track
    const source = audioContext.createBufferSource();
    source.buffer = track.buffer;
    source.connect(audioContext.destination);
    
    // Store the start time and position for playhead synchronization
    trackPlaybackStartRef.current = {
      contextTime: audioContext.currentTime,
      position: clampedStartPosition
    };
    
    // Handle when playback ends
    source.onended = () => {
      if (trackSourceRef.current === source) {
        // Cancel animation frame
        if (trackAnimationFrameRef.current) {
          cancelAnimationFrame(trackAnimationFrameRef.current);
          trackAnimationFrameRef.current = null;
        }
        trackSourceRef.current = null;
        trackPlaybackStartRef.current = null;
        setPlayingTrackId(null);
      }
    };

    // Start playback from the specified position
    source.start(0, clampedStartPosition);
    trackSourceRef.current = source;
    setPlayingTrackId(trackId);
    setTrackPlaybackTime(clampedStartPosition);

    // Animation loop to update playhead position
    const updatePlayhead = () => {
      if (!trackPlaybackStartRef.current || !trackSourceRef.current) return;
      
      const elapsed = audioContext.currentTime - trackPlaybackStartRef.current.contextTime;
      const newTime = trackPlaybackStartRef.current.position + elapsed;
      
      // Check if we've reached the end of the track
      if (newTime >= track.buffer.duration) {
        setTrackPlaybackTime(track.buffer.duration);
        return;
      }
      
      setTrackPlaybackTime(newTime);
      trackAnimationFrameRef.current = requestAnimationFrame(updatePlayhead);
    };
    
    // Start the animation loop
    trackAnimationFrameRef.current = requestAnimationFrame(updatePlayhead);
  }, [tracks, audioContext, isMultiTrackPlaying, pauseAllTracks]);

  // Stop track playback
  const stopTrack = useCallback(() => {
    // Calculate the final position before stopping
    let finalPosition = trackPlaybackTime;
    if (trackPlaybackStartRef.current) {
      const elapsed = audioContext.currentTime - trackPlaybackStartRef.current.contextTime;
      finalPosition = trackPlaybackStartRef.current.position + elapsed;
    }
    
    // Cancel animation frame
    if (trackAnimationFrameRef.current) {
      cancelAnimationFrame(trackAnimationFrameRef.current);
      trackAnimationFrameRef.current = null;
    }
    if (trackSourceRef.current) {
      try {
        trackSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      trackSourceRef.current = null;
    }
    trackPlaybackStartRef.current = null;
    
    // Preserve the final position so the playhead stays where it was
    setTrackPlaybackTime(finalPosition);
    setPlayingTrackId(null);
  }, [audioContext, trackPlaybackTime]);

  // Toggle play/pause for a track
  const toggleTrackPlayback = useCallback((trackId: string, currentPosition: number = 0) => {
    if (playingTrackId === trackId) {
      stopTrack();
    } else {
      playTrack(trackId, currentPosition);
    }
  }, [playingTrackId, playTrack, stopTrack]);

  const mixTracks = useCallback(async () => {
    try {
      setIsProcessing(true);
      const allBuffers: AudioBuffer[] = [];
      
      // First, merge segments within each track (sequential)
      for (const track of tracks) {
        const trackBuffers = track.segments.map(seg => seg.buffer);
        const trackMerged = await AudioUtils.mergeAudioBuffers(trackBuffers);
        allBuffers.push(trackMerged);
      }
      
      // Then, MIX all tracks together (parallel - toutes les pistes ensemble)
      const final = await AudioUtils.mixAudioBuffers(allBuffers);
      setMergedBuffer(final);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error mixing tracks:', error);
      setIsProcessing(false);
    }
  }, [tracks]);

  const handleFilesSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsProcessing(true);
    const newTracks: TrackWithSegments[] = [];

    for (const file of files) {
      try {
        const buffer = await AudioUtils.loadAudioFile(file);
        const initialSegment: AudioSegment = {
          id: Date.now().toString() + Math.random(),
          buffer,
          startTime: 0,
          endTime: buffer.duration,
          selected: false
        };
        
        newTracks.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          buffer,
          duration: buffer.duration,
          name: file.name,
          segments: [initialSegment],
          selectedSegmentId: null
        });
      } catch (error) {
        console.error('Error loading file:', error);
      }
    }

    push([...tracks, ...newTracks]);
    setIsProcessing(false);
  }, [tracks, push]);

  const handleCutTrack = useCallback(async (trackId: string, cutTime: number) => {
    const trackIndex = tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    const track = tracks[trackIndex];
    const segments = track.segments;

    // Find which segment contains the cut point
    let newSegments: AudioSegment[] = [];
    let cutMade = false;
    let currentPosition = 0;

    for (const segment of segments) {
      if (!cutMade && cutTime > segment.startTime + 0.01 && cutTime < segment.endTime - 0.01) {
        const relativeTime = cutTime - segment.startTime;
        
        try {
          const beforeBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, 0, relativeTime);
          const afterBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, relativeTime, segment.buffer.duration);
          
          // Create segments with correct positions
          newSegments.push(
            {
              id: Date.now().toString(),
              buffer: beforeBuffer,
              startTime: currentPosition,
              endTime: currentPosition + beforeBuffer.duration,
              selected: false
            }
          );
          currentPosition += beforeBuffer.duration;
          
          newSegments.push(
            {
              id: (Date.now() + 1).toString(),
              buffer: afterBuffer,
              startTime: currentPosition,
              endTime: currentPosition + afterBuffer.duration,
              selected: false
            }
          );
          currentPosition += afterBuffer.duration;
          
          cutMade = true;
        } catch (error) {
          console.error('Error cutting segment:', error);
          newSegments.push({
            ...segment,
            startTime: currentPosition,
            endTime: currentPosition + segment.buffer.duration
          });
          currentPosition += segment.buffer.duration;
        }
      } else {
        newSegments.push({
          ...segment,
          startTime: currentPosition,
          endTime: currentPosition + segment.buffer.duration
        });
        currentPosition += segment.buffer.duration;
      }
    }

    if (cutMade) {
      const newTracks = [...tracks];
      newTracks[trackIndex] = { ...track, segments: newSegments };
      push(newTracks);
    }
  }, [tracks, push]);

  const handleDeleteSegment = useCallback(async (trackId: string, segmentId: string) => {
    const trackIndex = tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    const track = tracks[trackIndex];
    const newSegments = track.segments.filter(seg => seg.id !== segmentId);

    if (newSegments.length === 0) {
      // Remove entire track if no segments left
      push(tracks.filter(t => t.id !== trackId));
    } else {
      try {
        setIsProcessing(true);

        // Merge remaining segments to create new track buffer
        const buffers = newSegments.map(seg => seg.buffer);
        const mergedTrackBuffer = await AudioUtils.mergeAudioBuffers(buffers);

        // Recalculate segment positions
        let currentPosition = 0;
        const updatedSegments = newSegments.map(seg => {
          const updated = {
            ...seg,
            startTime: currentPosition,
            endTime: currentPosition + seg.buffer.duration
          };
          currentPosition += seg.buffer.duration;
          return updated;
        });

        const newTracks = [...tracks];
        newTracks[trackIndex] = {
          ...track,
          buffer: mergedTrackBuffer,
          duration: mergedTrackBuffer.duration,
          segments: updatedSegments,
          selectedSegmentId: null
        };
        push(newTracks);
        setIsProcessing(false);
      } catch (error) {
        console.error('Error deleting segment:', error);
        alert('Erreur lors de la suppression');
        setIsProcessing(false);
      }
    }
  }, [tracks, push]);

  const handleResizeSegment = useCallback(async (trackId: string, segmentId: string, newSegments: AudioSegment[]) => {
    const trackIndex = tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    const track = tracks[trackIndex];
    
    try {
      setIsProcessing(true);

      // Find the segment that was resized
      const resizedSegmentIndex = newSegments.findIndex(s => s.id === segmentId);
      if (resizedSegmentIndex === -1) {
        setIsProcessing(false);
        return;
      }

      // Get the resized segment
      const resizedSegment = newSegments[resizedSegmentIndex];
      
      // Update the specific segment in the track
      const updatedSegments = [...track.segments];
      updatedSegments[resizedSegmentIndex] = resizedSegment;

      // Merge segments to create new track buffer
      const buffers = updatedSegments.map(seg => seg.buffer);
      const mergedTrackBuffer = await AudioUtils.mergeAudioBuffers(buffers);

      // Recalculate segment positions
      let currentPosition = 0;
      const finalSegments = updatedSegments.map(seg => {
        const updated = {
          ...seg,
          startTime: currentPosition,
          endTime: currentPosition + seg.buffer.duration
        };
        currentPosition += seg.buffer.duration;
        return updated;
      });

      const newTracks = [...tracks];
      newTracks[trackIndex] = {
        ...track,
        buffer: mergedTrackBuffer,
        duration: mergedTrackBuffer.duration,
        segments: finalSegments
      };
      push(newTracks);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error resizing segment:', error);
      setIsProcessing(false);
    }
  }, [tracks, push]);

  // Selection state is now separate from history to avoid unnecessary history entries
  const toggleSegmentSelection = useCallback((trackId: string, segmentId: string) => {
    setTrackSelections(prev => {
      const newSelections: Record<string, string | null> = {};
      // Deselect all other tracks
      Object.keys(prev).forEach(id => {
        newSelections[id] = null;
      });
      // Toggle selection for clicked track
      newSelections[trackId] = prev[trackId] === segmentId ? null : segmentId;
      return newSelections;
    });
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    push(tracks.filter(t => t.id !== trackId));
    // Clean up selection state
    setTrackSelections(prev => {
      const newSelections = { ...prev };
      delete newSelections[trackId];
      return newSelections;
    });
  }, [tracks, push]);

  const handleDownload = useCallback(async (format: string, bitrate: number, customFileName?: string) => {
    if (!mergedBuffer) return;

    try {
      setIsProcessing(true);
      
      let blob: Blob;
      
      switch (format) {
        case 'wav':
          blob = AudioEncoders.audioBufferToWav(mergedBuffer);
          break;
        case 'mp3':
          blob = await AudioEncoders.audioBufferToMp3(mergedBuffer, bitrate);
          break;
        case 'flac':
          blob = await AudioEncoders.audioBufferToFlac(mergedBuffer);
          break;
        default:
          blob = AudioEncoders.audioBufferToWav(mergedBuffer);
      }
      
      const filename = (customFileName || 'merged_audio') + `.${format}`;
      AudioUtils.downloadBlob(blob, filename);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error downloading:', error);
      alert('Erreur lors du téléchargement');
      setIsProcessing(false);
    }
  }, [mergedBuffer]);

  // Clear all selections without affecting history
  const clearSelections = useCallback(() => {
    setTrackSelections({});
  }, []);

  // Get the currently selected track ID (first track with a selected segment)
  const selectedTrackId = useMemo(() => {
    for (const [trackId, segmentId] of Object.entries(trackSelections)) {
      if (segmentId !== null) {
        return trackId;
      }
    }
    return null;
  }, [trackSelections]);

  // Get zoom for a specific track (default to 1)
  const getTrackZoom = useCallback((trackId: string) => {
    return trackZooms[trackId] ?? 1;
  }, [trackZooms]);

  // Get the zoom level for the currently selected track (for display)
  const selectedTrackZoom = useMemo(() => {
    if (selectedTrackId) {
      return trackZooms[selectedTrackId] ?? 1;
    }
    return 1;
  }, [selectedTrackId, trackZooms]);

  // Memoize zoom handlers - now per-track
  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent clearSelections from being triggered
    if (!selectedTrackId) return;
    setTrackZooms(prev => ({
      ...prev,
      [selectedTrackId]: Math.min((prev[selectedTrackId] ?? 1) * 1.5, 10)
    }));
  }, [selectedTrackId]);

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent clearSelections from being triggered
    if (!selectedTrackId) return;
    setTrackZooms(prev => ({
      ...prev,
      [selectedTrackId]: Math.max((prev[selectedTrackId] ?? 1) / 1.5, 1)
    }));
  }, [selectedTrackId]);

  const openFileInput = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  const openExportModal = useCallback(() => {
    setShowExportModal(true);
  }, []);

  const closeExportModal = useCallback(() => {
    setShowExportModal(false);
  }, []);

  // Memoize undo/redo handlers
  const handleUndo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    undo();
  }, [undo]);

  const handleRedo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    redo();
  }, [redo]);

  // Memoize play/pause handlers for the main (multi-track) playback
  const handlePlay = useCallback(() => {
    playAllTracks();
  }, [playAllTracks]);

  // Handle pause for main playback
  const handlePause = useCallback(() => {
    pauseAllTracks();
  }, [pauseAllTracks]);

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 md:p-8" onClick={clearSelections}>
      {/* Header with Undo/Redo */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-6 md:mb-8 gap-3">
        <div className="text-center flex-1 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-2xl md:text-3xl font-semibold text-neutral-100 mb-1 sm:mb-2">Fusionneur Audio</h1>
          <p className="text-xs sm:text-sm text-neutral-400">Timeline multi-pistes • Ctrl+Z pour annuler</p>
        </div>
        
        {tracks.length > 0 && (
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="px-3 sm:px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-neutral-100 rounded-lg transition-colors disabled:opacity-30 flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base min-h-[44px]"
              title="Annuler (Ctrl+Z)"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-[18px] sm:h-[18px]">
                <path d="M3 9h12M3 9l4-4M3 9l4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">Annuler</span>
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="px-3 sm:px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-neutral-100 rounded-lg transition-colors disabled:opacity-30 flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base min-h-[44px]"
              title="Rétablir (Ctrl+Y)"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-[18px] sm:h-[18px]">
                <path d="M15 9H3M15 9l-4-4M15 9l-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">Rétablir</span>
            </button>
          </div>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full max-w-2xl min-h-[400px] border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center bg-neutral-950 hover:border-primary-500 hover:bg-neutral-900 transition-all cursor-pointer"
            onClick={openFileInput}
          >
            <div className="text-center p-12">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-6 text-neutral-400">
                <rect x="12" y="12" width="16" height="16" rx="2" strokeLinecap="round"/>
                <rect x="36" y="12" width="16" height="16" rx="2" strokeLinecap="round"/>
                <rect x="24" y="36" width="16" height="16" rx="2" strokeLinecap="round"/>
                <path d="M20 28v8M44 28v8M32 28v8" strokeLinecap="round"/>
              </svg>
              <h3 className="text-xl font-medium text-neutral-100 mb-2">Ajoutez plusieurs pistes audio</h3>
              <p className="text-neutral-400 mb-6">Chaque piste peut être éditée individuellement</p>
              <button className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors">
                Sélectionner des fichiers
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,.aiff,.aif,.opus,.webm,.amr,.3gp,.caf,.mid,.midi,.ra,.rm,.au,.snd,.mka,.oga,.spx,.wv,.ape,.ac3,.dts,.alac,audio/mpeg,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/x-m4a,audio/x-ms-wma,audio/aiff,audio/x-aiff,audio/opus,audio/webm,audio/amr,audio/3gpp,audio/x-caf,audio/midi,audio/x-midi,audio/x-realaudio,audio/basic,audio/x-matroska,audio/x-speex,audio/x-wavpack,audio/x-ape,audio/ac3,audio/x-dts,audio/x-alac"
              multiple
              onChange={handleFilesSelect}
              className="hidden"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 sm:gap-4 md:gap-6">
          {/* Global Controls - Responsive */}
          <div className="bg-neutral-900 rounded-lg sm:rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-0">
            <div className="flex items-center gap-4">
              {!isMultiTrackPlaying ? (
                <button
                  onClick={handlePlay}
                  className="w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 flex items-center justify-center transition-all shadow-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                    <path d="M6 4l10 6-10 6V4z"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 flex items-center justify-center transition-all shadow-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                    <rect x="6" y="4" width="2.5" height="12" rx="1"/>
                    <rect x="11.5" y="4" width="2.5" height="12" rx="1"/>
                  </svg>
                </button>
              )}
              
              <div className="text-sm font-mono text-neutral-100">
                {AudioUtils.formatTime(currentTime)} / {AudioUtils.formatTime(duration)}
              </div>
            </div>

            <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
              {/* Zoom Controls - Per-track */}
              <button
                onClick={handleZoomOut}
                disabled={!selectedTrackId || selectedTrackZoom <= 1}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors disabled:opacity-30"
                title={selectedTrackId ? "Zoom arrière" : "Sélectionnez un segment pour zoomer"}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="7" cy="7" r="5"/>
                  <path d="M4 7h6M11 11l4 4" strokeLinecap="round"/>
                </svg>
              </button>
              <span className="px-3 py-1.5 bg-neutral-950 text-neutral-100 rounded text-sm" title={selectedTrackId ? `Zoom piste ${tracks.findIndex(t => t.id === selectedTrackId) + 1}` : "Sélectionnez un segment"}>
                {selectedTrackId ? `${Math.round(selectedTrackZoom * 100)}%` : '--'}
              </span>
              <button
                onClick={handleZoomIn}
                disabled={!selectedTrackId || selectedTrackZoom >= 10}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors disabled:opacity-30"
                title={selectedTrackId ? "Zoom avant" : "Sélectionnez un segment pour zoomer"}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="7" cy="7" r="5"/>
                  <path d="M4 7h6M7 4v6M11 11l4 4" strokeLinecap="round"/>
                </svg>
              </button>

              <div className="w-px h-6 bg-neutral-700 mx-1"></div>

              <button
                onClick={openFileInput}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
                </svg>
                Ajouter piste
              </button>
              
              <button
                onClick={openExportModal}
                disabled={isProcessing}
                className="px-4 py-2 bg-[#8286ef] hover:bg-[#6b6fdb] text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 2v10M8 12l-3-3M8 12l3-3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 14h10" strokeLinecap="round"/>
                </svg>
                Télécharger
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,.aiff,.aif,.opus,.webm,.amr,.3gp,.caf,.mid,.midi,.ra,.rm,.au,.snd,.mka,.oga,.spx,.wv,.ape,.ac3,.dts,.alac,audio/mpeg,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/x-m4a,audio/x-ms-wma,audio/aiff,audio/x-aiff,audio/opus,audio/webm,audio/amr,audio/3gpp,audio/x-caf,audio/midi,audio/x-midi,audio/x-realaudio,audio/basic,audio/x-matroska,audio/x-speex,audio/x-wavpack,audio/x-ape,audio/ac3,audio/x-dts,audio/x-alac"
              multiple
              onChange={handleFilesSelect}
              className="hidden"
            />
          </div>

          {/* Tracks Timeline */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {tracks.map((track, trackIndex) => (
              <MemoizedTrackTimeline
                key={track.id}
                track={track}
                trackIndex={trackIndex}
                zoom={getTrackZoom(track.id)}
                globalTime={throttledCurrentTime}
                isPlaying={isMultiTrackPlaying}
                selectedSegmentId={trackSelections[track.id] || null}
                isTrackPlaying={playingTrackId === track.id}
                trackPlaybackTime={playingTrackId === track.id ? trackPlaybackTime : 0}
                multiTrackPlayheadPosition={trackPlayheadPositions[track.id] || 0}
                isMultiTrackPlaying={isMultiTrackPlaying}
                onCut={handleCutTrack}
                onDeleteSegment={handleDeleteSegment}
                onToggleSegment={toggleSegmentSelection}
                onRemoveTrack={removeTrack}
                onResizeSegment={handleResizeSegment}
                onToggleTrackPlayback={toggleTrackPlayback}
                onUpdatePlayheadPosition={updateTrackPlayheadPosition}
              />
            ))}
          </div>
        </div>
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={closeExportModal}
        onExport={handleDownload}
        fileName="merged_audio"
      />

      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-neutral-900 rounded-xl p-8 text-center">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-neutral-100">Traitement en cours...</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Individual Track Timeline Component
interface TrackTimelineProps {
  track: TrackWithSegments;
  trackIndex: number;
  zoom: number;
  globalTime: number;
  isPlaying: boolean;
  selectedSegmentId: string | null;
  isTrackPlaying: boolean;
  trackPlaybackTime: number;
  multiTrackPlayheadPosition: number;
  isMultiTrackPlaying: boolean;
  onCut: (trackId: string, cutTime: number) => void;
  onDeleteSegment: (trackId: string, segmentId: string) => void;
  onToggleSegment: (trackId: string, segmentId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onResizeSegment: (trackId: string, segmentId: string, newSegments: AudioSegment[]) => void;
  onToggleTrackPlayback: (trackId: string, currentPosition: number) => void;
  onUpdatePlayheadPosition: (trackId: string, position: number) => void;
}

const TrackTimeline = ({
  track,
  trackIndex,
  zoom,
  globalTime,
  isPlaying,
  selectedSegmentId,
  isTrackPlaying,
  trackPlaybackTime,
  multiTrackPlayheadPosition,
  isMultiTrackPlaying,
  onCut,
  onDeleteSegment,
  onToggleSegment,
  onResizeSegment,
  onToggleTrackPlayback,
  onUpdatePlayheadPosition
}: TrackTimelineProps) => {
  const [localTime, setLocalTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [resizingSegment, setResizingSegment] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const duration = track.buffer.duration;

  // Memoize waveform options to prevent unnecessary redraws
  const waveformOptions = useMemo(() => ({
    audioBuffer: track.buffer,
    canvasRef,
    color: '#8286ef',
    zoom
  }), [track.buffer, zoom]);

  // Use waveform hook for better quality with zoom
  useWaveform(waveformOptions);

  // Sync local time with multi-track playback position
  useEffect(() => {
    if (!isDragging && isMultiTrackPlaying) {
      setLocalTime(multiTrackPlayheadPosition);
    }
  }, [isDragging, isMultiTrackPlaying, multiTrackPlayheadPosition]);

  // Sync local time with individual track playback
  useEffect(() => {
    if (!isDragging && isTrackPlaying) {
      setLocalTime(trackPlaybackTime);
    }
  }, [isDragging, isTrackPlaying, trackPlaybackTime]);

  // Separate effect to update localTime from trackPlaybackTime when paused
  // This ensures the playhead stays at the paused position
  useEffect(() => {
    if (!isDragging && !isTrackPlaying && !isMultiTrackPlaying && trackPlaybackTime > 0) {
      setLocalTime(trackPlaybackTime);
    }
  }, [isDragging, isTrackPlaying, isMultiTrackPlaying, trackPlaybackTime]);

  // Update parent with local time changes when dragging ends
  useEffect(() => {
    if (!isDragging && !isMultiTrackPlaying && !isTrackPlaying) {
      onUpdatePlayheadPosition(track.id, localTime);
    }
  }, [isDragging, localTime, track.id, onUpdatePlayheadPosition, isMultiTrackPlaying, isTrackPlaying]);

  // Handle Delete key for this track - Memoized handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedSegmentId) {
        onDeleteSegment(track.id, selectedSegmentId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSegmentId, onDeleteSegment, track.id]);

  // Memoized drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle playhead dragging for this track - Mouse and Touch support
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;

      const zoomedDiv = containerRef.current.firstElementChild as HTMLElement;
      if (!zoomedDiv) return;

      const rect = zoomedDiv.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;
      
      setLocalTime(Math.max(0, Math.min(time, duration)));
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMove as EventListener);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove as EventListener, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove as EventListener);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove as EventListener);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, duration]);

  // Handle segment resizing - Debounced for performance
  useEffect(() => {
    if (!resizingSegment) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      // Clear previous timeout to debounce
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(async () => {
        const zoomedDiv = containerRef.current?.firstElementChild as HTMLElement;
        if (!zoomedDiv) return;

        const rect = zoomedDiv.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newTime = (x / rect.width) * duration;

        const segmentIndex = track.segments.findIndex(s => s.id === resizingSegment.id);
        if (segmentIndex === -1) return;

        const segment = track.segments[segmentIndex];
        const newSegments = [...track.segments];

        try {
          if (resizingSegment.edge === 'start') {
            // Resize from start - Keep END fixed
            const maxStart = segment.endTime - 0.1;
            const clampedTime = Math.max(0, Math.min(newTime, maxStart));

            if (Math.abs(clampedTime - segment.startTime) > 0.05) {
              const trimAmount = clampedTime - segment.startTime;
              const newBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, trimAmount, segment.buffer.duration);
              
              newSegments[segmentIndex] = {
                ...segment,
                buffer: newBuffer,
                startTime: segment.endTime - newBuffer.duration,
                endTime: segment.endTime
              };
            }
          } else {
            // Resize from end - Keep START fixed
            const minEnd = segment.startTime + 0.1;
            const clampedTime = Math.max(minEnd, Math.min(newTime, duration));

            if (Math.abs(clampedTime - segment.endTime) > 0.05) {
              const newDuration = clampedTime - segment.startTime;
              const newBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, 0, newDuration);
              
              newSegments[segmentIndex] = {
                ...segment,
                buffer: newBuffer,
                startTime: segment.startTime,
                endTime: segment.startTime + newBuffer.duration
              };
            }
          }

          // Update track with new segments via callback
          onResizeSegment(track.id, resizingSegment.id, newSegments);
        } catch (error) {
          console.error('Error resizing segment:', error);
        }
      }, 50); // 50ms debounce for resize operations
    };

    const handleMouseUp = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      setResizingSegment(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [resizingSegment, track.segments, track.id, duration, onResizeSegment]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isDragging) return;

    const zoomedDiv = containerRef.current.firstElementChild as HTMLElement;
    if (!zoomedDiv) return;

    const rect = zoomedDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * duration;
    
    setLocalTime(Math.max(0, Math.min(clickTime, duration)));
  }, [isDragging, duration]);

  const handleCut = useCallback(() => {
    onCut(track.id, localTime);
  }, [onCut, track.id, localTime]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedSegmentId) {
      onDeleteSegment(track.id, selectedSegmentId);
    }
  }, [onDeleteSegment, track.id, selectedSegmentId]);

  const handleSegmentClick = useCallback((e: React.MouseEvent, segmentId: string) => {
    e.stopPropagation();
    onToggleSegment(track.id, segmentId);
  }, [onToggleSegment, track.id]);

  const handleResizeStart = useCallback((e: React.MouseEvent, segmentId: string, edge: 'start' | 'end') => {
    e.stopPropagation();
    setResizingSegment({ id: segmentId, edge });
  }, []);

  // Memoize segment info
  const segmentInfo = useMemo(() => ({
    count: track.segments.length,
    durationFormatted: AudioUtils.formatTime(duration)
  }), [track.segments.length, duration]);

  // Memoize playhead position
  const playheadPosition = useMemo(() => ({
    left: `${(localTime / duration) * 100}%`,
    timeFormatted: AudioUtils.formatTime(localTime)
  }), [localTime, duration]);

  return (
    <div className="bg-neutral-900 rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
      {/* Track Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-semibold text-sm">
            {trackIndex + 1}
          </div>
          <div>
            <div className="font-medium text-neutral-100">{track.name}</div>
            <div className="text-xs text-neutral-400">
              {segmentInfo.count} segment{segmentInfo.count > 1 ? 's' : ''} • {segmentInfo.durationFormatted}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Play/Pause button for this track */}
          <button
            onClick={() => onToggleTrackPlayback(track.id, localTime)}
            className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors"
            title={isTrackPlaying ? "Pause" : "Écouter cette piste"}
          >
            {isTrackPlaying ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="4" y="3" width="2.5" height="10" rx="0.5"/>
                <rect x="9.5" y="3" width="2.5" height="10" rx="0.5"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 3l8 5-8 5V3z"/>
              </svg>
            )}
          </button>

          {/* Cut button for this track */}
          <button
            onClick={handleCut}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors"
            title="Couper à la position"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="4" cy="4" r="2"/>
              <circle cx="4" cy="12" r="2"/>
              <path d="M6 5l6 6M6 11l6-6" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Delete selected segment */}
          <button
            onClick={handleDeleteSelected}
            disabled={!selectedSegmentId}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-30 disabled:bg-neutral-800"
            title="Supprimer segment sélectionné (Suppr)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Track Timeline - Touch optimized */}
      <div
        ref={containerRef}
        className="relative h-20 sm:h-24 bg-neutral-950 rounded-lg overflow-x-auto overflow-y-hidden cursor-pointer touch-pan-x"
        onClick={handleTimelineClick}
      >
        <div style={{ width: `${zoom * 100}%`, height: '100%', position: 'relative' }}>
          {/* Waveform with zoom support */}
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ width: '100%', height: '100%' }}
          />

          {/* Segments - Memoized rendering */}
          <SegmentList
            segments={track.segments}
            duration={duration}
            selectedSegmentId={selectedSegmentId}
            onSegmentClick={handleSegmentClick}
            onResizeStart={handleResizeStart}
          />

          {/* Playhead for this track - Touch and Mouse support */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="absolute top-0 bottom-0 w-1 bg-yellow-400 z-30 cursor-ew-resize touch-none"
            style={{
              left: playheadPosition.left,
              boxShadow: '0 0 12px rgba(250, 204, 21, 0.9)'
            }}
          >
            <div
              className="absolute -top-2 -left-2 w-7 h-7 sm:w-5 sm:h-5 bg-yellow-400 rounded-full shadow-lg border-2 border-yellow-300 cursor-grab active:cursor-grabbing touch-none"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-yellow-400 text-xs px-2 py-1 rounded font-mono whitespace-nowrap">
                {playheadPosition.timeFormatted}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoized TrackTimeline to prevent unnecessary re-renders
const MemoizedTrackTimeline = memo(TrackTimeline, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.track.segments === nextProps.track.segments &&
    prevProps.trackIndex === nextProps.trackIndex &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.globalTime === nextProps.globalTime &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.selectedSegmentId === nextProps.selectedSegmentId &&
    prevProps.isTrackPlaying === nextProps.isTrackPlaying &&
    prevProps.trackPlaybackTime === nextProps.trackPlaybackTime &&
    prevProps.multiTrackPlayheadPosition === nextProps.multiTrackPlayheadPosition &&
    prevProps.isMultiTrackPlaying === nextProps.isMultiTrackPlaying
  );
});

// Separate component for segment list to enable memoization
interface SegmentListProps {
  segments: AudioSegment[];
  duration: number;
  selectedSegmentId: string | null;
  onSegmentClick: (e: React.MouseEvent, segmentId: string) => void;
  onResizeStart: (e: React.MouseEvent, segmentId: string, edge: 'start' | 'end') => void;
}

const SegmentList = memo(({ segments, duration, selectedSegmentId, onSegmentClick, onResizeStart }: SegmentListProps) => {
  return (
    <>
      {segments.map((segment, index) => {
        const left = (segment.startTime / duration) * 100;
        const segmentWidth = ((segment.endTime - segment.startTime) / duration) * 100;
        const isSelected = segment.id === selectedSegmentId;
        const visualGap = 2; // 2px gap

        return (
          <div
            key={segment.id}
            onClick={(e) => onSegmentClick(e, segment.id)}
            className={`absolute top-1 bottom-1 transition-all rounded-md ${
              isSelected
                ? 'bg-primary-500 bg-opacity-50 border-4 border-primary-400'
                : 'bg-neutral-800 bg-opacity-40 border-2 border-neutral-600 hover:border-neutral-500'
            }`}
            style={{
              left: `${left}%`,
              width: `calc(${segmentWidth}% - ${visualGap}px)`,
              marginRight: `${visualGap}px`
            }}
          >
            {/* Left resize handle - Touch-friendly */}
            <div
              className="absolute left-0 top-0 bottom-0 w-3 sm:w-2 cursor-ew-resize hover:bg-primary-500 hover:bg-opacity-50 active:bg-primary-500 active:bg-opacity-70 z-10"
              onMouseDown={(e) => onResizeStart(e, segment.id, 'start')}
              title="Glissez pour ajuster le début"
            />

            {/* Segment Label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                isSelected ? 'bg-primary-500 text-white' : 'bg-neutral-900 text-neutral-300'
              }`}>
                {index + 1}
              </div>
            </div>

            {/* Right resize handle - Touch-friendly */}
            <div
              className="absolute right-0 top-0 bottom-0 w-3 sm:w-2 cursor-ew-resize hover:bg-primary-500 hover:bg-opacity-50 active:bg-primary-500 active:bg-opacity-70 z-10"
              onMouseDown={(e) => onResizeStart(e, segment.id, 'end')}
              title="Glissez pour ajuster la fin"
            />
          </div>
        );
      })}
    </>
  );
});