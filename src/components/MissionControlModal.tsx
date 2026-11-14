import React, { useState } from 'react';
import { MISSIONS } from '../game/missions';
import { PLANETS } from '../game/planets';
import { MissionCategory, MissionDefinition } from '../game/types';
import { BookOpen, Globe2, HelpCircle, Moon, Rocket, Satellite } from 'lucide-react';

interface MissionControlModalProps {
  selectedMissionId: string;
  completedMissionIds: string[];
  onSelectMission: (missionId: string) => void;
  onStartMission: (missionId: string) => void;
  onOpenTutorial: () => void;
  isModalOverlay?: boolean;
  onClose?: () => void;
}

const CATEGORY_TABS: { id: MissionCategory; label: string; count: number }[] = [
  { id: 'satellite', label: 'Major Satellites', count: 4 },
  { id: 'moon', label: 'Moon Missions', count: 12 },
  { id: 'mars', label: 'Mars Missions', count: 4 },
  { id: 'venus', label: 'Venus Missions', count: 7 }
];

export const MissionControlModal: React.FC<MissionControlModalProps> = ({
  selectedMissionId,
  completedMissionIds,
  onSelectMission,
  onStartMission,
  onOpenTutorial,
  isModalOverlay = false,
  onClose
}) => {
  const initialMission =
    MISSIONS.find((m) => m.id === selectedMissionId) ?? MISSIONS[0];
  const [activeTab, setActiveTab] = useState<MissionCategory>(initialMission.category);

  const filtered = MISSIONS.filter((m) => m.category === activeTab);
  const current: MissionDefinition =
    MISSIONS.find((m) => m.id === selectedMissionId) ?? filtered[0] ?? MISSIONS[0];
  const planet = PLANETS[current.targetBody];

  const getTabIcon = (cat: MissionCategory) => {
    switch (cat) {
      case 'satellite':
        return <Satellite className="w-3.5 h-3.5" />;
      case 'moon':
        return <Moon className="w-3.5 h-3.5" />;
      case 'mars':
      case 'venus':
        return <Globe2 className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div
      className={`${
        isModalOverlay
          ? 'fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 md:p-8'
          : 'relative z-20 w-full h-full flex items-center justify-end p-4 md:p-8'
      }`}
    >
      <div
        className={`w-full ${
          isModalOverlay ? 'max-w-6xl' : 'max-w-4xl'
        } max-h-[90vh] bg-[#0B111E]/90 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden`}
      >
        {/* Title Lockup Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-800 bg-[#080D18]">
          <div className="flex items-center gap-3.5">
            <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="#0F172A" stroke="#06B6D4" strokeWidth="1.5" />
              <ellipse
                cx="20"
                cy="20"
                rx="16"
                ry="6"
                transform="rotate(-24 20 20)"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
              />
              <path d="M20 8 L24 24 L20 21 L16 24 Z" fill="#F8FAFC" />
              <circle cx="20" cy="28" r="2.2" fill="#38BDF8" />
            </svg>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                Orbital Horizon 2026
              </h1>
              <p className="text-xs text-slate-400">
                2026 NASA Space Mission Architect · 3D Spacecraft Design &amp; Flight Simulator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">
              Completed {completedMissionIds.length} / {MISSIONS.length}
            </span>
            <button
              type="button"
              onClick={onOpenTutorial}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              Interactive Tutorial
            </button>
            {isModalOverlay && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="flex items-center gap-1.5 px-6 py-3 border-b border-slate-800 bg-[#090F1B] overflow-x-auto">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                const first = MISSIONS.find((m) => m.category === tab.id);
                if (first) onSelectMission(first.id);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {getTabIcon(tab.id)}
              <span>{tab.label}</span>
              <span className="font-mono opacity-75">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Two-Column Split: Mission List (Left) + Engineering & Historical Briefing (Right) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto p-4 space-y-2">
            {filtered.map((m) => {
              const isSelected = m.id === current.id;
              const isDone = completedMissionIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMission(m.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-400 text-white'
                      : 'bg-slate-900/75 border-slate-800/90 text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      {m.year} — {m.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {isDone ? '✓ Cleared' : m.agency}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {m.historicalSignificance}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 overflow-y-auto p-6 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-cyan-400">
                    {current.year} · {current.agency} · Target: {planet.name}
                  </div>
                  <h2 className="text-2xl font-bold text-white mt-0.5">{current.name}</h2>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-mono text-slate-400">MISSION BUDGET</div>
                  <div className="text-xl font-mono font-bold text-amber-400 tabular-nums">
                    ${current.budget.toLocaleString()}k
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                  <BookOpen className="w-3.5 h-3.5" />
                  Historical Record &amp; Mission Objective
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {current.historicalSignificance}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">{current.summary}</p>
              </div>

              {/* Competing Demands & Planetary Constraints Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">MIN DELTA-V</div>
                  <div className="text-base font-mono font-semibold text-white tabular-nums">
                    {current.requirements.minDeltaV.toLocaleString()} m/s
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">GRAVITY</div>
                  <div className="text-base font-mono font-semibold text-white tabular-nums">
                    {planet.surfaceGravity.toFixed(2)} m/s²
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">ATMO ENDS</div>
                  <div className="text-base font-mono font-semibold text-cyan-300 tabular-nums">
                    {planet.atmosphereHeightMeters > 0
                      ? `${planet.atmosphereHeightMeters / 1000} km`
                      : 'Vacuum'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">COMMS RANGE</div>
                  <div className="text-base font-mono font-semibold text-amber-300 tabular-nums">
                    {current.requirements.minCommsAU} AU
                  </div>
                </div>
              </div>

              {/* Transfer Window & Hardware Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                  <div className="font-mono text-[11px] text-slate-400">
                    ORBITAL TRANSFER WINDOW
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Launch Window:</span>
                    <span className="font-mono text-white">
                      Day {current.transferWindow.optimalDay} · {current.transferWindow.optimalTimeUtc}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Entry Orbit:</span>
                    <span className="font-mono text-emerald-400">
                      {current.transferWindow.entryOrbitKm} km
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transit Time:</span>
                    <span className="font-mono text-slate-200">
                      {current.transferWindow.flightDurationDays} days
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                  <div className="font-mono text-[11px] text-slate-400">
                    REQUIRED HARDWARE &amp; SCIENCE
                  </div>
                  <div className="text-slate-200 leading-relaxed">
                    {current.requirements.requiredScience?.length
                      ? `Science: ${current.requirements.requiredScience
                          .filter((s): s is NonNullable<typeof s> => Boolean(s))
                          .map((s) => s.replace('_', ' '))
                          .join(', ')}`
                      : 'Standard spacecraft telemetry'}
                  </div>
                  <div className="text-slate-400">
                    {[
                      current.requirements.requiresHeatShield && 'Heat Shield',
                      current.requirements.requiresLandingLegs && 'Landing Legs',
                      current.requirements.requiresParachute && 'Parachute'
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No special entry gear required'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                Press <span className="font-mono text-slate-200">Enter</span> or click below to enter 3D Rocket Assembly
              </div>
              <button
                type="button"
                data-start="true"
                onClick={() => onStartMission(current.id)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Rocket className="w-4 h-4" />
                Enter 3D Assembly &amp; Launch
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
