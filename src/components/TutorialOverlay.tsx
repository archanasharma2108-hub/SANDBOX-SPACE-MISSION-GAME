import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, Layers, Rocket, Trash2, X } from 'lucide-react';

interface TutorialOverlayProps {
  onClose: () => void;
  onJumpToVab?: () => void;
}

const TUTORIAL_STEPS = [
  {
    title: '1. Balance Competing Engineering Demands',
    icon: Layers,
    summary:
      'Every space mission is a trade-off between Budget ($), Mass, Thrust-to-Weight Ratio (TWR), Delta-V (Δv), Electrical Power (W), and Deep Space Communications (AU).',
    tips: [
      'Watch the top Engineering Bar in the 3D VAB Hangar: Launch TWR must exceed 1.02 (ideally 1.3–1.8) to climb cleanly off the pad.',
      'Use the Center of Mass (yellow sphere) & Center of Thrust (magenta arrow) markers to keep thrust aligned below your mass.',
      'Mars and Venus missions require a High-Gain Deep Space Dish (1.2–2.0 AU) and positive Net Power (Solar Wings or RTG).'
    ]
  },
  {
    title: '2. Build in 3D: Snap Nodes, Symmetry & 20% Cash Back Bin',
    icon: Trash2,
    summary:
      'Your spacecraft parts catalog is tucked inside a compact "Parts" box on the left so your 3D VAB Hangar stays unobstructed.',
    tips: [
      'Click the small "Parts" box to open categorized sections (Command, Engines, Fuel, Science, Power/Comms, Landing). Toggle 1x / 2x / 4x Symmetry to attach side boosters in pairs or quads.',
      'Drag any part onto glowing 3D Snap Nodes or anywhere in 3D space. Click any placed part to slide it along its 3D X / Y / Z Axis Gizmo arrows, or double-tap to detach it.',
      'Drop unused components into the Recycle Bin for an instant 20% Cash Back refund!'
    ]
  },
  {
    title: '3. SFS2 Launch & Gravity Turn: 0–100% Throttle + Navball',
    icon: Rocket,
    summary:
      'At launch, hold-down clamps release and water-deluge steam erupts as your rocket climbs straight along its nose axis.',
    tips: [
      'Slide Throttle to 100% and press SPACE or click IGNITE. Climb vertically through the cloud deck (0–3 km).',
      'Above 3 km, smoothly pitch +15° to +45° East on the 360° Navball to execute a real Gravity Turn into orbit.',
      'Use Stage (Space) to separate spent lower boosters, or hit PRO / RET on the Navball to align Prograde or Retrograde instantly.'
    ]
  },
  {
    title: '4. 2D Trajectory Map, Atmospheric Layers & Soft Landings',
    icon: Compass,
    summary:
      'Watch the 3D atmospheric layers (Troposphere, Stratosphere, Mesosphere, Thermosphere) and switch to the 2D Trajectory Map to time burns.',
    tips: [
      'Cross the 100 km atmosphere boundary, cut throttle (0%) to slow down/coast, then click Circularize Orbit once in space.',
      'Follow the sequential route: Earth Orbit → Burn TLI to Moon’s Orbit → Launch Moon Orbit toward Mars → Mars Soft Landing.',
      'For landings: align RET (Retrograde), deploy Landing Legs (L), open Parachutes in atmosphere (C), carry a Heat Shield, and touch down softly (<18 m/s)!'
    ]
  }
];

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onClose, onJumpToVab }) => {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const Icon = current.icon;

  return (
    <div
      data-testid="tutorial-overlay"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl bg-[#0B111E] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#080D18]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-cyan-400">
                MISSION ACADEMY · STEP {step + 1} OF {TUTORIAL_STEPS.length}
              </div>
              <h2 className="text-base font-bold text-white">{current.title}</h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close tutorial"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-200 leading-relaxed">{current.summary}</p>
          <ul className="space-y-2.5">
            {current.tips.map((tip, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 leading-relaxed"
              >
                <span className="font-mono font-bold text-amber-400 shrink-0">
                  0{idx + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {TUTORIAL_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to tutorial step ${idx + 1}`}
                onClick={() => setStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === step ? 'w-6 bg-cyan-400' : 'w-2 bg-slate-700 hover:bg-slate-600'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#080D18]">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium ${
              step === 0
                ? 'text-slate-600 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {step < TUTORIAL_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs"
            >
              Next Step
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onJumpToVab?.();
              }}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
            >
              <Rocket className="w-4 h-4" />
              Start Building
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
