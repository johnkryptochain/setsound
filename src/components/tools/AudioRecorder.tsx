import { useState, useRef, useEffect } from 'react';
import { AudioUtils } from '@/utils/audioUtils';
import { ExportModal } from '@/components/ExportModal';

interface AudioRecorderProps {
  audioContext: AudioContext;
}

export const AudioRecorder = ({ audioContext }: AudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordings, setRecordings] = useState<Array<{ id: string; blob: Blob; duration: number; date: Date }>>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<{ blob: Blob; duration: number } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    return () => {
      stopRecording();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      });

      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        const newRecording = {
          id: Date.now().toString(),
          blob,
          duration: recordingTime,
          date: new Date()
        };
        setRecordings([newRecording, ...recordings]);
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      // Start timer
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);

      // Start visualizer
      startVisualizer(stream);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Erreur lors de l\'accès au microphone. Vérifiez les permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      
      const startTime = Date.now() - (recordingTime * 1000);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    setIsRecording(false);
    setIsPaused(false);
  };

  const startVisualizer = (stream: MediaStream) => {
    if (!canvasRef.current || !audioContext || audioContext.state === 'closed') return;

    // Resume context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    updateCanvasSize();

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      // Check if we should continue drawing
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      
      // Get frequency data
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      const centerY = canvas.height / 2;

      // Draw bars
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (canvas.height / 2) * 0.85;
        const x = i * barWidth;
        
        // Color based on amplitude
        const intensity = dataArray[i] / 255;
        const hue = 250 - (intensity * 40); // Purple to blue gradient
        const saturation = 70;
        const lightness = 50 + (intensity * 20);
        const alpha = 0.4 + (intensity * 0.6);
        
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
        
        // Draw symmetric bars (top and bottom)
        ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);
        ctx.fillRect(x, centerY, barWidth - 1, barHeight);
      }
    };

    // Start drawing
    draw();
  };

  const handleDownload = (format: string, bitrate: number, customFileName?: string) => {
    if (!selectedRecording) return;

    const filename = (customFileName || `recording_${new Date().toISOString().slice(0, 10)}`) + `.${format}`;
    AudioUtils.downloadBlob(selectedRecording.blob, filename);
    setShowExportModal(false);
    setSelectedRecording(null);
  };

  const openExportModal = (blob: Blob, duration: number) => {
    setSelectedRecording({ blob, duration });
    setShowExportModal(true);
  };

  const deleteRecording = (id: string) => {
    setRecordings(recordings.filter(r => r.id !== id));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const ms = Math.floor((secs % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${Math.floor(secs).toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full p-8 overflow-hidden">
      {/* Header - Style cohérent */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-semibold text-neutral-100 mb-2">Enregistreur Audio</h1>
        <p className="text-neutral-400">Enregistrez en haute qualité • Visualisation temps réel</p>
      </div>

      {/* Main Recording Area - Compact */}
      <div className="flex flex-col items-center justify-center gap-6 mb-6">
        {/* Timer Display - Compact */}
        <div className="text-5xl font-light text-neutral-100 font-mono tracking-wider">
          {formatDuration(recordingTime)}
        </div>

        {/* Visualizer - Compact */}
        <div className="w-full max-w-lg h-24 rounded-xl overflow-hidden bg-neutral-900">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>

        {/* Control Buttons - Compact */}
        <div className="flex items-center gap-6">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="relative w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 transition-all shadow-lg flex items-center justify-center"
            >
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <circle cx="12" cy="12" r="6"/>
              </svg>
            </button>
          ) : (
            <>
              {!isPaused ? (
                <button
                  onClick={pauseRecording}
                  className="w-12 h-12 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-all flex items-center justify-center"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                    <rect x="6" y="4" width="2.5" height="12" rx="1"/>
                    <rect x="11.5" y="4" width="2.5" height="12" rx="1"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={resumeRecording}
                  className="w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 transition-all flex items-center justify-center"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                    <path d="M6 4l10 6-10 6V4z"/>
                  </svg>
                </button>
              )}

              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-all flex items-center justify-center border-2 border-red-500"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <rect x="7" y="7" width="10" height="10" rx="1"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Recording Status */}
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-neutral-400 text-xs">
              {isPaused ? 'En pause' : 'Enregistrement'}
            </span>
          </div>
        )}
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setSelectedRecording(null);
        }}
        onExport={handleDownload}
        fileName={`recording_${new Date().toISOString().slice(0, 10)}`}
      />

      {/* Recordings List - Compact */}
      {recordings.length > 0 && (
        <div className="border-t border-neutral-900 pt-4 flex-shrink-0">
          <h2 className="text-base font-medium text-neutral-100 mb-3">Enregistrements ({recordings.length})</h2>
          <div className="space-y-2 max-h-[20vh] overflow-y-auto">
            {recordings.map((recording) => (
              <div
                key={recording.id}
                className="flex items-center gap-4 p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                    <path d="M6 4l10 6-10 6V4z"/>
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-neutral-100 font-medium truncate">
                    Enregistrement {recording.date.toLocaleTimeString('fr-FR')}
                  </div>
                  <div className="text-sm text-neutral-400">
                    {AudioUtils.formatTime(recording.duration)} • {recording.date.toLocaleDateString('fr-FR')}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openExportModal(recording.blob, recording.duration)}
                    className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-[#8286ef] flex items-center justify-center transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 2v10M9 12l-3-3M9 12l3-3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 14h10" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteRecording(recording.id)}
                    className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-red-600 flex items-center justify-center transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4l10 10M14 4L4 14" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};