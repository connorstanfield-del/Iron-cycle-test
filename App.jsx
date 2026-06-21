import React, { useState, useEffect, useMemo } from "react";
import {
  Dumbbell, Settings, CalendarDays, ListChecks, TrendingUp,
  ChevronRight, Check, RotateCcw, Pencil, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

/* ===================================================================== */
/* RPE chart — single source of truth for autoregulation                 */
/* %1RM as a function of reps-to-failure (the RPE-10 column of the        */
/* standard RTS chart). RPE below 10 = reps in reserve, so                */
/* pct(reps, rpe) = chart(reps + (10 - rpe)).                             */
/* ===================================================================== */

const RPE10_PCT = {
  1: 100.0, 2: 95.5, 3: 92.2, 4: 89.2, 5: 86.3, 6: 83.7, 7: 81.1, 8: 78.6,
  9: 76.2, 10: 74.0, 11: 71.7, 12: 69.5, 13: 67.5, 14: 65.6, 15: 63.9,
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function chartPct(repsToFailure) {
  const n = repsToFailure;
  if (n <= 1) return RPE10_PCT[1];
  if (n >= 15) return Math.max(45, RPE10_PCT[15] - (n - 15) * 1.8);
  const lo = Math.floor(n), hi = Math.ceil(n);
  if (lo === hi) return RPE10_PCT[lo];
  return RPE10_PCT[lo] + (RPE10_PCT[hi] - RPE10_PCT[lo]) * (n - lo);
}

// percentage of 1RM for a set of `reps` taken to `rpe`
function pctOf1RM(reps, rpe) {
  return chartPct(reps + (10 - rpe));
}

// estimate 1RM from a completed set
function e1rmFromSet(weight, reps, rpe) {
  const frac = pctOf1RM(reps, rpe) / 100;
  return frac > 0 ? weight / frac : weight;
}

function roundWeight(w, inc) {
  if (!inc || inc <= 0) inc = 2.5;
  return Math.round(w / inc) * inc;
}

/* ===================================================================== */
/* Movement registry                                                      */
/* Each barbell movement seeds its working e1RM from one of the three     */
/* entered 1RMs, scaled by a factor reflecting the variation.             */
/* ===================================================================== */

const MOVE = {
  comp_squat:  { name: "Low Bar Squat",                    base: "squat",    factor: 1.00, kind: "main" },
  front_squat: { name: "Front Squat",                      base: "squat",    factor: 0.82, kind: "variation", swappable: true },
  paused_squat:{ name: "Paused Beltless Olympic Squat",    base: "squat",    factor: 0.84, kind: "variation", swappable: true },
  comp_bench:  { name: "Bench Press",                       base: "bench",    factor: 1.00, kind: "main" },
  cg_bench:    { name: "Close-Grip Bench",                  base: "bench",    factor: 0.92, kind: "variation", swappable: true },
  comp_dl:     { name: "Deadlift (primary stance)",         base: "deadlift", factor: 1.00, kind: "main" },
  opp_dl:      { name: "Deadlift (opposite stance)",        base: "deadlift", factor: 0.90, kind: "variation", swappable: true },
  rack_pull:   { name: "Rack Pull",                         base: "deadlift", factor: 1.10, kind: "variation", swappable: true },
  rdl:         { name: "Romanian Deadlift",                 base: "deadlift", factor: 0.70, kind: "accessory", swappable: true },
  row:         { name: "Barbell / DB Row",                  base: "deadlift", factor: 0.55, kind: "accessory", swappable: true },
  // isolation / bodyweight — rated by RPE, no prescribed barbell weight
  triceps:     { name: "Triceps Extensions",  iso: true, swappable: true },
  db_press:    { name: "DB Press / Flyes / Dips", iso: true, swappable: true },
  curls:       { name: "Curls",               iso: true, swappable: true },
  back_iso:    { name: "Pull-ups / Pulldowns", iso: true, swappable: true },
};

function seedE1RM(move, maxes) {
  const m = MOVE[move];
  if (!m || m.iso) return null;
  return maxes[m.base] * m.factor;
}

/* ===================================================================== */
/* Set spec helpers                                                       */
/* ===================================================================== */

// n straight sets of the same reps & target RPE
function ss(n, reps, rpe) {
  return Array.from({ length: n }, () => ({ reps, rpe }));
}
// a top set, followed by back-off sets at the SAME weight (fewer reps due to fatigue —
// fixedWeight means "use the top set's weight, don't recalculate from these reps/RPE")
function top(reps, rpe, nBack, bReps, bRpe) {
  return [{ reps, rpe }, ...ss(nBack, bReps, bRpe).map((s) => ({ ...s, fixedWeight: true }))];
}

// barbell exercise (autoregulated weight)
function bar(move, sets, note) {
  return { move, sets, note };
}
// isolation exercise (RPE-rated, no weight)
function iso(move, nSets, repsText, rpe, note) {
  return { move, iso: true, nSets, repsText, rpe, note };
}

/* ===================================================================== */
/* The combined 4-day / 4-week periodized block                          */
/* Built from: Squat 3x IntAdv, Bench 3x Adv, DL 2x Adv (Nuckols).        */
/* Weeks: 1 Accumulation, 2 Intensification, 3 Peak, 4 Realization.       */
/* ===================================================================== */

const PHASES = ["Accumulation", "Intensification", "Peak", "Realization / Test"];

const DAY_TITLES = [
  "Squat + Bench",
  "Deadlift + Bench",
  "Front Squat + Bench",
  "Paused Squat + Deadlift",
];

// program[weekIndex][dayIndex] = { exercises:[...], note }
const PROGRAM = [
  /* ---------------- WEEK 1 — Accumulation ---------------- */
  [
    { note: "Top set then back-offs at the same effort.", exercises: [
      bar("comp_squat", top(10, 9, 3, 8, 8), "1×10 top, then 3×8 back-off"),
      bar("comp_bench", ss(5, 5, 7)),
      bar("cg_bench", [{ reps: 8, rpe: 8 }, { reps: 8, rpe: 8 }, { reps: 8, rpe: 9 }], "last set is AMAP-style — push to RPE 9"),
      iso("curls", 4, "10–12", 8),
    ]},
    { note: "Heavy pull, then volume back work. Bench is a descending pyramid.", exercises: [
      bar("comp_dl", ss(8, 3, 7)),
      bar("rdl", ss(3, 8, 8)),
      bar("row", ss(4, 8, 8)),
      bar("comp_bench", [{reps:8,rpe:7},{reps:6,rpe:7.5},{reps:4,rpe:8},{reps:3,rpe:8.5},{reps:4,rpe:8},{reps:6,rpe:7.5},{reps:8,rpe:7}], "Thursday pyramid"),
    ]},
    { note: "Front squat by feel, then light technique bench + upper accessories.", exercises: [
      bar("front_squat", ss(3, 6, 8), "work up to a hard set of 6, repeat at RPE 8"),
      bar("comp_bench", ss(3, 5, 6), "Saturday — crisp & light, leave plenty in reserve"),
      iso("triceps", 3, "12", 8),
      iso("db_press", 3, "12", 8),
      iso("back_iso", 3, "10", 8),
    ]},
    { note: "Paused beltless squats for position, then opposite-stance pulls + rack pulls.", exercises: [
      bar("paused_squat", ss(5, 5, 6)),
      bar("opp_dl", ss(2, 6, 8)),
      bar("rack_pull", ss(5, 5, 7), "bar 3–5 inches off the floor"),
    ]},
  ],
  /* ---------------- WEEK 2 — Intensification ---------------- */
  [
    { note: "Reps drop, intensity climbs.", exercises: [
      bar("comp_squat", top(8, 9, 3, 6, 8), "1×8 top, then 3×6 back-off"),
      bar("comp_bench", [...ss(4, 3, 8), ...ss(3, 6, 7)], "4×3 heavy, then 3×6 volume"),
      bar("cg_bench", [{reps:6,rpe:8},{reps:6,rpe:8},{reps:6,rpe:9}]),
      iso("curls", 4, "10–12", 8),
    ]},
    { note: "", exercises: [
      bar("comp_dl", ss(6, 3, 8)),
      bar("rdl", ss(4, 8, 8)),
      bar("row", ss(4, 10, 8)),
      bar("comp_bench", [{reps:8,rpe:7},{reps:6,rpe:8},{reps:4,rpe:8.5},{reps:3,rpe:9},{reps:4,rpe:8},{reps:7,rpe:7}], "Thursday pyramid"),
    ]},
    { note: "", exercises: [
      bar("front_squat", ss(4, 4, 8), "work up to a hard 4, repeat at RPE 8"),
      bar("comp_bench", ss(3, 5, 6), "Saturday technique"),
      iso("triceps", 3, "12", 8),
      iso("db_press", 3, "12", 8),
      iso("back_iso", 3, "10", 8),
    ]},
    { note: "", exercises: [
      bar("paused_squat", ss(5, 5, 6.5)),
      bar("opp_dl", ss(3, 6, 8)),
      bar("rack_pull", ss(4, 3, 8)),
    ]},
  ],
  /* ---------------- WEEK 3 — Peak ---------------- */
  [
    { note: "Heaviest week. Sharp top sets.", exercises: [
      bar("comp_squat", top(5, 9, 3, 3, 8), "1×5 top, then 3×3 back-off"),
      bar("comp_bench", [...ss(4, 3, 8.5), ...ss(3, 8, 7)], "4×3 heavy, then 3×8 volume"),
      bar("cg_bench", [{reps:4,rpe:8},{reps:4,rpe:8},{reps:4,rpe:9}]),
      iso("curls", 4, "10–12", 8),
    ]},
    { note: "", exercises: [
      bar("comp_dl", ss(4, 3, 8.5)),
      bar("rdl", ss(5, 8, 8)),
      bar("row", ss(4, 12, 8)),
      bar("comp_bench", [{reps:6,rpe:7},{reps:4,rpe:8},{reps:3,rpe:8.5},{reps:2,rpe:9},{reps:2,rpe:9.5},{reps:4,rpe:8}], "Thursday pyramid — peak"),
    ]},
    { note: "", exercises: [
      bar("front_squat", ss(5, 2, 8), "work up to a hard double, repeat at RPE 8"),
      bar("comp_bench", ss(3, 5, 6.5), "Saturday technique"),
      iso("triceps", 3, "12", 8),
      iso("db_press", 3, "12", 8),
      iso("back_iso", 3, "10", 8),
    ]},
    { note: "", exercises: [
      bar("paused_squat", ss(4, 4, 7)),
      bar("opp_dl", ss(5, 5, 8)),
      bar("rack_pull", ss(3, 2, 8.5)),
    ]},
  ],
  /* ---------------- WEEK 4 — Realization / Test ---------------- */
  [
    { note: "Open with a heavy triple, then a touch of volume.", exercises: [
      bar("comp_squat", [...ss(1, 3, 9), ...ss(3, 3, 7)], "1×3 @ RPE 9 sets your new max, then 3×3 light"),
      bar("comp_bench", [...ss(3, 2, 8), ...ss(3, 5, 7)]),
      bar("cg_bench", ss(3, 3, 8)),
      iso("curls", 4, "10–12", 7),
    ]},
    { note: "Deload the pull — keep it snappy.", exercises: [
      bar("comp_dl", ss(4, 3, 6)),
      bar("rdl", ss(2, 8, 7)),
      bar("row", ss(2, 8, 7)),
      bar("comp_bench", [{reps:5,rpe:6},{reps:4,rpe:6},{reps:3,rpe:7},{reps:4,rpe:6},{reps:5,rpe:6}], "light Thursday pyramid"),
    ]},
    { note: "", exercises: [
      bar("front_squat", ss(4, 3, 7)),
      bar("comp_bench", [{ reps: 5, rpe: 8 }], "Saturday — one hard set of 5, AMAP if you feel good"),
      iso("triceps", 3, "12", 7),
      iso("db_press", 3, "12", 7),
      iso("back_iso", 3, "10", 7),
    ]},
    { note: "Deadlift test day — log your top single to set next block's max.", exercises: [
      bar("paused_squat", ss(3, 3, 7)),
      bar("comp_dl", [{ reps: 1, rpe: 10 }], "Work up to a clean new 1RM — no form deviations"),
    ]},
  ],
];

const N_WEEKS = PROGRAM.length;
const N_DAYS = DAY_TITLES.length;
const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const MAIN_LIFTS = ["squat", "bench", "deadlift"];
const LIFT_LABEL = { squat: "Squat", bench: "Bench", deadlift: "Deadlift" };

const TABS = [
  { id: "setup", label: "Setup", icon: Settings },
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "program", label: "Block", icon: ListChecks },
  { id: "history", label: "Progress", icon: TrendingUp },
];

function rpeColor(rpe) {
  if (rpe == null) return "#9CA7B4";
  if (rpe <= 6.5) return "#5B8A72";
  if (rpe <= 7.5) return "#8FA85B";
  if (rpe <= 8.5) return "#C68B3D";
  if (rpe <= 9.5) return "#D9762E";
  return "#C0533E";
}

/* ===================================================================== */
/* Autoregulation engine                                                  */
/* Given a barbell exercise, the lifter's current e1RM for that movement, */
/* the rounding increment, and the RPEs already logged this session,      */
/* compute each set's live target weight. After a set is logged, the      */
/* e1RM is nudged toward what that set implies, so the *next* set's        */
/* weight updates in real time. Sets flagged fixedWeight (back-off sets   */
/* after a top set) inherit the previous set's weight instead of being    */
/* recalculated from their own (usually lower) rep target. Each set also  */
/* gets a ±2% display range so the lifter has a little room to round to   */
/* whatever plates are actually on hand.                                  */
/* ===================================================================== */

const SMOOTH = 0.34; // how strongly each logged set moves the running e1RM
const RANGE_PCT = 0.02; // ±2% working-weight range shown to the lifter

function computeSetTargets(sets, baseE1RM, loggedRpes, inc) {
  let cur = baseE1RM;
  let lastWeight = null;
  const rows = sets.map((s, i) => {
    const target = s.fixedWeight && lastWeight != null
      ? lastWeight
      : roundWeight(cur * pctOf1RM(s.reps, s.rpe) / 100, inc);
    lastWeight = target;
    const rangeLow = roundWeight(target * (1 - RANGE_PCT), inc);
    const rangeHigh = roundWeight(target * (1 + RANGE_PCT), inc);
    const actual = loggedRpes[i];
    if (actual != null) {
      const implied = e1rmFromSet(target, s.reps, actual);
      const blended = cur * (1 - SMOOTH) + implied * SMOOTH;
      cur = clamp(blended, cur * 0.90, cur * 1.12);
    }
    return { ...s, weight: target, rangeLow: Math.min(rangeLow, rangeHigh), rangeHigh: Math.max(rangeLow, rangeHigh) };
  });
  return { rows, finalE1RM: cur };
}

/* ===================================================================== */
/* Persistence (browser localStorage)                                     */
/* ===================================================================== */

const PREFIX = "ironcycle:";
async function safeGet(k) { try { const r = localStorage.getItem(PREFIX + k); return r ? JSON.parse(r) : null; } catch { return null; } }
async function safeSet(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} }
async function safeDelete(k) { try { localStorage.removeItem(PREFIX + k); } catch {} }

/* ===================================================================== */
/* UI: a single set row                                                   */
/* ===================================================================== */

function SetRow({ index, weight, rangeLow, rangeHigh, reps, rpe, units, value, baseline, onSelect, iso }) {
  const moved = !iso && baseline != null && weight != null && weight !== baseline;
  const showRange = !iso && rangeLow != null && rangeHigh != null && rangeHigh > rangeLow;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-700/60 last:border-b-0">
      <div className="font-mono text-xs text-slate-300 w-[132px] shrink-0">
        <span className="text-slate-500">{index + 1}.</span>{" "}
        {iso ? (
          <span className="text-slate-100">×{reps}</span>
        ) : (
          <>
            <span className="text-slate-100">{showRange ? `${rangeLow}–${rangeHigh}` : weight}{units}</span>
            <span className="text-slate-500"> ×{reps}</span>
          </>
        )}
        {moved && (
          weight > baseline
            ? <ArrowUp className="inline w-3 h-3 ml-0.5 text-emerald-400 -mt-0.5" />
            : <ArrowDown className="inline w-3 h-3 ml-0.5 text-rose-400 -mt-0.5" />
        )}
        <span className="text-slate-600"> · @{rpe}</span>
      </div>
      <div className="flex flex-wrap gap-1 justify-end">
        {RPE_OPTIONS.map((r) => {
          const active = value === r;
          return (
            <button key={r} type="button" onClick={() => onSelect(index, r)}
              className="plate-btn w-8 h-8 rounded-full text-[10px] font-mono font-semibold border focus:ring-2 focus:ring-amber-400 focus:outline-none"
              style={active
                ? { backgroundColor: rpeColor(r), borderColor: rpeColor(r), color: "#1C2127" }
                : { backgroundColor: "transparent", borderColor: "#454F5C", color: "#9CA7B4" }}>
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ===================================================================== */
/* UI: sets-count field — only clamps on blur, not every keystroke,      */
/* so typing a two-digit number doesn't get reset mid-type.              */
/* ===================================================================== */

function SetsCountInput({ value, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  function commit() {
    const n = clamp(parseInt(text, 10) || value, 1, 12);
    setText(String(n));
    onCommit(n);
  }

  return (
    <input
      type="number" inputMode="numeric" min="1" max="12" value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-mono text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
    />
  );
}

/* ===================================================================== */
/* UI: one exercise card                                                   */
/* ===================================================================== */

function ExerciseCard({ ex, exIndex, draft, e1rm, units, inc, onLogRpe, onComplete, onSwap, onEditSets }) {
  const [editing, setEditing] = useState(false);
  const slot = `ex${exIndex}`;
  const complete = !!draft.completed[slot];
  const logged = draft.entries[slot] || [];
  const move = MOVE[ex.move];
  const swappedName = draft.swaps[slot];
  const displayName = swappedName || move.name;

  // resolve set list (sets can be edited in count)
  const editedCount = draft.setCounts[slot];

  let setList;
  if (ex.iso) {
    const n = editedCount != null ? editedCount : ex.nSets;
    setList = Array.from({ length: n }, () => ({ reps: ex.repsText, rpe: ex.rpe }));
  } else {
    const baseSets = ex.sets;
    if (editedCount != null && editedCount !== baseSets.length) {
      // grow/shrink using the last set's spec as the template
      const tmpl = baseSets[baseSets.length - 1];
      setList = Array.from({ length: editedCount }, (_, i) => baseSets[i] || tmpl);
    } else {
      setList = baseSets;
    }
  }

  // live weight targets
  let rows, baselineRows;
  if (ex.iso) {
    rows = setList.map((s) => ({ ...s, weight: null }));
    baselineRows = rows;
  } else {
    const base = e1rm[ex.move];
    rows = computeSetTargets(setList, base, logged, inc).rows;
    baselineRows = computeSetTargets(setList, base, [], inc).rows; // pre-session targets
  }

  const loggedCount = logged.filter((v) => v != null).length;
  const ready = loggedCount === setList.length && setList.length > 0;
  const avg = loggedCount ? +(logged.filter((v) => v != null).reduce((a, b) => a + b, 0) / loggedCount).toFixed(2) : null;

  const kindLabel = move.iso ? "Accessory"
    : move.kind === "main" ? "Main Lift"
    : move.kind === "variation" ? "Variation" : "Accessory";
  const kindColor = move.kind === "main" ? "text-amber-400"
    : move.kind === "variation" ? "text-rose-400" : "text-slate-400";

  const canEdit = !complete;

  return (
    <div className={`rounded-xl border p-3 mb-3 ${complete ? "border-emerald-600/50 bg-emerald-950/20" : "border-slate-700 bg-slate-800/60"}`}>
      <div className="flex items-start justify-between mb-1 gap-2">
        <div className="min-w-0">
          <div className={`text-[10px] font-mono uppercase tracking-wider ${kindColor}`}>{kindLabel}</div>
          <div className="font-display text-base text-slate-50 leading-tight">{displayName}</div>
          {ex.note && <div className="text-[11px] text-slate-400 mt-0.5">{ex.note}</div>}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing((v) => !v)}
            aria-label="Adjust this exercise"
            className={`p-1 rounded shrink-0 focus:ring-2 focus:ring-amber-400 focus:outline-none ${editing ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-amber-400 hover:bg-slate-700"}`}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {editing && !complete && (
        <div className="mt-2 mb-1 p-2.5 rounded-lg bg-slate-900/60 border border-slate-700 space-y-2">
          {move.swappable && (
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Swap exercise</label>
              <input type="text" value={displayName}
                onChange={(e) => onSwap(slot, e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none" />
            </div>
          )}
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Number of sets</label>
            <SetsCountInput value={setList.length} onCommit={(n) => onEditSets(slot, n)} />
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Weights are set automatically from your RPE — there's no manual weight field. Each set's load
            recalculates from how the previous set actually felt, shown as a ±2% range so you can round to
            whatever's on the bar.
          </p>
        </div>
      )}

      {!complete ? (
        <>
          <div className="mt-2">
            {rows.map((row, i) => (
              <SetRow key={i} index={i} weight={row.weight} rangeLow={row.rangeLow} rangeHigh={row.rangeHigh}
                reps={row.reps} rpe={row.rpe} units={units}
                value={logged[i]} baseline={ex.iso ? null : baselineRows[i]?.weight} iso={ex.iso}
                onSelect={(idx, val) => onLogRpe(slot, idx, val, setList.length)} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/60">
            <div className="text-[11px] text-slate-400">
              {ex.iso ? "Pick a weight that hits the target RPE · " : ""}Logged {loggedCount}/{setList.length}
            </div>
            <button type="button" disabled={!ready} onClick={() => onComplete(slot, ex, rows, setList)}
              className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${ready ? "bg-amber-500 text-slate-900 hover:bg-amber-400" : "bg-slate-700 text-slate-500 cursor-not-allowed"}`}>
              <Check className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-slate-400">{setList.length} sets logged</span>
          <span className="font-mono" style={{ color: rpeColor(avg) }}>Avg RPE {avg}</span>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== */
/* Views                                                                  */
/* ===================================================================== */

function TodayView({ config, e1rm, weekIdx, dayIdx, draft, handlers, blockComplete, onNewBlock }) {
  if (blockComplete) {
    return (
      <div className="text-center py-16">
        <Dumbbell className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <div className="font-display text-2xl text-slate-50 mb-2">Block Complete</div>
        <p className="text-sm text-slate-400 max-w-sm mx-auto mb-5">
          Four weeks done. Your estimated maxes have been climbing with every set — start the next block and they
          carry straight over as your new starting point.
        </p>
        <button type="button" onClick={onNewBlock} className="bg-amber-500 text-slate-900 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-400">
          Start Next Block
        </button>
      </div>
    );
  }

  const day = PROGRAM[weekIdx][dayIdx];
  const exercises = day.exercises;
  const doneCount = exercises.filter((_, i) => draft.completed[`ex${i}`]).length;

  return (
    <div>
      <div className="mb-4">
        <div className="flex gap-1 mb-3">
          {Array.from({ length: N_WEEKS * N_DAYS }).map((_, idx) => {
            const w = Math.floor(idx / N_DAYS), d = idx % N_DAYS;
            const past = w < weekIdx || (w === weekIdx && d < dayIdx);
            const here = w === weekIdx && d === dayIdx;
            return <div key={idx} className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: past ? "#C68B3D" : here ? "#C0533E" : "#3A4250" }} />;
          })}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-xl text-slate-50">Day {dayIdx + 1} · {DAY_TITLES[dayIdx]}</div>
            <div className="text-xs text-slate-400">Week {weekIdx + 1} of {N_WEEKS} · {PHASES[weekIdx]} phase</div>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: N_DAYS }).map((_, i) => (
              <span key={i} className={`text-[10px] font-mono px-1.5 py-1 rounded ${i < dayIdx ? "bg-emerald-700/40 text-emerald-300" : i === dayIdx ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-400"}`}>
                D{i + 1}
              </span>
            ))}
          </div>
        </div>
        {day.note && <p className="text-[11px] text-slate-500 mt-2">{day.note}</p>}
      </div>

      {exercises.map((ex, i) => (
        <ExerciseCard key={i} ex={ex} exIndex={i} draft={draft} e1rm={e1rm} units={config.units} inc={config.rounding}
          onLogRpe={handlers.onLogRpe} onComplete={handlers.onComplete} onSwap={handlers.onSwap} onEditSets={handlers.onEditSets} />
      ))}

      <div className="mt-2 flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
        <div className="text-xs text-slate-400">{doneCount}/{exercises.length} exercises done</div>
        <button type="button" onClick={handlers.onFinishDay} className="flex items-center gap-1.5 bg-slate-50 text-slate-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-white">
          Finish Day <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function BlockView({ onJump }) {
  return (
    <div>
      <div className="mb-4">
        <div className="font-display text-xl text-slate-50 mb-1">The Block</div>
        <p className="text-xs text-slate-400">
          Four weeks, four days each — squat, bench and deadlift programs combined. Reps and target RPE are
          fixed by the plan; weights come from your RPE as you lift. Tap any day to jump to it.
        </p>
      </div>
      <div className="space-y-3">
        {PROGRAM.map((week, wi) => (
          <div key={wi} className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderLeft: "4px solid #C68B3D" }}>
              <div className="font-mono text-xs text-slate-200">Week {wi + 1}</div>
              <div className="font-mono text-[11px] text-amber-400">{PHASES[wi]}</div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-700/50">
              {week.map((day, di) => (
                <button key={di} type="button" onClick={() => onJump(wi, di)}
                  className="bg-slate-800 hover:bg-slate-700/70 text-left p-2.5">
                  <div className="text-[10px] font-mono text-slate-500 mb-1">Day {di + 1} · {DAY_TITLES[di]}</div>
                  {day.exercises.map((ex, i) => {
                    const m = MOVE[ex.move];
                    const setsTxt = ex.iso
                      ? `${ex.nSets}×${ex.repsText} @${ex.rpe}`
                      : `${ex.sets.length}×${ex.sets.map((s) => s.reps).join("/")} @${ex.sets.map((s)=>s.rpe).join("/")}`;
                    return (
                      <div key={i} className="text-[11px] text-slate-300 leading-snug">
                        <span className="text-slate-100">{m.name}</span>{" "}
                        <span className="font-mono text-slate-500">{setsTxt}</span>
                      </div>
                    );
                  })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView({ logs, e1rm, units }) {
  const chartData = useMemo(() => {
    const map = {};
    logs.forEach((l) => {
      if (!["comp_squat", "comp_bench", "comp_dl"].includes(l.move)) return;
      const key = `${l.week}.${l.day}`;
      if (!map[key]) map[key] = { label: `W${l.week}D${l.day}`, order: l.week * 10 + l.day };
      const short = l.move === "comp_squat" ? "Squat" : l.move === "comp_bench" ? "Bench" : "Deadlift";
      map[key][short] = Math.round(l.e1rm);
    });
    return Object.values(map).sort((a, b) => a.order - b.order);
  }, [logs]);

  const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const colors = { Squat: "#C68B3D", Bench: "#5B8A72", Deadlift: "#C0533E" };

  return (
    <div>
      <div className="font-display text-xl text-slate-50 mb-3">Progress</div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {MAIN_LIFTS.map((l) => {
          const move = l === "squat" ? "comp_squat" : l === "bench" ? "comp_bench" : "comp_dl";
          return (
            <div key={l} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-center">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{LIFT_LABEL[l]} e1RM</div>
              <div className="font-display text-xl text-amber-400">{e1rm[move] ? Math.round(e1rm[move]) : "—"}</div>
              <div className="text-[10px] text-slate-500">{units}</div>
            </div>
          );
        })}
      </div>

      {chartData.length > 1 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 mb-5" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#3A4250" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#9CA7B4" fontSize={10} />
              <YAxis stroke="#9CA7B4" fontSize={11} width={40} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#2F3640", border: "1px solid #454F5C", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {["Squat", "Bench", "Deadlift"].map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={colors[k]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-sm text-slate-500 mb-5">Log a few main-lift sessions to see your estimated-max trend.</div>
      )}

      <div className="font-display text-base text-slate-50 mb-2">Session Log</div>
      {sorted.length === 0 && <div className="text-sm text-slate-500">Nothing logged yet.</div>}
      <div className="space-y-2">
        {sorted.slice(0, 60).map((l) => (
          <div key={l.id} className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-slate-200 truncate">{l.name}</div>
              <div className="text-[11px] text-slate-500">W{l.week}D{l.day} · {l.nSets} sets{l.topWeight ? ` · top ${l.topWeight}${units}` : ""}</div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <div className="font-mono text-sm" style={{ color: rpeColor(l.avgRpe) }}>{l.avgRpe}</div>
              {l.e1rm ? <div className="text-[10px] text-slate-500">e1RM {Math.round(l.e1rm)}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupForm({ form, setForm, onSubmit, hasExisting, onReset }) {
  return (
    <form onSubmit={onSubmit}>
      {!hasExisting && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-5 text-sm text-slate-300 space-y-2">
          <p>
            A four-day, four-week periodized block built from three of Greg Nuckols' programs —
            <span className="text-slate-100"> Squat 3×/week, Bench 3×/week, Deadlift 2×/week</span> — woven together.
          </p>
          <p>
            Enter your current 1RMs to seed it. From there, <span className="text-slate-100">every working weight is set by
            RPE</span>: rate each set 6–10 and the next set's load recalculates instantly from how hard the last one was.
            There's no manual weight field — the bar follows your readiness.
          </p>
        </div>
      )}

      <div className="mb-5">
        <label className="text-xs text-slate-400 block mb-1.5">Units & rounding</label>
        <div className="flex gap-2 items-center">
          {["lb", "kg"].map((u) => (
            <button type="button" key={u}
              onClick={() => setForm((f) => ({ ...f, units: u, rounding: u === "kg" ? "2.5" : "5" }))}
              className={`px-4 py-1.5 rounded-lg text-sm font-mono ${form.units === u ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-300 border border-slate-700"}`}>
              {u}
            </button>
          ))}
          <span className="text-xs text-slate-500 ml-1">round to</span>
          <input type="number" min="0.5" step="0.5" value={form.rounding}
            onChange={(e) => setForm((f) => ({ ...f, rounding: e.target.value }))}
            className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-mono text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none" />
          <span className="text-xs text-slate-500">{form.units}</span>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        {MAIN_LIFTS.map((l) => (
          <div key={l} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center justify-between">
            <div className="font-display text-sm text-slate-100">{LIFT_LABEL[l]} 1RM</div>
            <div className="flex items-center gap-2">
              <input type="number" min="0" step="2.5" required value={form.maxes[l]}
                onChange={(e) => setForm((f) => ({ ...f, maxes: { ...f.maxes, [l]: e.target.value } }))}
                className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-mono text-slate-100 focus:ring-2 focus:ring-amber-400 focus:outline-none" />
              <span className="text-xs text-slate-500 w-6">{form.units}</span>
            </div>
          </div>
        ))}
      </div>

      <button type="submit" className="w-full bg-amber-500 text-slate-900 font-medium py-3 rounded-xl text-sm hover:bg-amber-400">
        {hasExisting ? "Save Changes" : "Generate Block"}
      </button>

      {hasExisting && (
        <button type="button" onClick={onReset}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 mt-4">
          <RotateCcw className="w-3.5 h-3.5" /> Reset all data and start over
        </button>
      )}
    </form>
  );
}

/* ===================================================================== */
/* App                                                                    */
/* ===================================================================== */

const emptyDraft = (weekIdx, dayIdx) => ({ weekIdx, dayIdx, entries: {}, completed: {}, swaps: {}, setCounts: {} });

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("setup");
  const [config, setConfig] = useState(null);
  const [e1rm, setE1rm] = useState({});
  const [pos, setPos] = useState({ weekIdx: 0, dayIdx: 0 });
  const [logs, setLogs] = useState([]);
  const [draft, setDraft] = useState(emptyDraft(0, 0));
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    units: "lb", rounding: "5",
    maxes: { squat: "", bench: "", deadlift: "" },
  });

  useEffect(() => {
    (async () => {
      const c = await safeGet("config");
      const e = await safeGet("e1rm");
      const p = await safeGet("pos");
      const l = await safeGet("logs");
      const d = await safeGet("draft");
      if (c) setConfig(c);
      if (e) setE1rm(e);
      if (p) setPos(p);
      if (l) setLogs(l);
      if (d) setDraft({ ...emptyDraft(d.weekIdx, d.dayIdx), ...d });
      setTab(c ? "today" : "setup");
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready && config) safeSet("config", config); }, [config, ready]);
  useEffect(() => { if (ready) safeSet("e1rm", e1rm); }, [e1rm, ready]);
  useEffect(() => { if (ready) safeSet("pos", pos); }, [pos, ready]);
  useEffect(() => { if (ready) safeSet("logs", logs); }, [logs, ready]);
  useEffect(() => { if (ready) safeSet("draft", draft); }, [draft, ready]);

  useEffect(() => {
    if (config) {
      setForm({
        units: config.units, rounding: String(config.rounding),
        maxes: { squat: String(config.maxes.squat), bench: String(config.maxes.bench), deadlift: String(config.maxes.deadlift) },
      });
    }
  }, [config]);

  // reset the day-draft when navigating to a different day
  useEffect(() => {
    if (!ready) return;
    if (draft.weekIdx !== pos.weekIdx || draft.dayIdx !== pos.dayIdx) {
      setDraft(emptyDraft(pos.weekIdx, pos.dayIdx));
    }
  }, [pos, ready]); // eslint-disable-line

  const blockComplete = !!config && pos.weekIdx >= N_WEEKS;

  function showToast(m) { setToast(m); setTimeout(() => setToast(null), 2600); }

  function onLogRpe(slot, idx, rpe, nSets) {
    setDraft((prev) => {
      const arr = prev.entries[slot] ? [...prev.entries[slot]] : [];
      arr[idx] = rpe;
      return { ...prev, entries: { ...prev.entries, [slot]: arr } };
    });
  }

  function onSwap(slot, name) {
    setDraft((prev) => ({ ...prev, swaps: { ...prev.swaps, [slot]: name } }));
  }

  function onEditSets(slot, val) {
    const n = clamp(parseInt(val, 10) || 1, 1, 12);
    setDraft((prev) => ({ ...prev, setCounts: { ...prev.setCounts, [slot]: n } }));
  }

  function onComplete(slot, ex, rows, setList) {
    const logged = (draft.entries[slot] || []).slice(0, setList.length).filter((v) => v != null);
    if (logged.length < setList.length) return;
    const avg = +(logged.reduce((a, b) => a + b, 0) / logged.length).toFixed(2);
    const move = MOVE[ex.move];

    let finalE1RM = null, topWeight = null;
    if (!ex.iso) {
      const base = e1rm[ex.move];
      const res = computeSetTargets(setList, base, draft.entries[slot], config.rounding);
      finalE1RM = res.finalE1RM;
      topWeight = res.rows.reduce((mx, r) => Math.max(mx, r.weight), 0);
      setE1rm((prev) => ({ ...prev, [ex.move]: finalE1RM }));
    }

    setDraft((prev) => ({ ...prev, completed: { ...prev.completed, [slot]: true } }));
    setLogs((prev) => [...prev, {
      id: `${Date.now()}-${slot}`, date: new Date().toISOString(),
      week: pos.weekIdx + 1, day: pos.dayIdx + 1, move: ex.move,
      name: draft.swaps[slot] || move.name, nSets: setList.length,
      avgRpe: avg, e1rm: finalE1RM, topWeight,
    }]);
    showToast(`${draft.swaps[slot] || move.name} — avg RPE ${avg}${finalE1RM ? ` · e1RM ${Math.round(finalE1RM)}` : ""}`);
  }

  function onFinishDay() {
    setPos((prev) => {
      let dayIdx = prev.dayIdx + 1, weekIdx = prev.weekIdx;
      if (dayIdx >= N_DAYS) { dayIdx = 0; weekIdx += 1; }
      return { weekIdx, dayIdx };
    });
  }

  function onJump(weekIdx, dayIdx) { setPos({ weekIdx, dayIdx }); setTab("today"); }

  function onNewBlock() {
    // carry the trained estimated maxes into a fresh block
    const newMaxes = {
      squat: e1rm.comp_squat ? Math.round(e1rm.comp_squat) : config.maxes.squat,
      bench: e1rm.comp_bench ? Math.round(e1rm.comp_bench) : config.maxes.bench,
      deadlift: e1rm.comp_dl ? Math.round(e1rm.comp_dl) : config.maxes.deadlift,
    };
    const newConfig = { ...config, maxes: newMaxes };
    setConfig(newConfig);
    setE1rm(buildSeed(newMaxes));
    setPos({ weekIdx: 0, dayIdx: 0 });
    setDraft(emptyDraft(0, 0));
    setTab("today");
    showToast(`New block — maxes updated to ${newMaxes.squat}/${newMaxes.bench}/${newMaxes.deadlift}`);
  }

  function buildSeed(maxes) {
    const seed = {};
    Object.keys(MOVE).forEach((k) => {
      const s = seedE1RM(k, maxes);
      if (s != null) seed[k] = s;
    });
    return seed;
  }

  async function onReset() {
    if (typeof window !== "undefined" && !window.confirm("This clears your block, maxes, and history. Continue?")) return;
    await Promise.all(["config", "e1rm", "pos", "logs", "draft"].map(safeDelete));
    setConfig(null); setE1rm({}); setPos({ weekIdx: 0, dayIdx: 0 }); setLogs([]); setDraft(emptyDraft(0, 0)); setTab("setup");
  }

  function onSubmitSetup(e) {
    e.preventDefault();
    const maxes = {
      squat: parseFloat(form.maxes.squat) || 0,
      bench: parseFloat(form.maxes.bench) || 0,
      deadlift: parseFloat(form.maxes.deadlift) || 0,
    };
    if (maxes.squat <= 0 || maxes.bench <= 0 || maxes.deadlift <= 0) {
      showToast("Enter a 1RM for squat, bench, and deadlift.");
      return;
    }
    const inc = parseFloat(form.rounding) || (form.units === "kg" ? 2.5 : 5);
    const firstTime = !config;
    const newConfig = { units: form.units, rounding: inc, maxes };
    setConfig(newConfig);
    if (firstTime) {
      setE1rm(buildSeed(maxes));
      setPos({ weekIdx: 0, dayIdx: 0 }); setLogs([]); setDraft(emptyDraft(0, 0));
    } else {
      // re-seed only e1RMs that don't exist yet; keep trained ones
      setE1rm((prev) => {
        const seed = buildSeed(maxes);
        return { ...seed, ...prev };
      });
    }
    setTab("today");
    showToast(firstTime ? "Block generated." : "Settings saved.");
  }

  if (!ready) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
  }

  const handlers = { onLogRpe, onComplete, onSwap, onEditSets, onFinishDay };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-amber-500" />
            <div>
              <div className="font-display text-lg tracking-wide leading-none text-slate-50">IRONCYCLE</div>
              <div className="text-[10px] text-slate-400 leading-none mt-0.5">4-Day Block · RPE-Autoregulated</div>
            </div>
          </div>
          {config && (
            <div className="text-right">
              <div className="font-mono text-xs text-amber-400">{blockComplete ? "COMPLETE" : `W${pos.weekIdx + 1} D${pos.dayIdx + 1}`}</div>
              <div className="text-[10px] text-slate-400">{blockComplete ? "" : PHASES[pos.weekIdx]}</div>
            </div>
          )}
        </div>
        <nav className="flex gap-1 mt-3 max-w-3xl mx-auto overflow-x-auto">
          {TABS.map((t) => {
            const disabled = !config && t.id !== "setup";
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" disabled={disabled} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${tab === t.id ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 pb-24">
        {tab === "setup" && <SetupForm form={form} setForm={setForm} onSubmit={onSubmitSetup} hasExisting={!!config} onReset={onReset} />}
        {tab === "today" && config && (
          <TodayView config={config} e1rm={e1rm} weekIdx={pos.weekIdx} dayIdx={pos.dayIdx} draft={draft}
            handlers={handlers} blockComplete={blockComplete} onNewBlock={onNewBlock} />
        )}
        {tab === "program" && config && <BlockView onJump={onJump} />}
        {tab === "history" && config && <HistoryView logs={logs} e1rm={e1rm} units={config.units} />}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 border border-amber-500/40 text-slate-100 text-sm px-4 py-2 rounded-lg shadow-xl z-50 max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
