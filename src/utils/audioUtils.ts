// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

export class AudioUtils {
  static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  static async loadAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    return await audioContext.decodeAudioData(arrayBuffer);
  }

  static generateWaveformData(audioBuffer: AudioBuffer, width: number): Float32Array {
    const rawData = audioBuffer.getChannelData(0);
    const samples = width;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[blockStart + j] || 0);
      }
      filteredData[i] = sum / blockSize;
    }

    // Normalize
    const max = Math.max(...Array.from(filteredData));
    for (let i = 0; i < filteredData.length; i++) {
      filteredData[i] = filteredData[i] / max;
    }

    return filteredData;
  }

  static async trimAudioBuffer(
    audioBuffer: AudioBuffer,
    startTime: number,
    endTime: number
  ): Promise<AudioBuffer> {
    const audioContext = new AudioContext();
    const sampleRate = audioBuffer.sampleRate;
    
    // Ensure valid time range
    const validStartTime = Math.max(0, Math.min(startTime, audioBuffer.duration));
    const validEndTime = Math.max(validStartTime, Math.min(endTime, audioBuffer.duration));
    
    const startSample = Math.floor(validStartTime * sampleRate);
    const endSample = Math.floor(validEndTime * sampleRate);
    const newLength = Math.max(1, endSample - startSample); // Ensure at least 1 sample

    const newBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      newLength,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      for (let i = 0; i < newLength; i++) {
        newData[i] = oldData[startSample + i] || 0;
      }
    }

    return newBuffer;
  }

  static async applyFade(
    audioBuffer: AudioBuffer,
    fadeIn: boolean,
    fadeOut: boolean,
    fadeDuration: number = 1.0
  ): Promise<AudioBuffer> {
    const audioContext = new AudioContext();
    const sampleRate = audioBuffer.sampleRate;
    const fadeSamples = Math.floor(fadeDuration * sampleRate);
    
    const newBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);

      for (let i = 0; i < audioBuffer.length; i++) {
        let gain = 1.0;

        // Apply fade in
        if (fadeIn && i < fadeSamples) {
          gain = i / fadeSamples;
        }

        // Apply fade out
        if (fadeOut && i > audioBuffer.length - fadeSamples) {
          gain = (audioBuffer.length - i) / fadeSamples;
        }

        outputData[i] = inputData[i] * gain;
      }
    }

    return newBuffer;
  }

  static async mergeAudioBuffers(buffers: AudioBuffer[]): Promise<AudioBuffer> {
    if (buffers.length === 0) {
      throw new Error('No buffers to merge');
    }

    const audioContext = new AudioContext();
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels));
    
    // Calculate total length
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);

    const mergedBuffer = audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    let offset = 0;
    for (const buffer of buffers) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const outputData = mergedBuffer.getChannelData(channel);
        const inputData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        
        for (let i = 0; i < buffer.length; i++) {
          outputData[offset + i] = inputData[i];
        }
      }
      offset += buffer.length;
    }

    return mergedBuffer;
  }

  static async mixAudioBuffers(buffers: AudioBuffer[]): Promise<AudioBuffer> {
    if (buffers.length === 0) {
      throw new Error('No buffers to mix');
    }

    const audioContext = new AudioContext();
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels));
    
    // Find the longest buffer duration
    const maxLength = Math.max(...buffers.map(b => b.length));

    const mixedBuffer = audioContext.createBuffer(
      numberOfChannels,
      maxLength,
      sampleRate
    );

    // Mix all buffers together (parallel, not sequential)
    for (const buffer of buffers) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const outputData = mixedBuffer.getChannelData(channel);
        const inputData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        
        for (let i = 0; i < buffer.length; i++) {
          // Add samples together (mixing)
          outputData[i] = (outputData[i] || 0) + inputData[i];
        }
      }
    }

    // Normalize to prevent clipping
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const data = mixedBuffer.getChannelData(channel);
      let peak = 0;
      
      for (let i = 0; i < maxLength; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
      
      if (peak > 1.0) {
        const gain = 1.0 / peak;
        for (let i = 0; i < maxLength; i++) {
          data[i] *= gain;
        }
      }
    }

    return mixedBuffer;
  }

  static async normalizeAudioBuffer(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
    const audioContext = new AudioContext();
    const newBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);
      
      // Find peak
      let peak = 0;
      for (let i = 0; i < inputData.length; i++) {
        peak = Math.max(peak, Math.abs(inputData[i]));
      }

      // Normalize
      const gain = peak > 0 ? 1.0 / peak : 1.0;
      for (let i = 0; i < inputData.length; i++) {
        outputData[i] = inputData[i] * gain;
      }
    }

    return newBuffer;
  }

  static audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const data = new Float32Array(audioBuffer.length * numberOfChannels);
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < audioBuffer.length; i++) {
        data[i * numberOfChannels + channel] = channelData[i];
      }
    }

    const dataLength = data.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Write audio data
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}