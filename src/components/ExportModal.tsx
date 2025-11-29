import { useState } from 'react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: string, bitrate: number, customFileName?: string) => void;
  fileName: string;
}

export const ExportModal = ({ isOpen, onClose, onExport, fileName }: ExportModalProps) => {
  const [format, setFormat] = useState<'wav' | 'mp3' | 'flac'>('wav');
  const [bitrate, setBitrate] = useState(320);
  const [customFileName, setCustomFileName] = useState(fileName.replace(/\.[^/.]+$/, '') + '_exported');

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(format, bitrate, customFileName);
    onClose();
  };

  const bitrateOptions = {
    mp3: [128, 192, 256, 320],
    wav: [1411], // CD quality
    flac: [1411]
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-neutral-100">Exporter l'audio</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* File name input */}
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Nom du fichier</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                className="flex-1 px-4 py-3 bg-neutral-950 rounded-lg text-neutral-100 border border-neutral-700 focus:border-primary-500 focus:outline-none transition-colors"
                placeholder="Nom du fichier"
              />
              <div className="px-3 py-3 bg-neutral-950 rounded-lg text-neutral-400 border border-neutral-700">
                .{format}
              </div>
            </div>
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-sm text-neutral-400 mb-3">Format audio</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setFormat('wav')}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  format === 'wav'
                    ? 'bg-primary-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                <div className="text-lg font-bold">WAV</div>
                <div className="text-xs opacity-80">Sans perte</div>
              </button>
              <button
                onClick={() => setFormat('mp3')}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  format === 'mp3'
                    ? 'bg-primary-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                <div className="text-lg font-bold">MP3</div>
                <div className="text-xs opacity-80">Compressé</div>
              </button>
              <button
                onClick={() => setFormat('flac')}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  format === 'flac'
                    ? 'bg-primary-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                <div className="text-lg font-bold">FLAC</div>
                <div className="text-xs opacity-80">Lossless</div>
              </button>
            </div>
          </div>

          {/* Bitrate selection */}
          <div>
            <label className="block text-sm text-neutral-400 mb-3">
              Qualité {format === 'mp3' ? '(Bitrate)' : ''}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {bitrateOptions[format].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setBitrate(rate)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    bitrate === rate
                      ? 'bg-primary-500 text-white'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {rate} kbps
                  {rate === 320 && format === 'mp3' && <span className="text-xs ml-1">(Max)</span>}
                  {rate === 1411 && <span className="text-xs ml-1">(CD)</span>}
                </button>
              ))}
            </div>
          </div>

          {/* File size estimate */}
          <div className="bg-neutral-950 rounded-lg p-4 border border-neutral-700">
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-400">Taille estimée :</span>
              <span className="text-neutral-100 font-medium">
                {format === 'wav' || format === 'flac' ? '~10-50 MB' : `~${Math.round(bitrate / 10)} MB`}
              </span>
            </div>
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            className="w-full px-6 py-4 bg-[#8286ef] hover:bg-[#6b6fdb] text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-3 shadow-lg"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 3v11M10 14l-4-4M10 14l4-4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 17h12" strokeLinecap="round"/>
            </svg>
            <span>Exporter en {format.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};