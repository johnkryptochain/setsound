// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AudioCutter } from './components/tools/AudioCutter';
import { AudioJoiner } from './components/tools/AudioJoiner';
import { BPMDetector } from './components/tools/BPMDetector';
import { AudioRecorder } from './components/tools/AudioRecorder';
import { AudioConverter } from './components/tools/AudioConverter';
import { AudioCompressor } from './components/tools/AudioCompressor';
import { ToolType } from './types';
import { useAudioContext } from './hooks/useAudioContext';

function App() {
  const [currentTool, setCurrentTool] = useState<ToolType>('cutter');
  // Auto-hide sidebar on mobile, show on desktop
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 769);
  const { audioContext, isReady, resumeContext } = useAudioContext();

  const handleToolChange = async (tool: ToolType) => {
    setCurrentTool(tool);
    // Resume audio context if suspended (required by browsers)
    await resumeContext();
  };

  const renderTool = () => {
    if (!isReady || !audioContext) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-neutral-400">Initialisation de l'audio...</p>
          </div>
        </div>
      );
    }

    switch (currentTool) {
      case 'cutter':
        return <AudioCutter audioContext={audioContext} />;
      case 'joiner':
        return <AudioJoiner audioContext={audioContext} />;
      case 'bpm':
        return <BPMDetector audioContext={audioContext} />;
      case 'recorder':
        return <AudioRecorder audioContext={audioContext} />;
      case 'converter':
        return <AudioConverter audioContext={audioContext} />;
      case 'compressor':
        return <AudioCompressor audioContext={audioContext} />;
      default:
        return <AudioCutter audioContext={audioContext} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950">
      <Sidebar
        currentTool={currentTool}
        onToolChange={handleToolChange}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      
      {/* Overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${
        sidebarOpen ? 'md:ml-[280px]' : 'ml-0'
      }`}>
        {/* Toggle Button - Mobile friendly */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-4 left-4 z-40 w-12 h-12 md:w-10 md:h-10 rounded-lg bg-neutral-800/80 hover:bg-neutral-700/90 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg"
            title="Afficher le panneau"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="md:w-4 md:h-4">
              <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        
        {renderTool()}
      </main>
    </div>
  );
}

export default App;