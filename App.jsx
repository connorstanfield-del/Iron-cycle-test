import React, { useState, useEffect, useMemo } from "react";
import {
  Dumbbell, Settings, CalendarDays, ListChecks, TrendingUp,
  ChevronRight, Check, RotateCcw,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

/* ----------------------------------------------------------------------- */
/* Domain constants                                                        */
/* ----------------------------------------------------------------------- */

const LIFT_LABEL = { squat: "Squat", bench: "Bench Press", deadlift: "Deadlift", ohp: "Overhead Press" };
const LIFT_SHORT = { squat: "SQ", bench: "BP", deadlift: "DL", ohp: "OHP" };

const WEAK_POINTS = {
  squat: [
    { id: "bottom", label: "Out of the hole / bottom position", variation: "Paused Box Squat" },
    { id: "mid", label: "Mid-range sticking point", variation: "Front Squat" },
    { id: "lockout", label: "Lockout / top end", variation: "Pin Squat (top-range)" },
  ],
  bench: [
    { id: "chest", label: "Off the chest", variation: "Paused Bench Press" },
    { id: "mid", label: "Mid-range sticking point", variation: "Close-Grip Bench Press" },
    { id: "lockout", label: "Lockout / triceps", variation: "Board Press" },
  ],
  deadlift: [
    { id: "floor", label: "Off the floor", variation: "Deficit Deadlift" },
    { id: "knee", label: "Mid-range (past the knee)", variation: "Pause Deadlift (below knee)" },
    { id: "lockout", label: "Lockout / hips", variation: "Block Pull (rack pull)" },
  ],
  ohp: [
    { id: "bottom", label: "Off the shoulders", variation: "Paused Overhead Press" },
    { id: "lockout", label: "Lockout", variation: "Push Press (controlled descent)" },
  ],
};

const ACCESSORIES = {
  squat: [{ name: "Leg Press", sets: 3, reps: 10 }, { name: "Leg Curl", sets: 3, reps: 12 }],
  bench: [{ name: "Dumbbell Bench Press", sets: 3, reps: 10 }, { name: "Tricep Pushdown", sets: 3, reps: 12 }],
  deadlift: [{ name: "Barbell Row", sets: 3, reps: 10 }, { name: "Hamstring Curl", sets: 3, reps: 12 }],
  ohp: [{ name: "Lateral Raise", sets: 3, reps: 15 }, { name: "Face Pull", sets: 3, reps: 15 }],
};

// Block periodization: Volume -> Strength -> Peak -> Deload (9 weeks)
const PHASE_BLUEPRINT = [
  { name: "Volume", pct: [70, 73, 76], targetRPE: 7, color: "#5B8A72" },
  { name: "Strength", pct: [80, 83, 86], targetRPE: 8, color: "#C68B3D" },
  { name: "Peak", pct: [88, 91], targetRPE: 9, color: "#C0533E" },
  { name: "Deload", pct: [60], targetRPE: 5, color: "#6E7B8B" },
];

function buildWeeks() {
  const weeks = [];
  let weekNum = 1;
  PHASE_BLUEPRINT.forEach((phase) => {
    phase.pct.forEach((pct) => {
      weeks.push({
        weekNum, phase: phase.name, pct, targetRPE: phase.targetRPE,
        isDeload: phase.name === "Deload", color: phase.color,
      });
      weekNum += 1;
    });
  });
  return weeks;
}
const WEEKS = buildWeeks();

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const TABS = [
  { id: "setup", label: "Setup", icon: Settings },
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "program", label: "Cycle", icon: ListChecks },
  { id: "history", label: "Progress", icon: TrendingUp },
];

/* ----------------------------------------------------------------------- */
/* Pure helpers                                                            */
/* ----------------------------------------------------------------------- */

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Prilepin's chart zones
function getZone(pct) {
  if (pct < 70) return { label: "Sub-70%", repsPerSet: 5, totalReps: 20 };
  if (pct < 80) return { label: "70–79%", repsPerSet: 4, totalReps: 18 };
  if (pct < 90) return { label: "80–89%", repsPerSet: 3, totalReps: 15 };
  return { label: "90–100%", repsPerSet: 2, totalReps: 7 };
}

function computeScheme(pct, isDeload, kind) {
  if (isDeload) {
    return kind === "accessory" ? { sets: 2, reps: 10, zone: "Deload" } : { sets: 2, reps: 5, zone: "Deload" };
  }
  const zone = getZone(pct);
  let repsPerSet = zone.repsPerSet;
  let totalReps = zone.totalReps;
  if (kind === "variation") { repsPerSet += 1; totalReps = Math.round(totalReps * 0.8); }
  const sets = Math.max(2, Math.round(totalReps / repsPerSet));
  return { sets, reps: repsPerSet, zone: zone.label };
}

function roundWeight(w, units) {
  const inc = units === "kg" ? 2.5 : 5;
  return Math.round(w / inc) * inc;
}

function rpeColor(rpe) {
  if (rpe == null) return "#9CA7B4";
  if (rpe <= 6.5) return "#5B8A72";
  if (rpe <= 7.5) return "#8FA85B";
  if (rpe <= 8.5) return "#C68B3D";
  if (rpe <= 9.5) return "#D9762E";
  return "#C0533E";
}

function applyAdjustment(kind, currentAdj, avgRPE, targetRPE) {
  const diff = avgRPE - targetRPE;
  if (kind === "accessory") {
    let delta = 0;
    if (diff >= 1.5) delta = -1;
    else if (diff <= -1.5) delta = 1;
    return clamp((currentAdj || 0) + delta, -1, 3);
  }
  let factor = 1;
  if (diff >= 2) factor = 0.93;
  else if (diff >= 1) factor = 0.965;
  else if (diff <= -2) factor = 1.05;
  else if (diff <= -1) factor = 1.025;
  const next = (currentAdj || 1) * factor;
  return clamp(+next.toFixed(4), 0.8, 1.2);
}

function buildExercises(lift, week, config, adjustments) {
  if (!lift || !week) return [];
  const mainSlot = `${lift}_main`;
  const varSlot = `${lift}_variation`;
  const mainAdj = adjustments[mainSlot] ?? 1;
  const varAdj = adjustments[varSlot] ?? 1;

  const mainScheme = computeScheme(week.pct, week.isDeload, "main");
  const variationPct = week.isDeload ? 55 : Math.max(50, week.pct - 12);
  const varScheme = computeScheme(variationPct, week.isDeload, "variation");

  const tm = config.maxes[lift];
  const mainWeight = roundWeight(tm * (week.pct / 100) * mainAdj, config.units);
  const varWeight = roundWeight(tm * (variationPct / 100) * varAdj, config.units);

  const wpId = config.weakPoints[lift];
  const wpInfo = (WEAK_POINTS[lift] || []).find((w) => w.id === wpId) || (WEAK_POINTS[lift] || [])[0];

  const exMain = {
    slot: mainSlot, kind: "main", name: `${LIFT_LABEL[lift]} — Competition`,
    sets: mainScheme.sets, reps: mainScheme.reps, weight: mainWeight,
    pct: week.pct, zone: mainScheme.zone, targetRPE: week.targetRPE,
  };
  const exVar = {
    slot: varSlot, kind: "variation", name: wpInfo ? wpInfo.variation : "Variation",
    sets: varScheme.sets, reps: varScheme.reps, weight: varWeight,
    pct: variationPct, zone: varScheme.zone, targetRPE: Math.max(5, week.targetRPE - 1),
    weakPointLabel: wpInfo ? wpInfo.label : null,
  };
  const accs = (ACCESSORIES[lift] || []).map((a, idx) => {
    const slot = `${lift}_acc_${idx}`;
    const adj = adjustments[slot] || 0;
    return {
      slot, kind: "accessory", name: a.name,
      sets: clamp(a.sets + adj, 2, a.sets + 3), reps: a.reps, weight: null, targetRPE: 7,
    };
  });
  return [exMain, exVar, ...accs];
}

function dayProgress(exercises, draft) {
  let done = 0;
  exercises.forEach((ex) => { if (draft.completed[ex.slot]) done += 1; });
  return { done, total: exercises.length };
}

function buildChartData(logs) {
  const map = {};
  logs.forEach((l) => {
    if (l.kind !== "main") return;
    if (!map[l.week]) map[l.week] = { week: l.week };
    map[l.week][l.lift] = l.targetWeight;
  });
  return Object.values(map).sort((a, b) => a.week - b.week);
}

/* ----------------------------------------------------------------------- */
/* Persistence — browser localStorage (per-device, no server involved)     */
/* ----------------------------------------------------------------------- */

const STORAGE_PREFIX = "ironcycle:";

async function safeGet(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function safeSet(key, val) {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}
async function safeDelete(key) {
  try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (e) { /* ignore */ }
}

/* ----------------------------------------------------------------------- */
/* Small UI pieces                                                         */
/* ----------------------------------------------------------------------- */

function SetRow({ ex, setIndex, value, onSelect, units }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-700/60 last:border-b-0">
      <div className="font-mono text-xs text-slate-300 w-24 shrink-0">
        Set {setIndex + 1}
        {ex.weight != null && <span className="text-slate-100"> · {ex.weight}{units}</span>}
        <span className="text-slate-500"> ×{ex.reps}</span>
      </div>
      <div className="flex flex-wrap gap-1 justify-end">
        {RPE_OPTIONS.map((r) => {
          const active = value === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onSelect(setIndex, r)}
              className="plate-btn w-8 h-8 rounded-full text-[10px] font-mono font-semibold border focus:ring-2 focus:ring-amber-400 focus:outline-none"
              style={active
                ? { backgroundColor: rpeColor(r), borderColor: rpeColor(r), color: "#1C2127" }
                : { backgroundColor: "transparent", borderColor: "#454F5C", color: "#9CA7B4" }}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExerciseCard({ ex, draft, units, onLogRPE, onComplete }) {
  const entries = draft.entries[ex.slot] || [];
  const complete = !!draft.completed[ex.slot];
  const relevant = entries.slice(0, ex.sets).filter((v) => v != null);
  const loggedCount = relevant.length;
  const avg = loggedCount ? +(relevant.reduce((a, b) => a + b, 0) / loggedCount).toFixed(2) : null;
  const ready = loggedCount === ex.sets;
  const kindLabel = ex.kind === "main" ? "Competition Lift" : ex.kind === "variation" ? "Weak-Point Variation" : "Accessory";
  const kindColor = ex.kind === "main" ? "text-amber-400" : ex.kind === "variation" ? "text-rose-400" : "text-slate-400";

  return (
    <div className={`rounded-xl border p-3 mb-3 ${complete ? "border-emerald-600/50 bg-emerald-950/20" : "border-slate-700 bg-slate-800/60"}`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className={`text-[10px] font-mono uppercase tracking-wider ${kindColor}`}>{kindLabel}</div>
          <div className="font-display text-base text-slate-50 leading-tight">{ex.name}</div>
          {ex.weakPointLabel && <div className="text-[11px] text-slate-400 mt-0.5">Targets: {ex.weakPointLabel}</div>}
        </div>
        <div className="text-right shrink-0">
          {ex.pct != null && <div className="font-mono text-xs text-slate-300">{ex.pct}%</div>}
          <div className="text-[10px] text-slate-500">{ex.zone}</div>
        </div>
      </div>

      {!complete ? (
        <>
          <div className="mt-2">
            {Array.from({ length: ex.sets }).map((_, i) => (
              <SetRow key={i} ex={ex} setIndex={i} value={entries[i]} onSelect={(idx, val) => onLogRPE(ex.slot, idx, val)} units={units} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/60">
            <div className="text-[11px] text-slate-400">
              Target RPE <span className="text-slate-200 font-mono">{ex.targetRPE}</span> · Logged {loggedCount}/{ex.sets}
            </div>
            <button
              type="button"
              disabled={!ready}
              onClick={() => onComplete(ex)}
              className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${ready ? "bg-amber-500 text-slate-900 hover:bg-amber-400" : "bg-slate-700 text-slate-500 cursor-not-allowed"}`}
            >
              <Check className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-slate-400">
            {ex.sets}×{ex.reps}{ex.weight != null ? ` @ ${ex.weight} ${units}` : ""}
          </span>
          <span className="font-mono" style={{ color: rpeColor(avg) }}>Avg RPE {avg}</span>
        </div>
      )}
    </div>
  );
}

function TodayView({ config, week, lifts, currentLift, dayIndex, exercises, draft, onLogRPE, onComplete, onFinishDay, programComplete, onStartNewCycle }) {
  if (programComplete) {
    return (
      <div className="text-center py-16">
        <Dumbbell className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <div className="font-display text-2xl text-slate-50 mb-2">Cycle Complete</div>
        <p className="text-sm text-slate-400 max-w-sm mx-auto mb-5">
          Nine weeks done. Re-test or estimate your new maxes, then start the next cycle — your RPE history carries forward.
        </p>
        <button type="button" onClick={onStartNewCycle} className="bg-amber-500 text-slate-900 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-400">
          Start New Cycle
        </button>
      </div>
    );
  }

  const { done, total } = dayProgress(exercises, draft);

  return (
    <div>
      <div className="mb-4">
        <div className="flex gap-1 mb-3">
          {WEEKS.map((w) => (
            <div
              key={w.weekNum}
              className="h-1.5 flex-1 rounded-full"
              title={`Week ${w.weekNum}: ${w.phase}`}
              style={{ backgroundColor: w.weekNum < week.weekNum ? "#C68B3D" : w.weekNum === week.weekNum ? w.color : "#3A4250" }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-xl text-slate-50">{LIFT_LABEL[currentLift]} Day</div>
            <div className="text-xs text-slate-400">Week {week.weekNum} · {week.phase} phase · target intensity {week.pct}%</div>
          </div>
          <div className="flex gap-1">
            {lifts.map((l, i) => (
              <span
                key={l}
                className={`text-[10px] font-mono px-1.5 py-1 rounded ${i < dayIndex ? "bg-emerald-700/40 text-emerald-300" : i === dayIndex ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-400"}`}
              >
                {LIFT_SHORT[l]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {exercises.map((ex) => (
        <ExerciseCard key={ex.slot} ex={ex} draft={draft} units={config.units} onLogRPE={onLogRPE} onComplete={onComplete} />
      ))}

      <div className="mt-2 flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
        <div className="text-xs text-slate-400">{done}/{total} exercises logged</div>
        <button type="button" onClick={onFinishDay} className="flex items-center gap-1.5 bg-slate-50 text-slate-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-white">
          Finish Day <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ProgramView({ lifts, config, onJump }) {
  return (
    <div>
      <div className="mb-4">
        <div className="font-display text-xl text-slate-50 mb-1">Full Cycle</div>
        <p className="text-xs text-slate-400">
          Base prescription from Prilepin's chart at each week's target intensity. Tap a cell to jump there — live numbers (adjusted to your RPE) show on the Today tab.
        </p>
      </div>
      <div className="space-y-3">
        {WEEKS.map((w) => (
          <div key={w.weekNum} className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderLeft: `4px solid ${w.color}` }}>
              <div className="font-mono text-xs text-slate-200">Week {w.weekNum} <span className="text-slate-500">· {w.phase}</span></div>
              <div className="font-mono text-xs text-amber-400">{w.pct}%</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-700/50">
              {lifts.map((l, idx) => {
                const main = computeScheme(w.pct, w.isDeload, "main");
                const variationPct = w.isDeload ? 55 : Math.max(50, w.pct - 12);
                const varS = computeScheme(variationPct, w.isDeload, "variation");
                const wpId = config.weakPoints[l];
                const wpInfo = (WEAK_POINTS[l] || []).find((x) => x.id === wpId);
                return (
                  <button key={l} type="button" onClick={() => onJump(w.weekNum - 1, idx)} className="bg-slate-800 hover:bg-slate-700/70 text-left p-2.5">
                    <div className="text-[10px] font-mono text-slate-500 mb-0.5">{LIFT_SHORT[l]}</div>
                    <div className="text-[11px] text-slate-200 font-mono">{main.sets}×{main.reps}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{wpInfo ? wpInfo.variation : ""} {varS.sets}×{varS.reps}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView({ logs, lifts, config }) {
  const chartData = useMemo(() => buildChartData(logs), [logs]);
  const liftColors = { squat: "#C68B3D", bench: "#5B8A72", deadlift: "#C0533E", ohp: "#7DA0C4" };
  const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <div className="font-display text-xl text-slate-50 mb-3">Progress</div>
      {chartData.length > 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 mb-5" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#3A4250" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="#9CA7B4" fontSize={11} tickFormatter={(v) => `Wk${v}`} />
              <YAxis stroke="#9CA7B4" fontSize={11} width={40} />
              <Tooltip contentStyle={{ background: "#2F3640", border: "1px solid #454F5C", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {lifts.map((l) => (
                <Line key={l} type="monotone" dataKey={l} name={LIFT_SHORT[l]} stroke={liftColors[l]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-sm text-slate-500 mb-5">Log a few sessions to see your top-set trend here.</div>
      )}

      <div className="font-display text-base text-slate-50 mb-2">Session Log</div>
      {sorted.length === 0 && <div className="text-sm text-slate-500">No sessions logged yet.</div>}
      <div className="space-y-2">
        {sorted.map((l) => {
          const diff = l.avgRPE - l.targetRPE;
          return (
            <div key={l.id} className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
              <div>
                <div className="text-sm text-slate-200">{l.name}</div>
                <div className="text-[11px] text-slate-500">
                  Wk{l.week} · {LIFT_LABEL[l.lift]} · {l.sets}×{l.targetReps}{l.targetWeight != null ? ` @ ${l.targetWeight}${config.units}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm" style={{ color: rpeColor(l.avgRPE) }}>{l.avgRPE}</div>
                <div className="text-[10px] text-slate-500">tgt {l.targetRPE} {diff > 0.4 ? "▲" : diff < -0.4 ? "▼" : "•"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SetupForm({ form, setForm, onSubmit, hasExisting, onReset }) {
  const liftFields = [
    { id: "squat", label: "Squat" },
    { id: "bench", label: "Bench Press" },
    { id: "deadlift", label: "Deadlift" },
  ];
  return (
    <form onSubmit={onSubmit}>
      {!hasExisting && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-5 text-sm text-slate-300 space-y-2">
          <p>
            This program runs a 9-week block: <span className="text-slate-100">Volume → Strength → Peak → Deload</span>.
            Each session's sets and reps come from <span className="text-slate-100">Prilepin's chart</span> at that week's target intensity.
          </p>
          <p>
            After every exercise, log the RPE of your sets. The next time that lift or variation comes up,
            its weight (or volume, for accessories) adjusts to how heavy it actually felt.
          </p>
        </div>
      )}

      <div className="mb-5">
        <label className="text-xs text-slate-400 block mb-1.5">Units</label>
        <div className="flex gap-2">
          {["lb", "kg"].map((u) => (
            <button
              type="button" key={u}
              onClick={() => setForm((f) => ({ ...f, units: u }))}
              className={`px-4 py-1.5 rounded-lg text-sm font-mono ${form.units === u ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-300 border border-slate-700"}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 mb-5">
        {liftFields.map((lf) => (
          <div key={lf.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="font-display text-sm text-slate-100 mb-2">{lf.label}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Current max ({form.units})</label>
                <input
                  type="number" min="0" step="2.5" required
                  value={form.maxes[lf.id]}
                  onChange={(e) => setForm((f) => ({ ...f, maxes: { ...f.maxes, [lf.id]: e.target.value } }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-mono text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Weak point</label>
                <select
                  value={form.weakPoints[lf.id]}
                  onChange={(e) => setForm((f) => ({ ...f, weakPoints: { ...f.weakPoints, [lf.id]: e.target.value } }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                >
                  {WEAK_POINTS[lf.id].map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              Variation assigned: <span className="text-slate-300">{(WEAK_POINTS[lf.id].find((w) => w.id === form.weakPoints[lf.id]) || {}).variation}</span>
            </div>
          </div>
        ))}

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox" checked={form.useOHP}
              onChange={(e) => setForm((f) => ({ ...f, useOHP: e.target.checked }))}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="font-display text-sm text-slate-100">Include Overhead Press as a 4th day</span>
          </label>
          {form.useOHP && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Current max ({form.units})</label>
                <input
                  type="number" min="0" step="2.5" required={form.useOHP}
                  value={form.maxes.ohp}
                  onChange={(e) => setForm((f) => ({ ...f, maxes: { ...f.maxes, ohp: e.target.value } }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-mono text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Weak point</label>
                <select
                  value={form.weakPoints.ohp}
                  onChange={(e) => setForm((f) => ({ ...f, weakPoints: { ...f.weakPoints, ohp: e.target.value } }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                >
                  {WEAK_POINTS.ohp.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <button type="submit" className="w-full bg-amber-500 text-slate-900 font-medium py-3 rounded-xl text-sm hover:bg-amber-400">
        {hasExisting ? "Save Changes" : "Generate Program"}
      </button>

      {hasExisting && (
        <button
          type="button" onClick={onReset}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 mt-4"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset all data and start over
        </button>
      )}
    </form>
  );
}

/* ----------------------------------------------------------------------- */
/* App                                                                      */
/* ----------------------------------------------------------------------- */

const emptyDraft = (weekIdx, dayIdx) => ({ weekIdx, dayIdx, entries: {}, completed: {} });

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("setup");
  const [config, setConfig] = useState(null);
  const [adjustments, setAdjustments] = useState({});
  const [position, setPosition] = useState({ weekIdx: 0, dayIdx: 0 });
  const [logs, setLogs] = useState([]);
  const [draft, setDraft] = useState(emptyDraft(0, 0));
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    units: "lb", useOHP: false,
    maxes: { squat: "", bench: "", deadlift: "", ohp: "" },
    weakPoints: { squat: "bottom", bench: "chest", deadlift: "floor", ohp: "bottom" },
  });

  // load persisted state
  useEffect(() => {
    (async () => {
      const c = await safeGet("config");
      const a = await safeGet("adjustments");
      const p = await safeGet("position");
      const l = await safeGet("logs");
      const d = await safeGet("draft");
      if (c) setConfig(c);
      if (a) setAdjustments(a);
      if (p) setPosition(p);
      if (l) setLogs(l);
      if (d) setDraft(d);
      setTab(c ? "today" : "setup");
      setReady(true);
    })();
  }, []);

  // persist on change
  useEffect(() => { if (ready && config) safeSet("config", config); }, [config, ready]);
  useEffect(() => { if (ready) safeSet("adjustments", adjustments); }, [adjustments, ready]);
  useEffect(() => { if (ready) safeSet("position", position); }, [position, ready]);
  useEffect(() => { if (ready) safeSet("logs", logs); }, [logs, ready]);
  useEffect(() => { if (ready) safeSet("draft", draft); }, [draft, ready]);

  // sync setup form when config loads/changes
  useEffect(() => {
    if (config) {
      setForm({
        units: config.units, useOHP: config.useOHP,
        maxes: {
          squat: String(config.maxes.squat), bench: String(config.maxes.bench),
          deadlift: String(config.maxes.deadlift), ohp: config.maxes.ohp ? String(config.maxes.ohp) : "",
        },
        weakPoints: config.weakPoints,
      });
    }
  }, [config]);

  const lifts = useMemo(
    () => (config ? ["squat", "bench", "deadlift"].concat(config.useOHP ? ["ohp"] : []) : []),
    [config]
  );

  // keep dayIdx valid if lift count changes
  useEffect(() => {
    if (config && lifts.length && position.dayIdx >= lifts.length) {
      setPosition((p) => ({ ...p, dayIdx: 0 }));
    }
  }, [lifts.length, config]);

  // reset draft when navigating to a new week/day
  useEffect(() => {
    if (!ready) return;
    if (draft.weekIdx !== position.weekIdx || draft.dayIdx !== position.dayIdx) {
      setDraft(emptyDraft(position.weekIdx, position.dayIdx));
    }
  }, [position, ready]); // eslint-disable-line

  const programComplete = !!config && position.weekIdx >= WEEKS.length;
  const week = !programComplete ? WEEKS[position.weekIdx] : null;
  const currentLift = !programComplete ? lifts[position.dayIdx] : null;

  const exercises = useMemo(
    () => (config && currentLift && week ? buildExercises(currentLift, week, config, adjustments) : []),
    [config, currentLift, week, adjustments]
  );

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleLogRPE(slot, setIdx, rpe) {
    setDraft((prev) => {
      const arr = prev.entries[slot] ? [...prev.entries[slot]] : [];
      arr[setIdx] = rpe;
      return { ...prev, entries: { ...prev.entries, [slot]: arr } };
    });
  }

  function handleComplete(ex) {
    const arr = (draft.entries[ex.slot] || []).slice(0, ex.sets).filter((v) => v != null);
    if (arr.length < ex.sets) return;
    const avg = +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);

    setAdjustments((prev) => ({ ...prev, [ex.slot]: applyAdjustment(ex.kind, prev[ex.slot], avg, ex.targetRPE) }));
    setDraft((prev) => ({ ...prev, completed: { ...prev.completed, [ex.slot]: true } }));
    setLogs((prev) => [...prev, {
      id: `${Date.now()}-${ex.slot}`, date: new Date().toISOString(),
      week: week.weekNum, lift: currentLift, slot: ex.slot, kind: ex.kind, name: ex.name,
      targetWeight: ex.weight, targetReps: ex.reps, sets: ex.sets, targetRPE: ex.targetRPE,
      avgRPE: avg, pct: ex.pct ?? null,
    }]);
    showToast(`${ex.name} logged — avg RPE ${avg}`);
  }

  function handleFinishDay() {
    setPosition((prev) => {
      let dayIdx = prev.dayIdx + 1;
      let weekIdx = prev.weekIdx;
      if (dayIdx >= lifts.length) { dayIdx = 0; weekIdx += 1; }
      return { weekIdx, dayIdx };
    });
  }

  function handleJump(weekIdx, dayIdx) {
    setPosition({ weekIdx, dayIdx });
    setTab("today");
  }

  function handleStartNewCycle() {
    setPosition({ weekIdx: 0, dayIdx: 0 });
    setAdjustments({});
    setTab("setup");
    showToast("Update your maxes for the new cycle.");
  }

  async function handleReset() {
    if (typeof window !== "undefined" && !window.confirm("This clears your program, maxes, and history. Continue?")) return;
    await Promise.all(["config", "adjustments", "position", "logs", "draft"].map(safeDelete));
    setConfig(null); setAdjustments({}); setPosition({ weekIdx: 0, dayIdx: 0 }); setLogs([]);
    setDraft(emptyDraft(0, 0)); setTab("setup");
  }

  function handleSubmitSetup(e) {
    e.preventDefault();
    const maxes = {
      squat: parseFloat(form.maxes.squat) || 0,
      bench: parseFloat(form.maxes.bench) || 0,
      deadlift: parseFloat(form.maxes.deadlift) || 0,
      ohp: form.useOHP ? (parseFloat(form.maxes.ohp) || 0) : 0,
    };
    if (maxes.squat <= 0 || maxes.bench <= 0 || maxes.deadlift <= 0 || (form.useOHP && maxes.ohp <= 0)) {
      showToast("Enter a current max for each lift you want to train.");
      return;
    }
    const isFirstTime = !config;
    const newConfig = { units: form.units, useOHP: form.useOHP, maxes, weakPoints: form.weakPoints };
    setConfig(newConfig);
    if (isFirstTime) {
      setAdjustments({}); setPosition({ weekIdx: 0, dayIdx: 0 }); setLogs([]); setDraft(emptyDraft(0, 0));
    }
    setTab("today");
    showToast(isFirstTime ? "Program generated." : "Settings updated.");
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Loading your program…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-amber-500" />
            <div>
              <div className="font-display text-lg tracking-wide leading-none text-slate-50">IRONCYCLE</div>
              <div className="text-[10px] text-slate-400 leading-none mt-0.5">Periodized · Prilepin · Autoregulated</div>
            </div>
          </div>
          {config && (
            <div className="text-right">
              <div className="font-mono text-xs text-amber-400">{programComplete ? "COMPLETE" : `WK ${week.weekNum}/${WEEKS.length}`}</div>
              <div className="text-[10px] text-slate-400">{programComplete ? "" : week.phase}</div>
            </div>
          )}
        </div>
        <nav className="flex gap-1 mt-3 max-w-3xl mx-auto overflow-x-auto">
          {TABS.map((t) => {
            const disabled = !config && t.id !== "setup";
            const Icon = t.icon;
            return (
              <button
                key={t.id} type="button" disabled={disabled}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${tab === t.id ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 pb-24">
        {tab === "setup" && (
          <SetupForm form={form} setForm={setForm} onSubmit={handleSubmitSetup} hasExisting={!!config} onReset={handleReset} />
        )}
        {tab === "today" && config && (
          <TodayView
            config={config} week={week} lifts={lifts} currentLift={currentLift} dayIndex={position.dayIdx}
            exercises={exercises} draft={draft} onLogRPE={handleLogRPE} onComplete={handleComplete}
            onFinishDay={handleFinishDay} programComplete={programComplete} onStartNewCycle={handleStartNewCycle}
          />
        )}
        {tab === "program" && config && <ProgramView lifts={lifts} config={config} onJump={handleJump} />}
        {tab === "history" && config && <HistoryView logs={logs} lifts={lifts} config={config} />}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 border border-amber-500/40 text-slate-100 text-sm px-4 py-2 rounded-lg shadow-xl z-50 max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
