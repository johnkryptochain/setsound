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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-neutral-900 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 sm:mb-5 md:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-100">Exporter l'audio</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 sm:w-9 sm:h-9 md:w-8 md:h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 flex items-center justify-center transition-colors min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px]"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-4 sm:h-4">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="space-y-4 sm:space-y-5 md:space-y-6">
          {/* File name input - Touch-friendly */}
          <div>
            <label className="block text-xs sm:text-sm text-neutral-400 mb-2">Nom du fichier</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                className="flex-1 px-3 sm:px-4 py-3 bg-neutral-950 rounded-lg text-neutral-100 border border-neutral-700 focus:border-primary-500 focus:outline-none transition-colors text-sm sm:text-base min-h-[48px]"
                placeholder="Nom du fichier"
              />
              <div className="px-3 py-3 bg-neutral-950 rounded-lg text-neutral-400 border border-neutral-700 text-sm sm:text-base min-h-[48px] flex items-center">
                .{format}
              </div>
            </div>
          </div>

          {/* Format selection - Touch-friendly */}
          <div>
            <label className="block text-xs sm:text-sm text-neutral-400 mb-2 sm:mb-3">Format audio</label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button
                onClick={() => setFormat('wav')}
                className={`px-3 sm:px-4 py-3 rounded-lg font-medium transition-all min-h-[56px] active:scale-95 ${
                  format === 'wav'
                    ? 'bg-primary-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600'
                }`}
              >
                <div className="text-base sm:text-lg font-bold">WAV</div>
                <div className="text-xs opacity-80">Sans perte</div>
              </button>
              <button
                onClick={() => setFormat('mp3')}
                className={`px-3 sm:px-4 py-3 rounded-lg font-medium transition-all min-h-[56px] active:scale-95 ${
                  format === 'mp3'
                    ? 'bg-primary-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600'
                }`}
              >
                <div className="text-base sm:text-lg font-bold">MP3</div>
                <div className="text-xs opacity-80">Compressé</div>
              </button>
              <button
                onClick={() => setFormat('flac')}
                className={`px-3 sm:px-4 py-3 rounded-lg font-medium transition-all min-h-[56px] active:scale-95 ${
                  format === 'flac'
                    ? 'bg-primary-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600'
                }`}
              >
                <div className="text-base sm:text-lg font-bold">FLAC</div>
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

          {/* Export button - Touch-friendly */}
          <button
            onClick={handleExport}
            className="w-full px-4 sm:px-6 py-3 sm:py-4 bg-[#8286ef] hover:bg-[#6b6fdb] active:bg-[#5a5ec7] text-white rounded-lg sm:rounded-xl font-medium transition-colors flex items-center justify-center gap-2 sm:gap-3 shadow-lg text-sm sm:text-base min-h-[52px]"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" className="sm:w-5 sm:h-5">
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