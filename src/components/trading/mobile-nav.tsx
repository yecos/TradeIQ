'use client';

import { TrendingUp, Activity, Target, Wallet, Settings } from 'lucide-react';

interface MobileNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  pendingTradesCount?: number;
}

const tabs = [
  { id: 'chart', label: 'Grafico', Icon: TrendingUp },
  { id: 'analysis', label: 'Analisis', Icon: Activity },
  { id: 'tracker', label: 'Tracker', Icon: Target },
  { id: 'portfolio', label: 'Portafolio', Icon: Wallet },
  { id: 'settings', label: 'Ajustes', Icon: Settings },
];

export function MobileNav({ activeTab, onTabChange, pendingTradesCount }: MobileNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-slate-800 md:hidden z-50 safe-area-pb">
      <div className="flex justify-around items-center h-14">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors min-h-[44px] min-w-[44px] ${
                isActive
                  ? 'text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              aria-label={tab.label}
              aria-pressed={isActive}
            >
              <tab.Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
              {tab.id === 'tracker' && pendingTradesCount && pendingTradesCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-[7px] font-bold text-black">{pendingTradesCount > 9 ? '9+' : pendingTradesCount}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
