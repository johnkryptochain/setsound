// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useRef, useEffect } from 'react';
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

export const AudioJoiner = ({ audioContext }: AudioJoinerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mergedBuffer, setMergedBuffer] = useState<AudioBuffer | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History management
  const { current: tracks, push, undo, redo, canUndo, canRedo } = useHistory<TrackWithSegments[]>({
    initialState: []
  });

  const { isPlaying, currentTime, duration, play, pause } =
    useAudioPlayer({
      audioBuffer: mergedBuffer,
      audioContext,
      onTimeUpdate: () => {
        // This will trigger re-render and update all track playheads
      }
    });

  // Merge all tracks when they change
  useEffect(() => {
    if (tracks.length > 0) {
      mergeTracks();
    }
  }, [tracks]);

  const mergeTracks = async () => {
    try {
      const allBuffers: AudioBuffer[] = [];
      
      for (const track of tracks) {
        const trackBuffers = track.segments.map(seg => seg.buffer);
        const trackMerged = await AudioUtils.mergeAudioBuffers(trackBuffers);
        allBuffers.push(trackMerged);
      }
      
      const final = await AudioUtils.mergeAudioBuffers(allBuffers);
      setMergedBuffer(final);
    } catch (error) {
      console.error('Error merging tracks:', error);
    }
  };

  const handleFilesSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleCutTrack = async (trackId: string, cutTime: number) => {
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
  };

  const handleDeleteSegment = async (trackId: string, segmentId: string) => {
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
  };

  const handleResizeSegment = async (trackId: string, segmentId: string, newSegments: AudioSegment[]) => {
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
  };

  const toggleSegmentSelection = (trackId: string, segmentId: string) => {
    const newTracks = tracks.map(track => {
      if (track.id === trackId) {
        return {
          ...track,
          selectedSegmentId: track.selectedSegmentId === segmentId ? null : segmentId
        };
      }
      return { ...track, selectedSegmentId: null }; // Deselect other tracks
    });
    push(newTracks);
  };

  const removeTrack = (trackId: string) => {
    push(tracks.filter(t => t.id !== trackId));
  };

  const handleDownload = async (format: string, bitrate: number, customFileName?: string) => {
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
  };

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 md:p-8" onClick={() => {
      // Deselect all on outside click
      const newTracks = tracks.map(t => ({ ...t, selectedSegmentId: null }));
      push(newTracks);
    }}>
      {/* Header with Undo/Redo */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-6 md:mb-8 gap-3">
        <div className="text-center flex-1 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-2xl md:text-3xl font-semibold text-neutral-100 mb-1 sm:mb-2">Fusionneur Audio</h1>
          <p className="text-xs sm:text-sm text-neutral-400">Timeline multi-pistes • Ctrl+Z pour annuler</p>
        </div>
        
        {tracks.length > 0 && (
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                undo();
              }}
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
              onClick={(e) => {
                e.stopPropagation();
                redo();
              }}
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
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
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
              accept="audio/*"
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
              {!isPlaying ? (
                <button
                  onClick={() => {
                    // Play from current position - don't reset to 0
                    play(currentTime);
                  }}
                  className="w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 flex items-center justify-center transition-all shadow-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                    <path d="M6 4l10 6-10 6V4z"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={pause}
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
              {/* Zoom Controls */}
              <button
                onClick={() => setZoom(Math.max(zoom / 1.5, 1))}
                disabled={zoom <= 1}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors disabled:opacity-30"
                title="Zoom arrière"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="7" cy="7" r="5"/>
                  <path d="M4 7h6M11 11l4 4" strokeLinecap="round"/>
                </svg>
              </button>
              <span className="px-3 py-1.5 bg-neutral-950 text-neutral-100 rounded text-sm">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(Math.min(zoom * 1.5, 10))}
                disabled={zoom >= 10}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors disabled:opacity-30"
                title="Zoom avant"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="7" cy="7" r="5"/>
                  <path d="M4 7h6M7 4v6M11 11l4 4" strokeLinecap="round"/>
                </svg>
              </button>

              <div className="w-px h-6 bg-neutral-700 mx-1"></div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
                </svg>
                Ajouter piste
              </button>
              
              <button
                onClick={() => setShowExportModal(true)}
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
              accept="audio/*"
              multiple
              onChange={handleFilesSelect}
              className="hidden"
            />
          </div>

          {/* Tracks Timeline */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {tracks.map((track, trackIndex) => (
              <TrackTimeline
                key={track.id}
                track={track}
                trackIndex={trackIndex}
                zoom={zoom}
                globalTime={currentTime}
                isPlaying={isPlaying}
                onCut={(cutTime) => handleCutTrack(track.id, cutTime)}
                onDeleteSegment={(segmentId) => handleDeleteSegment(track.id, segmentId)}
                onToggleSegment={(segmentId) => toggleSegmentSelection(track.id, segmentId)}
                onRemoveTrack={() => removeTrack(track.id)}
                onResizeSegment={(segmentId, newSegments) => handleResizeSegment(track.id, segmentId, newSegments)}
              />
            ))}
          </div>
        </div>
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
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
  onCut: (cutTime: number) => void;
  onDeleteSegment: (segmentId: string) => void;
  onToggleSegment: (segmentId: string) => void;
  onRemoveTrack: () => void;
  onResizeSegment: (segmentId: string, newSegments: AudioSegment[]) => void;
}

const TrackTimeline = ({ track, trackIndex, zoom, globalTime, onCut, onDeleteSegment, onToggleSegment, onResizeSegment }: TrackTimelineProps) => {
  const [localTime, setLocalTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [resizingSegment, setResizingSegment] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const duration = track.buffer.duration;

  // Use waveform hook for better quality with zoom
  useWaveform({ audioBuffer: track.buffer, canvasRef, color: '#8286ef', zoom });

  // Sync local time with global playback - Always follow globalTime
  useEffect(() => {
    setLocalTime(globalTime);
  }, [globalTime]);

  // Handle Delete key for this track
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && track.selectedSegmentId) {
        onDeleteSegment(track.selectedSegmentId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [track.selectedSegmentId, onDeleteSegment]);

  // Handle playhead dragging for this track - Mouse and Touch support
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

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

    if (isDragging) {
      document.addEventListener('mousemove', handleMove as EventListener);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove as EventListener);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMove as EventListener);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove as EventListener);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, duration]);

  // Handle segment resizing - Same logic as AudioCutter
  useEffect(() => {
    if (!resizingSegment) return;

    const handleMouseMove = async (e: MouseEvent) => {
      if (!containerRef.current) return;

      const zoomedDiv = containerRef.current.firstElementChild as HTMLElement;
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

          if (Math.abs(clampedTime - segment.startTime) > 0.01) {
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

          if (Math.abs(clampedTime - segment.endTime) > 0.01) {
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
        onResizeSegment(resizingSegment.id, newSegments);
      } catch (error) {
        console.error('Error resizing segment:', error);
      }
    };

    const handleMouseUp = () => {
      setResizingSegment(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingSegment, track.segments, duration, onResizeSegment]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isDragging) return;

    const zoomedDiv = containerRef.current.firstElementChild as HTMLElement;
    if (!zoomedDiv) return;

    const rect = zoomedDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * duration;
    
    setLocalTime(Math.max(0, Math.min(clickTime, duration)));
  };

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
              {track.segments.length} segment{track.segments.length > 1 ? 's' : ''} • {AudioUtils.formatTime(duration)}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Cut button for this track */}
          <button
            onClick={() => onCut(localTime)}
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
            onClick={() => track.selectedSegmentId && onDeleteSegment(track.selectedSegmentId)}
            disabled={!track.selectedSegmentId}
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

          {/* Segments - Positionnement précis */}
          {track.segments.map((segment, index) => {
            const left = (segment.startTime / duration) * 100;
            const segmentWidth = ((segment.endTime - segment.startTime) / duration) * 100;
            const isSelected = segment.id === track.selectedSegmentId;
            const visualGap = 2; // 2px gap

            return (
              <div
                key={segment.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSegment(segment.id);
                }}
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
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizingSegment({ id: segment.id, edge: 'start' });
                  }}
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
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizingSegment({ id: segment.id, edge: 'end' });
                  }}
                  title="Glissez pour ajuster la fin"
                />
              </div>
            );
          })}

          {/* Playhead for this track - Touch and Mouse support */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsDragging(true);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsDragging(true);
            }}
            className="absolute top-0 bottom-0 w-1 bg-yellow-400 z-30 cursor-ew-resize touch-none"
            style={{
              left: `${(localTime / duration) * 100}%`,
              boxShadow: '0 0 12px rgba(250, 204, 21, 0.9)'
            }}
          >
            <div
              className="absolute -top-2 -left-2 w-7 h-7 sm:w-5 sm:h-5 bg-yellow-400 rounded-full shadow-lg border-2 border-yellow-300 cursor-grab active:cursor-grabbing touch-none"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsDragging(true);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsDragging(true);
              }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-yellow-400 text-xs px-2 py-1 rounded font-mono whitespace-nowrap">
                {AudioUtils.formatTime(localTime)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};