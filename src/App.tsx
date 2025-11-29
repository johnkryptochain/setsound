import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AudioCutter } from './components/tools/AudioCutter';
import { AudioJoiner } from './components/tools/AudioJoiner';
import { BPMDetector } from './components/tools/BPMDetector';
import { AudioRecorder } from './components/tools/AudioRecorder';
import { ToolType } from './types';
import { useAudioContext } from './hooks/useAudioContext';

function App() {
  const [currentTool, setCurrentTool] = useState<ToolType>('cutter');
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'ml-[280px]' : 'ml-0'}`}>
        {/* Toggle Button - Même design que dans la sidebar */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-4 left-4 z-40 w-8 h-8 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/70 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105"
            title="Afficher le panneau"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        
        {renderTool()}
      </main>
    </div>
  );
}

export default App;