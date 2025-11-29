import { ToolType } from '@/types';

interface SidebarProps {
  currentTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const tools = [
  {
    id: 'cutter' as ToolType,
    name: 'Coupeur',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="8" width="7" height="4" rx="1" strokeLinecap="round"/>
        <rect x="11" y="8" width="7" height="4" rx="1" strokeLinecap="round"/>
        <path d="M9 10h2" strokeLinecap="round" strokeWidth="2"/>
        <path d="M5.5 8V6M14.5 8V6M5.5 12V14M14.5 12V14" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'joiner' as ToolType,
    name: 'Fusionneur',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="6" height="6" rx="1" strokeLinecap="round"/>
        <rect x="11" y="3" width="6" height="6" rx="1" strokeLinecap="round"/>
        <rect x="7" y="11" width="6" height="6" rx="1" strokeLinecap="round"/>
        <path d="M6 9V11M14 9V11M10 9V11" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'bpm' as ToolType,
    name: 'BPM Détecteur',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 10h3l2-4 2 8 2-4h3" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="10" cy="10" r="8" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'recorder' as ToolType,
    name: 'Enregistreur',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3" strokeLinecap="round"/>
        <path d="M6 7v2c0 2.2 1.8 4 4 4s4-1.8 4-4V7" strokeLinecap="round"/>
        <path d="M10 13v4M7 17h6" strokeLinecap="round"/>
      </svg>
    )
  }
];

export const Sidebar = ({ currentTool, onToolChange, isOpen, onToggle }: SidebarProps) => {
  return (
    <aside className={`w-[280px] bg-neutral-900 border-r border-neutral-800 flex flex-col fixed h-screen left-0 top-0 z-50 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#8286ef"/>
              <circle cx="16" cy="16" r="10" fill="white" fillOpacity="0.15"/>
              <path d="M14 10v12l8-6z" fill="white"/>
              <circle cx="14" cy="16" r="1.5" fill="white"/>
            </svg>
            <span className="text-xl font-semibold text-primary-500">setsound</span>
          </div>
          
          {/* Toggle button - Design 2025 minimaliste */}
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/70 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105"
            title="Masquer le panneau"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      
      <nav className="flex-1 py-6">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className={`
              w-full flex items-center gap-4 px-6 py-4 
              transition-all duration-200
              ${currentTool === tool.id 
                ? 'bg-primary-500 text-white' 
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
              }
            `}
          >
            {tool.icon}
            <span className="font-medium">{tool.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};