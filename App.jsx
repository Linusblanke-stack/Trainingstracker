import React, { useState, useEffect, useRef } from "react";
import {
  Dumbbell,
  Plus,
  Minus,
  Trash2,
  X,
  Check,
  TrendingUp,
  Timer as TimerIcon,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const DEFAULT_EXERCISES = ["Bankdrücken", "Kniebeuge", "Kreuzheben"];
const STORAGE_KEY_EXERCISES = "trainings-tracker:exercises";
const STORAGE_KEY_SESSIONS = "trainings-tracker:sessions";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function parseLocalDate(dateStr) {
  return new Date(dateStr + "T00:00:00");
}

function formatDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateLong(dateStr) {
  if (!dateStr) return "";
  return parseLocalDate(dateStr).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long" });
}

function dateLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return "Heute";
  const y = new Date(parseLocalDate(today).getTime() - 86400000);
  const yStr = `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`;
  if (dateStr === yStr) return "Gestern";
  return formatDateLong(dateStr);
}

function monthLabel(monthDate) {
  return monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function getMonthCells(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Audio nicht verfügbar - kein Problem
  }
}

export default function App() {
  const [tab, setTab] = useState("log");
  const [exercises, setExercises] = useState(() => loadFromStorage(STORAGE_KEY_EXERCISES, DEFAULT_EXERCISES));
  const [activeExercise, setActiveExercise] = useState(
    () => loadFromStorage(STORAGE_KEY_EXERCISES, DEFAULT_EXERCISES)[0]
  );
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [currentSets, setCurrentSets] = useState([]);
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(8);
  const [sessions, setSessions] = useState(() => loadFromStorage(STORAGE_KEY_SESSIONS, []));
  const [addingExercise, setAddingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [historyExercise, setHistoryExercise] = useState(
    () => loadFromStorage(STORAGE_KEY_EXERCISES, DEFAULT_EXERCISES)[0]
  );
  const inputRef = useRef(null);

  // Timer-State (lebt oben in App, damit er weiterläuft, egal welcher Tab offen ist)
  const [timerDuration, setTimerDuration] = useState(60);
  const [timerRemaining, setTimerRemaining] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Kalender-State
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(() => todayStr());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EXERCISES, JSON.stringify(exercises));
  }, [exercises]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    setCurrentSets([]);
  }, [activeExercise]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setTimerRunning(false);
          playBeep();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  function addSet() {
    setCurrentSets((s) => [...s, { id: uid(), weight, reps }]);
  }

  function removeSet(id) {
    setCurrentSets((s) => s.filter((x) => x.id !== id));
  }

  function saveSession() {
    if (currentSets.length === 0) return;
    const session = {
      id: uid(),
      exercise: activeExercise,
      date: selectedDate,
      sets: currentSets,
    };
    setSessions((s) => [session, ...s]);
    setCurrentSets([]);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
  }

  function confirmNewExercise() {
    const name = newExerciseName.trim();
    if (!name) {
      setAddingExercise(false);
      return;
    }
    if (!exercises.includes(name)) {
      setExercises((e) => [...e, name]);
    }
    setActiveExercise(name);
    setNewExerciseName("");
    setAddingExercise(false);
  }

  function deleteExercise(name, e) {
    e.stopPropagation();
    if (exercises.length <= 1) return;
    setExercises((ex) => ex.filter((x) => x !== name));
    if (activeExercise === name) {
      const remaining = exercises.filter((x) => x !== name);
      setActiveExercise(remaining[0]);
    }
    if (historyExercise === name) {
      const remaining = exercises.filter((x) => x !== name);
      setHistoryExercise(remaining[0]);
    }
  }

  function deleteSession(id) {
    setSessions((s) => s.filter((x) => x.id !== id));
  }

  function goLogForDate(dateStr) {
    setSelectedDate(dateStr);
    setTab("log");
  }

  function prevMonth() {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  function adjustTimerDuration(delta) {
    const n = Math.max(15, timerDuration + delta);
    setTimerDuration(n);
    if (!timerRunning) setTimerRemaining(n);
  }

  function setTimerPreset(p) {
    setTimerDuration(p);
    setTimerRemaining(p);
  }

  function startTimer() {
    if (timerRemaining === 0) setTimerRemaining(timerDuration);
    setTimerRunning(true);
  }

  function resetTimer() {
    setTimerRunning(false);
    setTimerRemaining(timerDuration);
  }

  const exerciseSessions = sessions
    .filter((s) => s.exercise === historyExercise)
    .sort((a, b) => a.date.localeCompare(b.date));

  const chartData = exerciseSessions.map((s) => ({
    date: formatDate(s.date),
    maxWeight: Math.max(...s.sets.map((x) => x.weight)),
  }));

  const historySessionsDesc = [...exerciseSessions].reverse();

  const sessionsByDate = sessions.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});

  const weekCount = sessions.filter((s) => {
    const diffDays = (parseLocalDate(todayStr()) - parseLocalDate(s.date)) / 86400000;
    return diffDays >= 0 && diffDays < 7;
  }).length;

  const monthCells = getMonthCells(calendarMonth);
  const selectedDaySessions = sessionsByDate[selectedCalendarDay] || [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <div className="max-w-md w-full mx-auto flex flex-col min-h-screen relative">
        {/* Header */}
        <header className="px-5 pt-6 pb-4 flex items-center gap-2.5 border-b border-neutral-900">
          <div className="w-8 h-8 rounded-md bg-orange-500 flex items-center justify-center shrink-0">
            <Dumbbell size={18} className="text-neutral-950" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold tracking-tight leading-none">Training</h1>
            <p className="text-[11px] text-neutral-500 mt-1 leading-none">
              {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[16px] font-bold tabular-nums leading-none">{weekCount}</div>
            <div className="text-[9px] text-neutral-500 font-semibold uppercase tracking-wide mt-0.5">
              Diese Woche
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-28">
          {tab === "log" && (
            <div className="px-5 pt-5">
              {/* Datum */}
              <div className="flex items-center justify-between mb-5 bg-neutral-900 rounded-xl px-4 py-3">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Datum</span>
                  <div className="text-[14px] font-bold mt-0.5">{dateLabel(selectedDate)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedDate !== todayStr() && (
                    <button
                      onClick={() => setSelectedDate(todayStr())}
                      className="text-[12px] font-semibold text-orange-400 px-2 py-1"
                    >
                      Heute
                    </button>
                  )}
                  <input
                    type="date"
                    value={selectedDate}
                    max={todayStr()}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    style={{ colorScheme: "dark" }}
                    className="bg-neutral-800 text-neutral-100 text-[13px] rounded-lg px-2.5 py-1.5 outline-none"
                  />
                </div>
              </div>

              {/* Exercise chips */}
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Übung</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-6 mt-2">
                {exercises.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setActiveExercise(ex)}
                    className={
                      "group px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 " +
                      (activeExercise === ex
                        ? "bg-orange-500 text-neutral-950"
                        : "bg-neutral-900 text-neutral-300 active:bg-neutral-800")
                    }
                  >
                    {ex}
                    {exercises.length > 1 && (
                      <span
                        onClick={(e) => deleteExercise(ex, e)}
                        className={
                          "rounded-full p-0.5 -mr-1 " +
                          (activeExercise === ex ? "text-neutral-950/50 active:text-neutral-950" : "text-neutral-600")
                        }
                      >
                        <X size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
                {!addingExercise && (
                  <button
                    onClick={() => {
                      setAddingExercise(true);
                      setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
                    }}
                    className="px-3.5 py-2 rounded-full text-[13px] font-medium bg-neutral-900 text-neutral-400 flex items-center gap-1 active:bg-neutral-800"
                  >
                    <Plus size={13} strokeWidth={3} />
                    Neu
                  </button>
                )}
              </div>

              {addingExercise && (
                <div className="mb-6 flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={newExerciseName}
                    onChange={(e) => setNewExerciseName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmNewExercise()}
                    placeholder="Name der Übung"
                    className="flex-1 bg-neutral-900 rounded-lg px-3.5 py-2.5 text-[14px] text-neutral-100 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button
                    onClick={confirmNewExercise}
                    className="w-10 h-10 rounded-lg bg-orange-500 text-neutral-950 flex items-center justify-center shrink-0 active:bg-orange-400"
                  >
                    <Check size={18} strokeWidth={3} />
                  </button>
                </div>
              )}

              {/* Stepper input */}
              <div className="bg-neutral-900 rounded-2xl p-5 mb-5 border border-neutral-800">
                <div className="grid grid-cols-2 gap-4">
                  <StepperField label="kg" value={weight} step={2.5} min={0} onChange={setWeight} />
                  <StepperField label="Wdh." value={reps} step={1} min={1} onChange={setReps} />
                </div>
                <button
                  onClick={addSet}
                  className="mt-5 w-full bg-neutral-100 text-neutral-950 rounded-xl py-3 text-[14px] font-bold flex items-center justify-center gap-1.5 active:bg-neutral-300"
                >
                  <Plus size={16} strokeWidth={3} />
                  Satz hinzufügen
                </button>
              </div>

              {/* Current sets */}
              {currentSets.length > 0 && (
                <div className="mb-6">
                  <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                    {dateLabel(selectedDate)} · {currentSets.length} {currentSets.length === 1 ? "Satz" : "Sätze"}
                  </span>
                  <div className="mt-2.5 flex flex-col gap-2">
                    {currentSets.map((s, i) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between bg-neutral-900/60 rounded-xl px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-[15px] font-bold tabular-nums">
                            {s.weight} <span className="text-neutral-500 font-medium text-[12px]">kg</span>
                          </span>
                          <span className="text-neutral-700">×</span>
                          <span className="text-[15px] font-bold tabular-nums">
                            {s.reps} <span className="text-neutral-500 font-medium text-[12px]">Wdh.</span>
                          </span>
                        </div>
                        <button onClick={() => removeSet(s.id)} className="text-neutral-600 active:text-red-400 p-1">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={saveSession}
                    className="mt-4 w-full bg-orange-500 text-neutral-950 rounded-xl py-3.5 text-[14px] font-bold active:bg-orange-400 transition-colors"
                  >
                    {savedFlash ? "Gespeichert ✓" : "Einheit speichern"}
                  </button>
                </div>
              )}

              {currentSets.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-[13px] text-neutral-600">
                    Gewicht &amp; Wiederholungen einstellen, dann Satz hinzufügen.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "timer" && (
            <div className="px-5 pt-8 flex flex-col items-center">
              <div
                className="relative w-56 h-56 rounded-full flex items-center justify-center mb-8"
                style={{
                  background: `conic-gradient(#f97316 ${(timerRemaining / timerDuration) * 360}deg, #27272a 0deg)`,
                }}
              >
                <div className="absolute inset-2 bg-neutral-950 rounded-full flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold tabular-nums">
                    {Math.floor(timerRemaining / 60)}:{pad2(timerRemaining % 60)}
                  </span>
                  {timerRemaining === 0 && !timerRunning && (
                    <span className="text-[12px] font-bold text-orange-400 mt-1">Fertig ✓</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mb-6 flex-wrap justify-center">
                {[30, 60, 90, 120].map((p) => (
                  <button
                    key={p}
                    disabled={timerRunning}
                    onClick={() => setTimerPreset(p)}
                    className={
                      "px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors " +
                      (timerDuration === p ? "bg-orange-500 text-neutral-950" : "bg-neutral-900 text-neutral-300") +
                      (timerRunning ? " opacity-40" : " active:bg-neutral-800")
                    }
                  >
                    {p}s
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 mb-8">
                <button
                  disabled={timerRunning}
                  onClick={() => adjustTimerDuration(-15)}
                  className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center active:bg-neutral-800 disabled:opacity-40"
                >
                  <Minus size={16} strokeWidth={3} />
                </button>
                <span className="text-[13px] text-neutral-500 font-semibold w-16 text-center">± 15s</span>
                <button
                  disabled={timerRunning}
                  onClick={() => adjustTimerDuration(15)}
                  className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center active:bg-neutral-800 disabled:opacity-40"
                >
                  <Plus size={16} strokeWidth={3} />
                </button>
              </div>

              <div className="flex gap-3 w-full">
                {!timerRunning ? (
                  <button
                    onClick={startTimer}
                    className="flex-1 bg-orange-500 text-neutral-950 rounded-xl py-3.5 text-[14px] font-bold active:bg-orange-400"
                  >
                    {timerRemaining === timerDuration ? "Start" : "Weiter"}
                  </button>
                ) : (
                  <button
                    onClick={() => setTimerRunning(false)}
                    className="flex-1 bg-neutral-100 text-neutral-950 rounded-xl py-3.5 text-[14px] font-bold active:bg-neutral-300"
                  >
                    Pause
                  </button>
                )}
                <button
                  onClick={resetTimer}
                  className="w-14 rounded-xl bg-neutral-900 flex items-center justify-center active:bg-neutral-800"
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>
          )}

          {tab === "calendar" && (
            <div className="px-5 pt-5">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center active:bg-neutral-800"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-[14px] font-bold capitalize">{monthLabel(calendarMonth)}</span>
                <button
                  onClick={nextMonth}
                  className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center active:bg-neutral-800"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold text-neutral-600 py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const dateStr = `${calendarMonth.getFullYear()}-${pad2(calendarMonth.getMonth() + 1)}-${pad2(day)}`;
                  const hasSessions = !!sessionsByDate[dateStr];
                  const isToday = dateStr === todayStr();
                  const isSelected = dateStr === selectedCalendarDay;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedCalendarDay(dateStr)}
                      className={
                        "aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold " +
                        (isSelected
                          ? "bg-orange-500 text-neutral-950"
                          : isToday
                          ? "bg-neutral-900 text-orange-400 ring-1 ring-orange-500"
                          : "text-neutral-300 active:bg-neutral-900")
                      }
                    >
                      {day}
                      {hasSessions && (
                        <span
                          className={"w-1 h-1 rounded-full " + (isSelected ? "bg-neutral-950" : "bg-orange-400")}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6">
                <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                  {formatDateLong(selectedCalendarDay)}
                </span>

                {selectedDaySessions.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-[13px] text-neutral-600 mb-4">Keine Einheit an diesem Tag.</p>
                    <button
                      onClick={() => goLogForDate(selectedCalendarDay)}
                      className="bg-neutral-100 text-neutral-950 rounded-xl px-4 py-2.5 text-[13px] font-bold active:bg-neutral-300"
                    >
                      Training nachtragen
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-col gap-2">
                    {selectedDaySessions.map((s) => (
                      <div key={s.id} className="bg-neutral-900/60 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-bold">{s.exercise}</span>
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="text-neutral-700 active:text-red-400 p-1 -mr-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.sets.map((set, i) => (
                            <span
                              key={i}
                              className="text-[12px] font-bold tabular-nums bg-neutral-800 rounded-md px-2 py-1 text-neutral-200"
                            >
                              {set.weight}
                              <span className="text-neutral-500 font-medium">kg</span> × {set.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => goLogForDate(selectedCalendarDay)}
                      className="mt-1 text-[12px] font-semibold text-orange-400 text-center py-2"
                    >
                      + Weitere Übung für diesen Tag nachtragen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="px-5 pt-5">
              <div className="mb-1">
                <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Übung</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 mb-6">
                {exercises.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setHistoryExercise(ex)}
                    className={
                      "px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors " +
                      (historyExercise === ex
                        ? "bg-orange-500 text-neutral-950"
                        : "bg-neutral-900 text-neutral-300 active:bg-neutral-800")
                    }
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {chartData.length === 0 && (
                <div className="text-center py-16">
                  <TrendingUp size={28} className="mx-auto text-neutral-700 mb-3" />
                  <p className="text-[13px] text-neutral-600">
                    Noch keine gespeicherten Einheiten für {historyExercise}.
                  </p>
                </div>
              )}

              {chartData.length > 0 && (
                <>
                  <div className="bg-neutral-900 rounded-2xl p-4 pt-5 mb-6 border border-neutral-800">
                    <div className="flex items-baseline justify-between px-1 mb-3">
                      <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                        Maxgewicht
                      </span>
                      <span className="text-[20px] font-bold tabular-nums text-orange-400">
                        {chartData[chartData.length - 1].maxWeight}
                        <span className="text-[12px] text-neutral-500 font-semibold"> kg</span>
                      </span>
                    </div>
                    <div style={{ width: "100%", height: 160 }}>
                      <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: "#71717a", fontSize: 10 }}
                            axisLine={{ stroke: "#3f3f46" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "#71717a", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            domain={["dataMin - 5", "dataMax + 5"]}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#18181b",
                              border: "1px solid #3f3f46",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelStyle={{ color: "#a1a1aa" }}
                            itemStyle={{ color: "#fb923c" }}
                            formatter={(v) => [`${v} kg`, "Maxgewicht"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="maxWeight"
                            stroke="#fb923c"
                            strokeWidth={2.5}
                            dot={{ fill: "#fb923c", r: 3.5, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Verlauf</span>
                  <div className="mt-2.5 flex flex-col gap-2">
                    {historySessionsDesc.map((s) => (
                      <div key={s.id} className="bg-neutral-900/60 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-semibold text-neutral-400">{formatDateLong(s.date)}</span>
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="text-neutral-700 active:text-red-400 p-1 -mr-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.sets.map((set, i) => (
                            <span
                              key={i}
                              className="text-[12px] font-bold tabular-nums bg-neutral-800 rounded-md px-2 py-1 text-neutral-200"
                            >
                              {set.weight}
                              <span className="text-neutral-500 font-medium">kg</span> × {set.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-neutral-950/95 backdrop-blur border-t border-neutral-900 flex px-3 py-2 gap-1">
          <NavButton active={tab === "log"} onClick={() => setTab("log")} icon={<Dumbbell size={17} strokeWidth={2.3} />} label="Training" />
          <NavButton
            active={tab === "timer"}
            onClick={() => setTab("timer")}
            icon={<TimerIcon size={17} strokeWidth={2.3} />}
            label="Timer"
            badge={timerRunning && tab !== "timer"}
          />
          <NavButton
            active={tab === "calendar"}
            onClick={() => setTab("calendar")}
            icon={<Calendar size={17} strokeWidth={2.3} />}
            label="Kalender"
          />
          <NavButton
            active={tab === "history"}
            onClick={() => setTab("history")}
            icon={<TrendingUp size={17} strokeWidth={2.3} />}
            label="Verlauf"
          />
        </nav>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, badge }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center py-1">
      <div
        className={
          "relative flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-colors w-full " +
          (active ? "bg-neutral-900 text-orange-400" : "text-neutral-600")
        }
      >
        {icon}
        <span className="text-[9px] font-bold tracking-wide">{label}</span>
        {badge && <span className="absolute top-0 right-3 w-1.5 h-1.5 rounded-full bg-orange-500" />}
      </div>
    </button>
  );
}

function StepperField({ label, value, step, min, onChange }) {
  return (
    <div className="bg-neutral-950 rounded-xl p-3 flex flex-col items-center">
      <span className="text-[10px] font-bold tracking-widest text-neutral-600 uppercase mb-2">{label}</span>
      <span className="text-[28px] font-bold tabular-nums leading-none mb-3">{value}</span>
      <div className="flex items-center gap-2 w-full">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="flex-1 h-10 rounded-lg bg-neutral-900 flex items-center justify-center active:bg-neutral-800 text-neutral-300"
        >
          <Minus size={16} strokeWidth={3} />
        </button>
        <button
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="flex-1 h-10 rounded-lg bg-neutral-900 flex items-center justify-center active:bg-neutral-800 text-neutral-300"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
