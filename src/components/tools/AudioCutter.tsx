// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useRef, useEffect } from 'react';
import { AudioUtils } from '@/utils/audioUtils';
import { AudioEncoders } from '@/utils/audioEncoders';
import { useWaveform } from '@/hooks/useWaveform';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useHistory } from '@/hooks/useHistory';
import { AudioSegment, CutterHistoryState } from '@/types';
import { ExportModal } from '@/components/ExportModal';
// Note: needsConversion is handled internally by AudioUtils.loadAudioFile

interface AudioCutterProps {
  audioContext: AudioContext;
}

export const AudioCutter = ({ audioContext }: AudioCutterProps) => {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [resizingSegment, setResizingSegment] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  
  // History management
  const { current: historyState, push, undo, redo, canUndo, canRedo, reset } = useHistory<CutterHistoryState>({
    initialState: { segments: [], zoom: 1 }
  });

  const segments = historyState.segments;

  useEffect(() => {
    setZoom(historyState.zoom);
  }, [historyState]);

  // Update audioBuffer when segments change (for undo/redo)
  useEffect(() => {
    const updateAudioBuffer = async () => {
      if (segments.length > 0) {
        try {
          const buffers = segments.map(seg => seg.buffer);
          const merged = await AudioUtils.mergeAudioBuffers(buffers);
          setAudioBuffer(merged);
        } catch (error) {
          console.error('Error updating audio buffer:', error);
        }
      }
    };

    updateAudioBuffer();
  }, [segments]);
  
  useWaveform({ audioBuffer, canvasRef, color: '#8286ef', zoom });
  
  const { isPlaying, currentTime, duration, volume, play, pause, seek, changeVolume } =
    useAudioPlayer({
      audioBuffer,
      audioContext,
      onTimeUpdate: () => {
        // Update playhead position during playback
      }
    });

  // Handle Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedSegmentId) {
        handleDeleteSegment(selectedSegmentId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSegmentId]);

  // Handle playhead dragging - Mouse and Touch support
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingPlayhead || !waveformContainerRef.current || !audioBuffer) return;

      const container = waveformContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const rect = container.getBoundingClientRect();
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const x = Math.max(0, Math.min(clientX - rect.left + scrollLeft, rect.width * zoom));
      const time = (x / (rect.width * zoom)) * duration;
      
      seek(Math.max(0, Math.min(time, duration)));
    };

    const handleEnd = () => {
      setIsDraggingPlayhead(false);
    };

    if (isDraggingPlayhead) {
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
  }, [isDraggingPlayhead, duration, zoom, audioBuffer, seek]);

  // Handle segment resizing
  useEffect(() => {
    if (!resizingSegment) return;

    const handleMouseMove = async (e: MouseEvent) => {
      if (!waveformContainerRef.current || !audioBuffer) return;

      const zoomedDiv = waveformContainerRef.current.firstElementChild as HTMLElement;
      if (!zoomedDiv) return;

      const rect = zoomedDiv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newTime = (x / rect.width) * duration;

      const segmentIndex = segments.findIndex(s => s.id === resizingSegment.id);
      if (segmentIndex === -1) return;

      const segment = segments[segmentIndex];
      const newSegments = [...segments];

      try {
        if (resizingSegment.edge === 'start') {
          // Resize from start - Audacity style: segment shrinks from left, stays at same END
          const maxStart = segment.endTime - 0.1;
          const clampedTime = Math.max(0, Math.min(newTime, maxStart));

          if (Math.abs(clampedTime - segment.startTime) > 0.01) {
            const trimAmount = clampedTime - segment.startTime;
            const newBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, trimAmount, segment.buffer.duration);
            
            // KEEP END POSITION FIXED, move start
            newSegments[segmentIndex] = {
              ...segment,
              buffer: newBuffer,
              startTime: segment.endTime - newBuffer.duration, // End stays same
              endTime: segment.endTime // FIXED
            };
          }
        } else {
          // Resize from end - Audacity style: segment shrinks from right, stays at same START
          const minEnd = segment.startTime + 0.1;
          const clampedTime = Math.max(minEnd, Math.min(newTime, duration));

          if (Math.abs(clampedTime - segment.endTime) > 0.01) {
            const newDuration = clampedTime - segment.startTime;
            const newBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, 0, newDuration);
            
            // KEEP START POSITION FIXED, move end
            newSegments[segmentIndex] = {
              ...segment,
              buffer: newBuffer,
              startTime: segment.startTime, // FIXED
              endTime: segment.startTime + newBuffer.duration
            };
          }
        }

        push({ segments: newSegments, zoom });
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
  }, [resizingSegment, segments, duration, audioBuffer, zoom, push]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      
      // AudioUtils.loadAudioFile handles conversion internally if needed
      // No need to check needsConversion() separately - this matches AudioJoiner behavior
      const buffer = await AudioUtils.loadAudioFile(file);
      
      setAudioBuffer(buffer);
      setFileName(file.name);
      
      // Create initial segment
      const initialSegment: AudioSegment = {
        id: '1',
        buffer,
        startTime: 0,
        endTime: buffer.duration,
        selected: false
      };
      
      reset({ segments: [initialSegment], zoom: 1 });
      setIsProcessing(false);
    } catch (error) {
      console.error('Error loading file:', error);
      setIsProcessing(false);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Erreur lors du chargement du fichier: ${errorMessage}`);
    }
  };

  const handleCutAtPosition = async () => {
    if (!audioBuffer || segments.length === 0) return;

    const cutTime = currentTime;
    if (cutTime <= 0.01 || cutTime >= duration - 0.01) {
      alert('Position de découpe invalide');
      return;
    }

    try {
      setIsProcessing(true);

      // Find which segment contains the cut point
      let newSegments: AudioSegment[] = [];
      let cutMade = false;

      for (const segment of segments) {
        if (!cutMade && cutTime > segment.startTime + 0.01 && cutTime < segment.endTime - 0.01) {
          // Calculate precise cut position within this segment
          const relativeTime = cutTime - segment.startTime;
          
          // Split the buffer precisely
          const beforeBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, 0, relativeTime);
          const afterBuffer = await AudioUtils.trimAudioBuffer(segment.buffer, relativeTime, segment.buffer.duration);
          
          // Create two new segments
          newSegments.push(
            {
              id: Date.now().toString(),
              buffer: beforeBuffer,
              startTime: segment.startTime,
              endTime: cutTime,
              selected: false
            },
            {
              id: (Date.now() + 1).toString(),
              buffer: afterBuffer,
              startTime: cutTime,
              endTime: segment.endTime,
              selected: false
            }
          );
          cutMade = true;
        } else {
          newSegments.push(segment);
        }
      }

      if (cutMade) {
        push({ segments: newSegments, zoom });
      }
      
      setIsProcessing(false);
    } catch (error) {
      console.error('Error cutting:', error);
      alert('Erreur lors de la découpe');
      setIsProcessing(false);
    }
  };

  const handleSegmentClick = (segmentId: string) => {
    setSelectedSegmentId(selectedSegmentId === segmentId ? null : segmentId);
  };

  const handleDeleteSegment = async (segmentId: string) => {
    const newSegments = segments.filter(seg => seg.id !== segmentId);
    
    if (newSegments.length === 0) {
      alert('Vous devez garder au moins un segment');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Merge remaining segments and update audio buffer
      const buffers = newSegments.map(seg => seg.buffer);
      const merged = await AudioUtils.mergeAudioBuffers(buffers);
      setAudioBuffer(merged);
      
      // Recalculate segment times
      let currentTime = 0;
      const updatedSegments = newSegments.map(seg => {
        const newSeg = {
          ...seg,
          startTime: currentTime,
          endTime: currentTime + seg.buffer.duration
        };
        currentTime += seg.buffer.duration;
        return newSeg;
      });
      
      push({ segments: updatedSegments, zoom });
      setSelectedSegmentId(null);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error deleting segment:', error);
      alert('Erreur lors de la suppression');
      setIsProcessing(false);
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.5, 10);
    push({ segments, zoom: newZoom });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.5, 1);
    push({ segments, zoom: newZoom });
  };

  const handleDownload = async (format: string, bitrate: number, customFileName?: string) => {
    if (segments.length === 0) return;

    try {
      setIsProcessing(true);
      const buffers = segments.map(seg => seg.buffer);
      const final = await AudioUtils.mergeAudioBuffers(buffers);
      
      let blob: Blob;
      
      switch (format) {
        case 'wav':
          blob = AudioEncoders.audioBufferToWav(final);
          break;
        case 'mp3':
          blob = await AudioEncoders.audioBufferToMp3(final, bitrate);
          break;
        case 'flac':
          blob = await AudioEncoders.audioBufferToFlac(final);
          break;
        default:
          blob = AudioEncoders.audioBufferToWav(final);
      }
      
      const filename = (customFileName || fileName.replace(/\.[^/.]+$/, '') + '_edited') + `.${format}`;
      AudioUtils.downloadBlob(blob, filename);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error downloading:', error);
      alert('Erreur lors du téléchargement');
      setIsProcessing(false);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformContainerRef.current || !audioBuffer || isDraggingPlayhead) return;

    // Deselect any selected segment when clicking on timeline
    setSelectedSegmentId(null);

    // Get the inner div (zoomed content)
    const zoomedDiv = waveformContainerRef.current.firstElementChild as HTMLElement;
    if (!zoomedDiv) return;

    const rect = zoomedDiv.getBoundingClientRect();
    
    // Calculate position relative to the zoomed content
    const x = event.clientX - rect.left;
    const clickTime = (x / rect.width) * duration;
    
    seek(Math.max(0, Math.min(clickTime, duration)));
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingPlayhead(true);
  };

  return (
    <div
      className="flex flex-col h-full p-4 sm:p-6 md:p-8"
      onClick={() => setSelectedSegmentId(null)}
    >
      {/* Header with Undo/Redo */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-6 md:mb-8 gap-3">
        <div className="text-center flex-1 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-2xl md:text-3xl font-semibold text-neutral-100 mb-1 sm:mb-2">Découpeur Audio</h1>
          <p className="text-xs sm:text-sm text-neutral-400">Éditez avec précision • Ctrl+Z pour annuler</p>
        </div>
        
        {audioBuffer && (
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              onClick={undo}
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
              onClick={redo}
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

      {!audioBuffer ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full max-w-2xl min-h-[400px] border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center bg-neutral-950 hover:border-primary-500 hover:bg-neutral-900 transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center p-12">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" className="mx-auto mb-6 text-neutral-400" strokeWidth="2">
                <path d="M32 16v32M16 32h32" strokeLinecap="round"/>
                <circle cx="32" cy="32" r="20" strokeLinecap="round"/>
              </svg>
              <h3 className="text-xl font-medium text-neutral-100 mb-2">Glissez-déposez un fichier audio</h3>
              <p className="text-neutral-400 mb-6">ou cliquez pour parcourir</p>
              <button className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors inline-flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
                </svg>
                Parcourir mes fichiers
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,.aiff,.aif,.opus,.webm,.amr,.3gp,.caf,.mid,.midi,.ra,.rm,.au,.snd,.mka,.oga,.spx,.wv,.ape,.ac3,.dts,.alac,audio/mpeg,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/x-m4a,audio/x-ms-wma,audio/aiff,audio/x-aiff,audio/opus,audio/webm,audio/amr,audio/3gpp,audio/x-caf,audio/midi,audio/x-midi,audio/x-realaudio,audio/basic,audio/x-matroska,audio/x-speex,audio/x-wavpack,audio/x-ape,audio/ac3,audio/x-dts,audio/x-alac"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 sm:gap-4 md:gap-6">
          {/* Timeline View - Responsive */}
          <div className="bg-neutral-900 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 flex-1">
            {/* Zoom Controls + Cut + Delete Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 gap-2">
              <div className="text-xs sm:text-sm text-neutral-400">
                {segments.length} segment{segments.length > 1 ? 's' : ''} • Touchez pour sélectionner
              </div>
              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <button
                  onClick={handleZoomOut}
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
                  onClick={handleZoomIn}
                  disabled={zoom >= 10}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors disabled:opacity-30"
                  title="Zoom avant"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="7" cy="7" r="5"/>
                    <path d="M4 7h6M7 4v6M11 11l4 4" strokeLinecap="round"/>
                  </svg>
                </button>
                
                {/* Separator */}
                <div className="w-px h-6 bg-neutral-700 mx-1"></div>
                
                {/* Cut Button */}
                <button
                  onClick={handleCutAtPosition}
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded transition-colors disabled:opacity-30"
                  title="Couper à la position actuelle"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="4" cy="4" r="2"/>
                    <circle cx="4" cy="12" r="2"/>
                    <path d="M6 5l6 6M6 11l6-6" strokeLinecap="round"/>
                  </svg>
                </button>
                
                {/* Delete Button */}
                <button
                  onClick={() => selectedSegmentId && handleDeleteSegment(selectedSegmentId)}
                  disabled={!selectedSegmentId}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-30 disabled:bg-neutral-800 disabled:text-neutral-500"
                  title="Supprimer le segment sélectionné (Suppr)"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Timeline with Segments - Touch optimized */}
            <div
              ref={waveformContainerRef}
              className="relative h-32 sm:h-40 md:h-48 bg-neutral-950 rounded-lg overflow-x-auto overflow-y-hidden mb-3 sm:mb-4 cursor-pointer touch-pan-x"
              onClick={(e) => {
                e.stopPropagation();
                handleCanvasClick(e);
              }}
            >
              <div style={{ width: `${zoom * 100}%`, height: '100%', position: 'relative' }}>
                {/* Waveform Background */}
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                />

                {/* Segments avec poignées de redimensionnement */}
                {segments.map((segment, index) => {
                  const left = (segment.startTime / duration) * 100;
                  const segmentWidth = ((segment.endTime - segment.startTime) / duration) * 100;
                  const isSelected = segment.id === selectedSegmentId;
                  const visualGap = 2;

                  return (
                    <div
                      key={segment.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSegmentClick(segment.id);
                      }}
                      className={`absolute top-2 bottom-2 transition-all rounded-lg ${
                        isSelected
                          ? 'bg-primary-500 bg-opacity-50 border-4 border-primary-400'
                          : 'bg-neutral-800 bg-opacity-60 border-2 border-neutral-600 hover:border-neutral-500'
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
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                          isSelected
                            ? 'bg-primary-500 text-white shadow-lg'
                            : 'bg-neutral-900 text-neutral-300'
                        }`}>
                          Segment {index + 1}
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

                {/* Playhead - DRAGGABLE - Touch and Mouse support */}
                <div
                  onMouseDown={handlePlayheadMouseDown}
                  onTouchStart={handlePlayheadMouseDown}
                  className="absolute top-0 bottom-0 w-1 bg-yellow-400 z-30 cursor-ew-resize touch-none"
                  style={{
                    left: `${(currentTime / duration) * 100}%`,
                    boxShadow: '0 0 16px rgba(250, 204, 21, 1), 0 0 32px rgba(250, 204, 21, 0.5)'
                  }}
                >
                  {/* Gros rond draggable en haut - Touch-friendly */}
                  <div
                    className="absolute -top-3 -left-3 w-9 h-9 sm:w-7 sm:h-7 bg-yellow-400 rounded-full shadow-2xl border-3 border-yellow-200 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform touch-none"
                    onMouseDown={handlePlayheadMouseDown}
                    onTouchStart={handlePlayheadMouseDown}
                  >
                    {/* Time tooltip inside */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-yellow-400 text-xs px-2 py-1 rounded font-mono whitespace-nowrap shadow-lg">
                      {AudioUtils.formatTime(currentTime)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Player Controls */}
            <div className="flex items-center justify-between bg-neutral-950 rounded-lg p-4">
              <div className="flex items-center gap-4">
                {!isPlaying ? (
                  <button
                    onClick={() => play()}
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

              <div className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className="text-neutral-400">
                  <path d="M5 6v6l4 3V3L5 6z"/>
                  <path d="M13 6c.5.5.5 4.5 0 6M15 4c1 1 1 8 0 10" stroke="currentColor" strokeWidth="1" fill="none"/>
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume * 100}
                  onChange={(e) => changeVolume(Number(e.target.value) / 100)}
                  className="w-20 h-1 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons - Responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button
              onClick={handleCutAtPosition}
              disabled={isProcessing}
              className="px-4 sm:px-6 py-3 sm:py-4 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-neutral-100 rounded-lg sm:rounded-xl transition-colors flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-50 min-h-[52px] sm:min-h-[56px]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-6 sm:h-6 flex-shrink-0">
                <circle cx="7" cy="7" r="3"/>
                <circle cx="7" cy="17" r="3"/>
                <path d="M10 9l8 8M10 15l8-8" strokeLinecap="round"/>
              </svg>
              <span className="text-sm sm:text-base">Couper à {AudioUtils.formatTime(currentTime)}</span>
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              disabled={isProcessing}
              className="px-4 sm:px-6 py-3 sm:py-4 bg-[#8286ef] hover:bg-[#6b6fdb] active:bg-[#5a5ec7] text-white rounded-lg sm:rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 sm:gap-3 shadow-lg min-h-[52px] sm:min-h-[56px]"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" className="sm:w-5 sm:h-5 flex-shrink-0">
                <path d="M10 3v11M10 14l-4-4M10 14l4-4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 17h12" strokeLinecap="round"/>
              </svg>
              <span className="text-sm sm:text-base">Télécharger</span>
            </button>
          </div>

        </div>
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleDownload}
        fileName={fileName}
      />

      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-neutral-900 rounded-xl p-8 text-center max-w-md mx-4">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-neutral-100">Traitement en cours...</p>
          </div>
        </div>
      )}
    </div>
  );
};