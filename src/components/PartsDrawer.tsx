import React, { useState } from 'react';
import { PART_CATEGORIES, PARTS_CATALOG } from '../game/partsCatalog';
import { calculateCashBack } from '../game/physics';
import { PartCategory, PartDefinition } from '../game/types';
import { PartThumbnail } from './PartThumbnail';
import { Box, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

interface PartsDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onStartDragNewPart: (partId: string) => void;
  onQuickAddPart: (partId: string) => void;
  draggingPartId: string | null;
  draggingInstanceId: string | null;
  onDropInRecycleBin: () => void;
  lastCashbackMsg: string | null;
}

export const PartsDrawer: React.FC<PartsDrawerProps> = ({
  isOpen,
  onToggleOpen,
  onStartDragNewPart,
  onQuickAddPart,
  draggingPartId,
  draggingInstanceId,
  onDropInRecycleBin,
  lastCashbackMsg
}) => {
  const [activeCategory, setActiveCategory] = useState<PartCategory>('command');
  const [binHover, setBinHover] = useState(false);

  const filteredParts = PARTS_CATALOG.filter((p) => p.category === activeCategory);
  const activeDragCashback =
    draggingInstanceId && draggingPartId ? calculateCashBack(draggingPartId) : 0;

  return (
    <>
      {/* Compact Small Box Button when Parts Drawer is hidden */}
      {!isOpen && (
        <div className="fixed left-4 top-20 z-30 flex flex-col gap-2.5">
          <button
            type="button"
            data-testid="open-parts-box"
            onClick={onToggleOpen}
            className="flex items-center gap-2.5 px-4 py-3 bg-[#0E1627] hover:bg-[#162238] border border-cyan-500/50 rounded-xl shadow-xl text-left transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                Parts
                <ChevronRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="text-[11px] text-slate-400">Click to open bay</div>
            </div>
          </button>

          {/* 20% Cash Back Bin always visible as drop target even when drawer closed */}
          <div
            data-testid="recycle-bin"
            onDragOver={(e) => {
              e.preventDefault();
              setBinHover(true);
            }}
            onDragLeave={() => setBinHover(false)}
            onDrop={(e) => {
              e.preventDefault();
              setBinHover(false);
              onDropInRecycleBin();
            }}
            onMouseEnter={() => draggingInstanceId && setBinHover(true)}
            onMouseLeave={() => setBinHover(false)}
            onClick={() => draggingInstanceId && onDropInRecycleBin()}
            role="button"
            tabIndex={0}
            aria-label="Recycle Bin 20% Cash Back"
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
              binHover || draggingInstanceId
                ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                : 'bg-[#0E1627]/95 border-slate-700/80 text-slate-300 hover:border-amber-500/50'
            }`}
          >
            <Trash2 className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold">Recycle Bin</div>
              <div className="text-[10px] font-mono text-amber-300">
                {draggingInstanceId
                  ? `Drop for +$${activeDragCashback.toLocaleString()}k (20%)`
                  : '20% Cash Back'}
              </div>
            </div>
          </div>

          {lastCashbackMsg && (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-mono">
              {lastCashbackMsg}
            </div>
          )}
        </div>
      )}

      {/* Expanded Categorized Parts Section */}
      {isOpen && (
        <aside
          data-testid="parts-drawer-panel"
          className="fixed left-4 top-20 bottom-20 w-[348px] z-30 bg-[#0B111E]/95 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0F172A]">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Spacecraft Parts Bay</h2>
            </div>
            <button
              type="button"
              aria-label="Collapse parts section"
              onClick={onToggleOpen}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Hide
            </button>
          </div>

          {/* Functional Category Tabs */}
          <div className="grid grid-cols-3 gap-1 p-2 border-b border-slate-800 bg-[#090E1A]">
            {PART_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors truncate ${
                  activeCategory === cat.id
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {cat.shortLabel}
              </button>
            ))}
          </div>

          {/* Scrollable Parts List with Part Images */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            <p className="text-[11px] text-slate-400 px-1 pb-1">
              Drag any part onto the 3D pad or click + to attach. Double-tap any attached part on the rocket to move or recycle it.
            </p>
            {filteredParts.map((part: PartDefinition) => (
              <div
                key={part.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', part.id);
                  onStartDragNewPart(part.id);
                }}
                onMouseDown={() => onStartDragNewPart(part.id)}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/85 hover:bg-slate-800/95 border border-slate-800 hover:border-cyan-500/50 transition-all cursor-grab active:cursor-grabbing"
              >
                <PartThumbnail part={part} size={54} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate">
                      {part.name}
                    </span>
                    <span className="text-xs font-mono text-amber-400 shrink-0">
                      ${part.cost.toLocaleString()}k
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                    {part.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-300">
                    <span>{(part.dryMassKg + part.fuelMassKg).toLocaleString()} kg</span>
                    {part.thrustN > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-orange-300">
                          {Math.round(part.thrustN / 1000)} kN
                        </span>
                      </>
                    )}
                    {part.powerGenWatts > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-300">+{part.powerGenWatts}W</span>
                      </>
                    )}
                    {part.commsRangeAU > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-cyan-300">{part.commsRangeAU} AU</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Add ${part.name}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAddPart(part.id);
                  }}
                  className="p-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/30 transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 20% Cash Back Recycle Bin Dropzone */}
          <div
            data-testid="recycle-bin-drawer"
            onDragOver={(e) => {
              e.preventDefault();
              setBinHover(true);
            }}
            onDragLeave={() => setBinHover(false)}
            onDrop={(e) => {
              e.preventDefault();
              setBinHover(false);
              onDropInRecycleBin();
            }}
            onClick={() => draggingInstanceId && onDropInRecycleBin()}
            role="button"
            tabIndex={0}
            aria-label="Trash Bin 20% Cash Back"
            className={`m-2.5 p-3 rounded-xl border-2 border-dashed flex items-center justify-between transition-all cursor-pointer ${
              binHover || draggingInstanceId
                ? 'bg-amber-500/20 border-amber-400 text-amber-100'
                : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-amber-500/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold">Recycle Unused Part</div>
                <div className="text-[11px] font-mono text-amber-300">
                  {draggingInstanceId
                    ? `Drop here for +$${activeDragCashback.toLocaleString()}k`
                    : 'Get 20% Cash Back'}
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">+20%</span>
          </div>
        </aside>
      )}
    </>
  );
};
