// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

export type ToolType = 'cutter' | 'joiner' | 'bpm' | 'recorder' | 'converter' | 'compressor';

export interface AudioTrack {
  id: string;
  file: File;
  buffer: AudioBuffer;
  duration: number;
  name: string;
}

export interface WaveformData {
  data: Float32Array;
  peaks: number[];
  duration: number;
}

export interface TimeMarker {
  time: number;
  position: number;
}

export interface BPMResult {
  tempo: number;
  key: string;
  confidence: number;
  duration: number;
  tempoChanges?: Array<{ time: number; bpm: number }>;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  blob: Blob | null;
}

export interface AudioProcessingOptions {
  normalize?: boolean;
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeDuration?: number;
}

export interface ExportOptions {
  format: 'mp3' | 'wav' | 'flac' | 'aac' | 'ogg';
  quality: 'low' | 'medium' | 'high';
  bitrate?: number;
}

export interface CutterState {
  audioBuffer: AudioBuffer | null;
  startMarker: TimeMarker;
  endMarker: TimeMarker;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
}

export interface JoinerState {
  tracks: AudioTrack[];
  isProcessing: boolean;
  resultBuffer: AudioBuffer | null;
}

export interface RecorderSettings {
  audioSource: 'microphone' | 'system';
  quality: 'low' | 'medium' | 'high';
  sampleRate: number;
}

export interface AudioSegment {
  id: string;
  buffer: AudioBuffer;
  startTime: number;
  endTime: number;
  selected: boolean;
}

export interface CutterHistoryState {
  segments: AudioSegment[];
  zoom: number;
}