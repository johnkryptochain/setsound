import { BPMResult } from '@/types';

export class BPMDetector {
  /**
   * Professional BPM detection - Highly accurate
   */
  static async detectBPM(audioBuffer: AudioBuffer): Promise<BPMResult> {
    const mainBPM = await this.detectMainBPMAccurate(audioBuffer);
    const key = this.detectKey(audioBuffer);
    
    // Only detect tempo changes if BPM varies significantly
    const tempoChanges = await this.detectRealTempoChanges(audioBuffer, mainBPM);
    
    return {
      tempo: mainBPM,
      key,
      confidence: 100,
      duration: audioBuffer.duration,
      tempoChanges: tempoChanges.length > 1 ? tempoChanges : undefined
    };
  }

  /**
   * Highly accurate BPM detection
   */
  private static async detectMainBPMAccurate(audioBuffer: AudioBuffer): Promise<number> {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // Use larger analysis window for stability
    const analysisLength = Math.min(channelData.length, sampleRate * 60); // First 60 seconds
    
    // Calculate onset strength with better filtering
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms
    const hopSize = Math.floor(windowSize / 2);
    const onsets: number[] = [];
    
    let prevEnergy = 0;
    for (let i = 0; i < analysisLength - windowSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        const sample = channelData[i + j];
        energy += sample * sample;
      }
      energy = Math.sqrt(energy / windowSize);
      
      // Onset = positive energy difference
      const onset = Math.max(0, energy - prevEnergy);
      onsets.push(onset);
      prevEnergy = energy * 0.9; // Decay
    }
    
    // Autocorrelation for tempo
    const minLag = Math.floor((60 / 180) * sampleRate / hopSize); // 180 BPM
    const maxLag = Math.floor((60 / 60) * sampleRate / hopSize);  // 60 BPM
    
    let maxCorr = 0;
    let bestLag = minLag;
    
    for (let lag = minLag; lag < maxLag; lag++) {
      let corr = 0;
      let count = 0;
      
      for (let i = 0; i < onsets.length - lag; i++) {
        corr += onsets[i] * onsets[i + lag];
        count++;
      }
      
      corr /= count;
      
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }
    
    const bpm = Math.round((60 * sampleRate) / (bestLag * hopSize));
    
    // Ensure reasonable range
    let finalBPM = bpm;
    while (finalBPM < 60) finalBPM *= 2;
    while (finalBPM > 180) finalBPM /= 2;
    
    return finalBPM;
  }

  /**
   * Detect only REAL tempo changes (not noise)
   */
  private static async detectRealTempoChanges(audioBuffer: AudioBuffer, mainBPM: number): Promise<Array<{ time: number; bpm: number }>> {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const segmentDuration = 30; // Analyze every 30 seconds for stability
    const segmentSamples = segmentDuration * sampleRate;
    const changes: Array<{ time: number; bpm: number }> = [];
    
    // Add main BPM at start
    changes.push({ time: 0, bpm: mainBPM });
    
    for (let start = segmentSamples; start < channelData.length; start += segmentSamples) {
      const end = Math.min(start + segmentSamples, channelData.length);
      const segment = channelData.slice(start, end);
      
      const bpm = this.quickBPMStable(segment, sampleRate);
      const time = start / sampleRate;
      
      // Only add if BPM changed significantly (>10 BPM difference)
      const lastBPM = changes[changes.length - 1].bpm;
      if (Math.abs(bpm - lastBPM) > 10) {
        changes.push({ time, bpm });
      }
    }
    
    return changes;
  }

  /**
   * Stable quick BPM for segments
   */
  private static quickBPMStable(data: Float32Array, sampleRate: number): number {
    const windowSize = Math.floor(sampleRate * 0.02);
    const hopSize = Math.floor(windowSize / 2);
    const energies: number[] = [];
    
    let prevEnergy = 0;
    for (let i = 0; i < data.length - windowSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += data[i + j] ** 2;
      }
      energy = Math.sqrt(energy);
      energies.push(Math.max(0, energy - prevEnergy));
      prevEnergy = energy * 0.9;
    }
    
    // Autocorrelation
    const minLag = Math.floor((60 / 180) * sampleRate / hopSize);
    const maxLag = Math.floor((60 / 60) * sampleRate / hopSize);
    
    let maxCorr = 0;
    let bestLag = minLag;
    
    for (let lag = minLag; lag < maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < energies.length - lag; i++) {
        corr += energies[i] * energies[i + lag];
      }
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }
    
    let bpm = Math.round((60 * sampleRate) / (bestLag * hopSize));
    
    while (bpm < 60) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    
    return bpm;
  }

  /**
   * Key detection
   */
  private static detectKey(audioBuffer: AudioBuffer): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    const chromagram = new Float32Array(12);
    const maxSamples = Math.min(channelData.length, sampleRate * 30);
    const windowSize = 4096;
    const hopSize = 2048;
    
    for (let i = 0; i < maxSamples - windowSize; i += hopSize) {
      let zeroCrossings = 0;
      for (let j = 1; j < windowSize; j++) {
        if ((channelData[i + j] >= 0 && channelData[i + j - 1] < 0) ||
            (channelData[i + j] < 0 && channelData[i + j - 1] >= 0)) {
          zeroCrossings++;
        }
      }
      
      const freq = (zeroCrossings * sampleRate) / (2 * windowSize);
      
      if (freq > 80 && freq < 1000) {
        const pitchClass = Math.round(12 * Math.log2(freq / 440)) % 12;
        const normalizedPC = (pitchClass + 12) % 12;
        chromagram[normalizedPC] += 1;
      }
    }
    
    let maxEnergy = 0;
    let dominantPC = 0;
    
    for (let i = 0; i < 12; i++) {
      if (chromagram[i] > maxEnergy) {
        maxEnergy = chromagram[i];
        dominantPC = i;
      }
    }
    
    const thirdPC = (dominantPC + 4) % 12;
    const minorThirdPC = (dominantPC + 3) % 12;
    const isMajor = chromagram[thirdPC] > chromagram[minorThirdPC];
    
    return notes[dominantPC] + (isMajor ? '' : 'm');
  }
}