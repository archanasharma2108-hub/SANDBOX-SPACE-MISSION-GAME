import React, { useState } from 'react';
import { MissionLogEntry, MissionLogSeverity } from '../game/types';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react';

interface MissionLogSidebarProps {
  entries: MissionLogEntry[];
  viewMode: '3d' | '2d';
}

const SEVERITY_STYLES: Record<
  MissionLogSeverity,
  { border: string; badge: string; title: string }
> = {
  info: {
    border: 'border-slate-800 bg-slate-900/75',
    badge: 'text-slate-400',
    title: 'text-slate-200'
  },
  action: {
    border: 'border-amber-500/35 bg-amber-500/10',
    badge: 'text-amber-300',
    title: 'text-amber-100'
  },
  milestone: {
    border: 'border-cyan-500/40 bg-cyan-500/10',
    badge: 'text-cyan-300',
    title: 'text-cyan-100'
  },
  success: {
    border: 'border-emerald-500/45 bg-emerald-500/15',
    badge: 'text-emerald-300',
    title: 'text-emerald-100'
  },
  danger: {
    border: 'border-rose-500/45 bg-rose-500/15',
    badge: 'text-rose-300',
    title: 'text-rose-100'
  }
};

export const MissionLogSidebar: React.FC<MissionLogSidebarProps> = ({
  entries,
  viewMode
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const ordered = [...entries].reverse();

  return (
    <aside
      data-testid="mission-log-sidebar"
      aria-label="Mission Log"
      className={`fixed right-4 z-20 bg-[#0B111E]/95 border border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden transition-all ${
        viewMode === '3d'
          ? 'top-20 w-72 max-h-[calc(100vh-14.5rem)]'
          : 'top-[344px] w-80 max-h-[calc(100vh-30.5rem)]'
      }`}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#080D18] border-b border-slate-800 hover:bg-slate-900/90 text-left shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ScrollText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Mission Log
          </span>
          <span className="text-[10px] font-mono text-slate-400 tabular-nums">
            ({entries.length})
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {!collapsed && (
        <ul className="p-2.5 space-y-1.5 overflow-y-auto flex-1 min-h-[120px]">
          {ordered.map((entry) => {
            const style = SEVERITY_STYLES[entry.severity];
            return (
              <li
                key={entry.id}
                className={`rounded-lg border px-2.5 py-2 text-xs ${style.border}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold leading-tight ${style.title}`}>
                    {entry.title}
                  </span>
                  <span
                    className={`font-mono text-[10px] tabular-nums shrink-0 ${style.badge}`}
                  >
                    {entry.timestampLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                  {entry.detail}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
