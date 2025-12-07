import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Singleton FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;
let loadPromise: Promise<FFmpeg> | null = null;

// Formats that browsers typically cannot decode natively and need FFmpeg conversion
// These will be converted to WAV before processing
const UNSUPPORTED_FORMATS = [
  // Windows Media Audio
  'audio/x-ms-wma',
  'audio/wma',
  'audio/x-wma',
  // RealAudio
  'audio/x-realaudio',
  'audio/x-pn-realaudio',
  'audio/vnd.rn-realaudio',
  // Monkey's Audio (APE)
  'audio/x-ape',
  'audio/ape',
  // WavPack
  'audio/x-wavpack',
  'audio/wavpack',
  // Musepack
  'audio/x-musepack',
  'audio/musepack',
  // AC3/DTS (Dolby/DTS surround)
  'audio/ac3',
  'audio/x-ac3',
  'audio/x-dts',
  'audio/dts',
  // ALAC (Apple Lossless) - some browsers don't support
  'audio/x-alac',
  'audio/alac',
  // AMR (Adaptive Multi-Rate)
  'audio/amr',
  'audio/amr-wb',
  // TTA (True Audio)
  'audio/x-tta',
  // Shorten
  'audio/x-shorten',
];

const UNSUPPORTED_EXTENSIONS = [
  // Windows Media
  '.wma',
  '.wmv',
  '.asf',
  // RealAudio
  '.ra',
  '.rm',
  '.ram',
  // Lossless formats with limited browser support
  '.ape',
  '.wv',
  '.tta',
  '.shn',
  // Surround sound formats
  '.ac3',
  '.dts',
  // Other formats
  '.mpc',
  '.mpp',
  '.mp+',
  // Some ALAC files
  '.alac',
];

export interface ConversionProgress {
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: ConversionProgress) => void;

/**
 * Check if a file format needs conversion before decoding
 */
export function needsConversion(file: File): boolean {
  // Check by MIME type
  if (UNSUPPORTED_FORMATS.includes(file.type.toLowerCase())) {
    return true;
  }
  
  // Check by file extension
  const fileName = file.name.toLowerCase();
  for (const ext of UNSUPPORTED_EXTENSIONS) {
    if (fileName.endsWith(ext)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get the FFmpeg instance, initializing it if necessary (lazy loading)
 */
export async function getFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  // Return existing instance if available
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  
  // If already loading, wait for the existing promise
  if (isLoading && loadPromise) {
    return loadPromise;
  }
  
  // Start loading
  isLoading = true;
  
  loadPromise = (async () => {
    onProgress?.({ progress: 0, message: 'Initializing audio converter...' });
    
    const ffmpeg = new FFmpeg();
    
    // Set up progress handler for FFmpeg operations
    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.({ 
        progress: Math.round(progress * 100), 
        message: 'Converting audio...' 
      });
    });
    
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });
    
    onProgress?.({ progress: 10, message: 'Loading FFmpeg core...' });
    
    // Load FFmpeg with WASM files from CDN
    // Using unpkg CDN for the core files
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      onProgress?.({ progress: 100, message: 'FFmpeg loaded successfully' });
      
      ffmpegInstance = ffmpeg;
      isLoading = false;
      
      return ffmpeg;
    } catch (error) {
      isLoading = false;
      loadPromise = null;
      throw new Error(`Failed to load FFmpeg: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  })();
  
  return loadPromise;
}

/**
 * Convert an unsupported audio file to WAV format
 */
export async function convertToWav(
  file: File, 
  onProgress?: ProgressCallback
): Promise<Blob> {
  onProgress?.({ progress: 0, message: 'Preparing conversion...' });
  
  // Get FFmpeg instance
  const ffmpeg = await getFFmpeg(onProgress);
  
  // Generate unique filenames to avoid conflicts
  const inputFileName = `input_${Date.now()}${getFileExtension(file.name)}`;
  const outputFileName = `output_${Date.now()}.wav`;
  
  try {
    onProgress?.({ progress: 20, message: 'Loading audio file...' });
    
    // Write input file to FFmpeg's virtual filesystem
    const inputData = await fetchFile(file);
    await ffmpeg.writeFile(inputFileName, inputData);
    
    onProgress?.({ progress: 30, message: 'Converting to WAV...' });
    
    // Convert to WAV format
    // Using PCM 16-bit, 44.1kHz stereo for maximum compatibility
    await ffmpeg.exec([
      '-i', inputFileName,
      '-vn',                    // No video
      '-acodec', 'pcm_s16le',   // PCM 16-bit little-endian
      '-ar', '44100',           // 44.1kHz sample rate
      '-ac', '2',               // Stereo
      outputFileName
    ]);
    
    onProgress?.({ progress: 90, message: 'Finalizing...' });
    
    // Read the output file
    const outputData = await ffmpeg.readFile(outputFileName);
    
    // Clean up virtual filesystem
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    onProgress?.({ progress: 100, message: 'Conversion complete!' });
    
    // Convert to Blob - handle both Uint8Array and string types from FFmpeg
    let wavBlob: Blob;
    if (typeof outputData === 'string') {
      // If string, convert to blob via text encoder
      const encoder = new TextEncoder();
      wavBlob = new Blob([encoder.encode(outputData)], { type: 'audio/wav' });
    } else {
      // Uint8Array - copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
      const buffer = new ArrayBuffer(outputData.byteLength);
      new Uint8Array(buffer).set(outputData);
      wavBlob = new Blob([buffer], { type: 'audio/wav' });
    }
    return wavBlob;
    
  } catch (error) {
    // Clean up on error
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch { /* ignore */ }
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch { /* ignore */ }
    
    throw new Error(`Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot).toLowerCase();
}

/**
 * Check if FFmpeg is already loaded
 */
export function isFFmpegLoaded(): boolean {
  return ffmpegInstance !== null && ffmpegInstance.loaded;
}

/**
 * Preload FFmpeg (can be called early to improve UX)
 */
export async function preloadFFmpeg(onProgress?: ProgressCallback): Promise<void> {
  await getFFmpeg(onProgress);
}