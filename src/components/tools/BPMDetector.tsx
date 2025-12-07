// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState, useRef } from 'react';
import { AudioUtils } from '@/utils/audioUtils';
import { BPMDetector as BPMDetectorUtil } from '@/utils/bpmDetector';
import { BPMResult } from '@/types';

interface BPMDetectorProps {
  audioContext: AudioContext;
}

export const BPMDetector = ({ audioContext: _audioContext }: BPMDetectorProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<BPMResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsAnalyzing(true);
      setResult(null);

      const buffer = await AudioUtils.loadAudioFile(file);
      const bpmResult = await BPMDetectorUtil.detectBPM(buffer);
      
      setResult(bpmResult);
      setIsAnalyzing(false);
    } catch (error) {
      console.error('Error analyzing BPM:', error);
      alert('Erreur lors de l\'analyse');
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 md:p-8">
      <div className="text-center mb-4 sm:mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-2xl md:text-3xl font-semibold text-neutral-100 mb-1 sm:mb-2">Détecteur BPM & Ton</h1>
        <p className="text-xs sm:text-sm text-neutral-400">Analysez le tempo et la tonalité de vos fichiers audio</p>
      </div>

      {!result ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full max-w-2xl min-h-[400px] border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center bg-neutral-950 hover:border-primary-500 hover:bg-neutral-900 transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center p-12">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-6 text-neutral-400">
                <circle cx="32" cy="32" r="24" strokeLinecap="round"/>
                <path d="M16 32h8l4-8 4 16 4-8h8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h3 className="text-xl font-medium text-neutral-100 mb-2">Analysez un fichier audio</h3>
              <p className="text-neutral-400 mb-6">Détection automatique du BPM et de la tonalité</p>
              <button className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors">
                Choisir un fichier
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wma,audio/x-ms-wma"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 sm:gap-5 md:gap-6">
          <div className="bg-neutral-900 rounded-lg sm:rounded-xl p-4 sm:p-6 md:p-8">
            <h3 className="text-xl sm:text-2xl font-semibold text-neutral-100 mb-4 sm:mb-6 md:mb-8 text-center">
              Résultats de l'analyse
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
              <div className="bg-neutral-950 rounded-lg p-4 sm:p-5 md:p-6 border border-neutral-700 text-center">
                <div className="text-xs sm:text-sm text-neutral-400 mb-1 sm:mb-2">Tempo (BPM)</div>
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary-500">{result.tempo}</div>
              </div>

              <div className="bg-neutral-950 rounded-lg p-4 sm:p-5 md:p-6 border border-neutral-700 text-center">
                <div className="text-xs sm:text-sm text-neutral-400 mb-1 sm:mb-2">Tonalité</div>
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary-500">{result.key}</div>
              </div>

              <div className="bg-neutral-950 rounded-lg p-4 sm:p-5 md:p-6 border border-neutral-700 text-center">
                <div className="text-xs sm:text-sm text-neutral-400 mb-1 sm:mb-2">Durée</div>
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary-500">
                  {AudioUtils.formatTime(result.duration)}
                </div>
              </div>
            </div>

            <div className="bg-neutral-950 rounded-lg p-6 border border-neutral-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-neutral-100">Confiance de l'analyse:</span>
                <span className="text-primary-500 font-semibold text-xl">{result.confidence}%</span>
              </div>
              <div className="w-full h-3 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 via-primary-500 to-primary-600 transition-all duration-1000"
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tempo Changes Timeline */}
          {result.tempoChanges && result.tempoChanges.length > 1 && (
            <div className="bg-neutral-900 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-neutral-100 mb-4">
                Changements de tempo détectés
              </h3>
              <div className="space-y-2">
                {result.tempoChanges.map((change, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-neutral-950 rounded-lg border border-neutral-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-neutral-100 font-medium">
                          À {AudioUtils.formatTime(change.time)}
                        </div>
                        <div className="text-xs text-neutral-400">
                          Position dans le morceau
                        </div>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-primary-500">
                      {change.bpm} BPM
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setResult(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="w-full px-4 sm:px-6 py-3 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-neutral-100 rounded-lg sm:rounded-xl transition-colors text-sm sm:text-base min-h-[48px]"
          >
            Analyser un autre fichier
          </button>
        </div>
      )}

      {isAnalyzing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-neutral-900 rounded-xl p-8 text-center">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-neutral-100 text-lg mb-2">Analyse en cours...</p>
            <p className="text-neutral-400 text-sm">Détection du tempo et des changements</p>
          </div>
        </div>
      )}
    </div>
  );
};