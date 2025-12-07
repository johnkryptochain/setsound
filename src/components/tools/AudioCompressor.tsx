// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface AudioCompressorProps {
  audioContext: AudioContext;
}

interface BitrateOption {
  value: number;
  label: string;
  description: string;
}

const BITRATE_OPTIONS: BitrateOption[] = [
  { value: 64, label: '64 kbps', description: 'Très compressé - Petite taille' },
  { value: 128, label: '128 kbps', description: 'Qualité standard' },
  { value: 192, label: '192 kbps', description: 'Bonne qualité' },
  { value: 256, label: '256 kbps', description: 'Haute qualité' },
  { value: 320, label: '320 kbps', description: 'Qualité maximale' },
];

export const AudioCompressor = ({ audioContext }: AudioCompressorProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [bitrate, setBitrate] = useState<number>(128);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current?.loaded) {
      return ffmpegRef.current;
    }

    const ffmpeg = new FFmpeg();
    
    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    setProgressMessage('Chargement de FFmpeg...');
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setCompressedBlob(null);
    setError(null);
    setProgress(0);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('audio/')) {
      setFile(droppedFile);
      setCompressedBlob(null);
      setError(null);
      setProgress(0);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const getFileExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot).toLowerCase();
  };

  const handleCompress = async () => {
    if (!file) return;

    try {
      setIsProcessing(true);
      setError(null);
      setProgress(0);
      setCompressedBlob(null);

      setProgressMessage('Initialisation...');
      const ffmpeg = await loadFFmpeg();

      const inputFileName = `input_${Date.now()}${getFileExtension(file.name)}`;
      const outputFileName = `output_${Date.now()}.mp3`;

      setProgressMessage('Chargement du fichier...');
      setProgress(10);
      
      const inputData = await fetchFile(file);
      await ffmpeg.writeFile(inputFileName, inputData);

      setProgressMessage('Compression en cours...');
      setProgress(20);

      // Compress to MP3 with specified bitrate
      await ffmpeg.exec([
        '-i', inputFileName,
        '-vn',                      // No video
        '-acodec', 'libmp3lame',    // MP3 codec
        '-b:a', `${bitrate}k`,      // Bitrate
        '-ar', '44100',             // Sample rate
        '-ac', '2',                 // Stereo
        outputFileName
      ]);

      setProgressMessage('Finalisation...');
      setProgress(90);

      const outputData = await ffmpeg.readFile(outputFileName);

      // Clean up
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);

      // Create blob
      let blob: Blob;
      if (typeof outputData === 'string') {
        const encoder = new TextEncoder();
        blob = new Blob([encoder.encode(outputData)], { type: 'audio/mpeg' });
      } else {
        const buffer = new ArrayBuffer(outputData.byteLength);
        new Uint8Array(buffer).set(outputData);
        blob = new Blob([buffer], { type: 'audio/mpeg' });
      }

      setCompressedBlob(blob);
      setProgress(100);
      setProgressMessage('Compression terminée !');
      setIsProcessing(false);
    } catch (err) {
      console.error('Compression error:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la compression');
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!compressedBlob || !file) return;

    const originalName = file.name.replace(/\.[^/.]+$/, '');
    const fileName = `${originalName}_compressed_${bitrate}kbps.mp3`;

    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setCompressedBlob(null);
    setError(null);
    setProgress(0);
    setProgressMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateCompressionRatio = (): string => {
    if (!file || !compressedBlob) return '0%';
    const ratio = ((file.size - compressedBlob.size) / file.size) * 100;
    return ratio > 0 ? `-${ratio.toFixed(1)}%` : `+${Math.abs(ratio).toFixed(1)}%`;
  };

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="text-center mb-4 sm:mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-2xl md:text-3xl font-semibold text-neutral-100 mb-1 sm:mb-2">
          Compresseur Audio
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400">
          Réduisez la taille de vos fichiers audio en ajustant le bitrate
        </p>
      </div>

      {!file ? (
        /* Upload Area */
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full max-w-2xl min-h-[400px] border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center bg-neutral-950 hover:border-primary-500 hover:bg-neutral-900 transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="text-center p-12">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" className="mx-auto mb-6 text-neutral-400" strokeWidth="2">
                <path d="M32 16v32M16 32h32" strokeLinecap="round"/>
                <circle cx="32" cy="32" r="20" strokeLinecap="round"/>
              </svg>
              <h3 className="text-xl font-medium text-neutral-100 mb-2">Glissez-déposez un fichier audio</h3>
              <p className="text-neutral-400 mb-6">ou cliquez pour parcourir</p>
              <button className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors">
                Sélectionner un fichier
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>
      ) : (
        /* Compression Interface */
        <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* File Info Card */}
          <div className="bg-neutral-900 rounded-lg p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-neutral-100">Fichier sélectionné</h2>
              <button
                onClick={handleReset}
                className="text-neutral-400 hover:text-neutral-100 transition-colors"
                title="Changer de fichier"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            
            <div className="flex items-center gap-3 p-2 bg-neutral-950 rounded-lg">
              <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-500">
                  <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3"/>
                  <circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-neutral-100 text-sm font-medium truncate">{file.name}</p>
                <p className="text-neutral-400 text-xs">Taille originale: {formatFileSize(file.size)}</p>
              </div>
            </div>
          </div>

          {/* Bitrate Selection - Compact Grid */}
          <div className="bg-neutral-900 rounded-lg p-3 flex-shrink-0">
            <h2 className="text-sm font-medium text-neutral-100 mb-2">Niveau de compression</h2>
            <div className="grid grid-cols-5 gap-1.5">
              {BITRATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setBitrate(option.value)}
                  disabled={isProcessing}
                  className={`
                    flex flex-col items-center px-2 py-2 rounded-lg transition-all
                    ${bitrate === option.value
                      ? 'bg-primary-500 text-white shadow-lg'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <span className="text-sm font-medium">{option.value}</span>
                  <span className="text-xs opacity-70">kbps</span>
                </button>
              ))}
            </div>
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="bg-neutral-900 rounded-lg p-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-neutral-100 text-sm font-medium">{progressMessage}</span>
                <span className="text-primary-500 font-mono text-sm">{progress}%</span>
              </div>
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
                </svg>
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Result Card */}
          {compressedBlob && (
            <div className="bg-neutral-900 rounded-lg p-3 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h2 className="text-sm font-medium text-neutral-100">Compression réussie !</h2>
              </div>
              
              <div className="grid grid-cols-3 gap-2 p-2 bg-neutral-950 rounded-lg">
                <div className="text-center">
                  <p className="text-neutral-400 text-xs">Avant</p>
                  <p className="text-neutral-100 text-sm font-medium">{formatFileSize(file.size)}</p>
                </div>
                <div className="text-center">
                  <p className="text-neutral-400 text-xs">Après</p>
                  <p className="text-neutral-100 text-sm font-medium">{formatFileSize(compressedBlob.size)}</p>
                </div>
                <div className="text-center">
                  <p className="text-neutral-400 text-xs">Réduction</p>
                  <p className={`text-sm font-medium ${
                    compressedBlob.size < file.size ? 'text-green-500' : 'text-orange-500'
                  }`}>
                    {calculateCompressionRatio()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Spacer to push buttons to bottom */}
          <div className="flex-1 min-h-0" />

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-shrink-0">
            {!compressedBlob ? (
              <button
                onClick={handleCompress}
                disabled={isProcessing}
                className="col-span-full px-4 py-3 bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              >
                {isProcessing ? (
                  <>
                    <div className="spinner w-4 h-4"></div>
                    <span>Compression en cours...</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 8h12M4 12h12M7 4v12M13 4v12" strokeLinecap="round"/>
                    </svg>
                    <span>Compresser à {bitrate} kbps</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={handleReset}
                  className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-100 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round"/>
                  </svg>
                  <span>Nouveau fichier</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-3 bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10 3v11M10 14l-4-4M10 14l4-4" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 17h12" strokeLinecap="round"/>
                  </svg>
                  <span>Télécharger</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-neutral-900 rounded-xl p-8 text-center max-w-md mx-4 pointer-events-auto">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-neutral-100 mb-2">{progressMessage}</p>
            <p className="text-primary-500 font-mono text-lg">{progress}%</p>
          </div>
        </div>
      )}
    </div>
  );
};