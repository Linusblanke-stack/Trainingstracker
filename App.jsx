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
  ChevronDown,
  RotateCcw,
  Volume2,
  VolumeX,
  Vibrate,
  Pencil,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const DEFAULT_DAYS = [
  { id: "arme", name: "Arme", exerciseNames: [] },
  { id: "beine", name: "Beine", exerciseNames: [] },
  { id: "ruecken", name: "Rücken", exerciseNames: [] },
  { id: "brust", name: "Brust", exerciseNames: [] },
];

const STORAGE_KEY_DAYS = "trainings-tracker:days";
const STORAGE_KEY_DAY_SESSIONS = "trainings-tracker:day-sessions";
const STORAGE_KEY_DRAFTS = "trainings-tracker:drafts";
const STORAGE_KEY_ACTIVE_DAY = "trainings-tracker:active-day";
const STORAGE_KEY_SESSIONS_LEGACY = "trainings-tracker:sessions";

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

// Alte Einzel-Übungs-Einträge (Vorversion der App) in das neue Tages-Format überführen,
// damit beim Update keine bereits gespeicherten Trainings verloren gehen.
function migrateLegacySessions(oldSessions) {
  if (!oldSessions || oldSessions.length === 0) return [];
  return oldSessions.map((s) => ({
    id: s.id,
    dayId: "sonstiges",
    dayName: "Sonstiges",
    date: s.date && s.date.length === 10 ? s.date : todayStr(),
    entries: [{ name: s.exercise, sets: s.sets }],
  }));
}

export default function App() {
  const [tab, setTab] = useState("log");

  const [days, setDays] = useState(() => {
    const stored = loadFromStorage(STORAGE_KEY_DAYS, null);
    if (stored) return stored;
    const legacy = loadFromStorage(STORAGE_KEY_SESSIONS_LEGACY, []);
    if (legacy && legacy.length > 0) {
      return [
        ...DEFAULT_DAYS,
        { id: "sonstiges", name: "Sonstiges", exerciseNames: [...new Set(legacy.map((s) => s.exercise))] },
      ];
    }
    return DEFAULT_DAYS;
  });

  const [daySessions, setDaySessions] = useState(() => {
    const stored = loadFromStorage(STORAGE_KEY_DAY_SESSIONS, null);
    if (stored) return stored;
    return migrateLegacySessions(loadFromStorage(STORAGE_KEY_SESSIONS_LEGACY, []));
  });

  const [activeDayId, setActiveDayId] = useState(() => {
    const stored = loadFromStorage(STORAGE_KEY_ACTIVE_DAY, null);
    return stored || days[0]?.id;
  });
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [drafts, setDrafts] = useState(() => loadFromStorage(STORAGE_KEY_DRAFTS, {}));
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [exerciseInputs, setExerciseInputs] = useState({});
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmDeleteDayId, setConfirmDeleteDayId] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const [addingDay, setAddingDay] = useState(false);
  const [newDayName, setNewDayName] = useState("");
  const [managingExercises, setManagingExercises] = useState(false);
  const [newExerciseNameForDay, setNewExerciseNameForDay] = useState("");
  const dayInputRef = useRef(null);
  const exerciseInputRef = useRef(null);

  const [historyDayId, setHistoryDayId] = useState(() => days[0]?.id);
  const [historyExerciseName, setHistoryExerciseName] = useState(null);

  // Timer-State (lebt oben in App, damit er weiterläuft, egal welcher Tab offen ist)
  const [timerDuration, setTimerDuration] = useState(60);
  const [timerRemaining, setTimerRemaining] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => loadFromStorage("trainings-tracker:sound", true));
  const [vibrationEnabled, setVibrationEnabled] = useState(() => loadFromStorage("trainings-tracker:vibration", true));

  // Kalender-State
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(() => todayStr());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DAYS, JSON.stringify(days));
  }, [days]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DAY_SESSIONS, JSON.stringify(daySessions));
  }, [daySessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    setHistoryExerciseName(null);
  }, [historyDayId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_DAY, JSON.stringify(activeDayId));
  }, [activeDayId]);

  useEffect(() => {
    if (days.length > 0 && !days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0].id);
    }
  }, [days, activeDayId]);

  useEffect(() => {
    setExpandedExercise(null);
    setManagingExercises(false);
  }, [activeDayId]);

  useEffect(() => {
    localStorage.setItem("trainings-tracker:sound", JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("trainings-tracker:vibration", JSON.stringify(vibrationEnabled));
  }, [vibrationEnabled]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setTimerRunning(false);
          if (soundEnabled) playBeep();
          if (vibrationEnabled && navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, soundEnabled, vibrationEnabled]);

  const activeDay = days.find((d) => d.id === activeDayId) || days[0];
  const historyDay = days.find((d) => d.id === historyDayId) || days[0];

  const activeDraft = drafts[activeDayId] || {};

  // Findet den zuletzt gespeicherten Satz für genau diese Übung (unabhängig vom Tag),
  // damit jede Übung ihren eigenen letzten Wert behält statt einen geteilten.
  function getLastValuesForExercise(name) {
    const sorted = [...daySessions].sort((a, b) => b.date.localeCompare(a.date));
    for (const s of sorted) {
      const entry = s.entries.find((e) => e.name === name);
      if (entry && entry.sets.length > 0) {
        const last = entry.sets[entry.sets.length - 1];
        return { weight: last.weight, reps: last.reps };
      }
    }
    return { weight: 20, reps: 8 };
  }

  function getExerciseInput(name) {
    return exerciseInputs[name] || getLastValuesForExercise(name);
  }

  function setExerciseInput(name, patch) {
    setExerciseInputs((ei) => ({
      ...ei,
      [name]: { ...getExerciseInput(name), ...patch },
    }));
  }

  function addSetToDraft(name) {
    const { weight, reps } = getExerciseInput(name);
    if (editingSessionId) {
      setEditDraft((d) => ({
        ...d,
        [name]: [...(d[name] || []), { id: uid(), weight, reps }],
      }));
      return;
    }
    setDrafts((d) => ({
      ...d,
      [activeDayId]: {
        ...(d[activeDayId] || {}),
        [name]: [...((d[activeDayId] || {})[name] || []), { id: uid(), weight, reps }],
      },
    }));
  }

  function removeSetFromDraft(name, id) {
    if (editingSessionId) {
      setEditDraft((d) => ({
        ...d,
        [name]: (d[name] || []).filter((s) => s.id !== id),
      }));
      return;
    }
    setDrafts((d) => ({
      ...d,
      [activeDayId]: {
        ...(d[activeDayId] || {}),
        [name]: ((d[activeDayId] || {})[name] || []).filter((s) => s.id !== id),
      },
    }));
  }

  function discardDraft() {
    setDrafts((d) => {
      const copy = { ...d };
      delete copy[activeDayId];
      return copy;
    });
    setExpandedExercise(null);
  }

  function cancelEditSession() {
    setEditingSessionId(null);
    setEditDraft({});
    setExpandedExercise(null);
  }

  function saveDaySession() {
    const sourceDraft = editingSessionId ? editDraft : activeDraft;
    const entries = Object.entries(sourceDraft)
      .filter(([, sets]) => sets.length > 0)
      .map(([name, sets]) => ({ name, sets }));
    if (entries.length === 0) return;

    if (editingSessionId) {
      setDaySessions((s) =>
        s.map((sess) =>
          sess.id === editingSessionId
            ? { ...sess, dayId: activeDay.id, dayName: activeDay.name, date: selectedDate, entries }
            : sess
        )
      );
      setEditingSessionId(null);
      setEditDraft({});
    } else {
      const session = {
        id: uid(),
        dayId: activeDay.id,
        dayName: activeDay.name,
        date: selectedDate,
        entries,
      };
      setDaySessions((s) => [session, ...s]);
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[activeDayId];
        return copy;
      });
    }

    setExpandedExercise(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
  }

  function startEditSession(session) {
    // Übungen, die im gespeicherten Tag vorkommen, aber inzwischen aus der Vorlage entfernt wurden, wieder ergänzen
    setDays((ds) =>
      ds.map((d) => {
        if (d.id !== session.dayId) return d;
        const missing = session.entries.map((e) => e.name).filter((n) => !d.exerciseNames.includes(n));
        return missing.length > 0 ? { ...d, exerciseNames: [...d.exerciseNames, ...missing] } : d;
      })
    );

    // Bewusst in editDraft geladen, NICHT in drafts[dayId] — sonst würde ein gerade laufendes
    // Live-Training desselben Tagestyps überschrieben werden.
    const draftForDay = {};
    session.entries.forEach((e) => {
      draftForDay[e.name] = e.sets;
    });
    setEditDraft(draftForDay);
    setEditingSessionId(session.id);
    setActiveDayId(session.dayId);
    setSelectedDate(session.date);
    setExpandedExercise(null);
    setTab("log");
  }

  function deleteDaySession(id) {
    setDaySessions((s) => s.filter((x) => x.id !== id));
  }

  function confirmNewDay() {
    const name = newDayName.trim();
    if (!name) {
      setAddingDay(false);
      return;
    }
    const id = uid();
    setDays((d) => [...d, { id, name, exerciseNames: [] }]);
    setActiveDayId(id);
    setNewDayName("");
    setAddingDay(false);
  }

  function deleteDay(id, e) {
    e.stopPropagation();
    if (days.length <= 1) return;
    setConfirmDeleteDayId(id);
  }

  function confirmDeleteDay() {
    const id = confirmDeleteDayId;
    const remaining = days.filter((x) => x.id !== id);
    setDays(remaining);
    if (activeDayId === id) setActiveDayId(remaining[0].id);
    if (historyDayId === id) setHistoryDayId(remaining[0].id);
    setConfirmDeleteDayId(null);
  }

  function addExerciseToDay() {
    const name = newExerciseNameForDay.trim();
    if (!name) return;
    setDays((ds) =>
      ds.map((d) =>
        d.id === activeDayId
          ? d.exerciseNames.includes(name)
            ? d
            : { ...d, exerciseNames: [...d.exerciseNames, name] }
          : d
      )
    );
    setNewExerciseNameForDay("");
    setTimeout(() => exerciseInputRef.current && exerciseInputRef.current.focus(), 50);
  }

  function removeExerciseFromDay(name) {
    setDays((ds) =>
      ds.map((d) => (d.id === activeDayId ? { ...d, exerciseNames: d.exerciseNames.filter((n) => n !== name) } : d))
    );
    setDrafts((d) => {
      if (!d[activeDayId]) return d;
      const dayDraft = { ...d[activeDayId] };
      delete dayDraft[name];
      return { ...d, [activeDayId]: dayDraft };
    });
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

  const totalDraftSets = Object.values(editingSessionId ? editDraft : activeDraft).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  const historyDaySessions = daySessions
    .filter((s) => s.dayId === historyDayId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const historyChartData = historyDaySessions.map((s) => ({
    date: formatDate(s.date),
    volume: s.entries.reduce((sum, e) => sum + e.sets.reduce((ss, set) => ss + set.weight * set.reps, 0), 0),
  }));

  const exerciseChartData = historyDaySessions
    .filter((s) => s.entries.some((e) => e.name === historyExerciseName))
    .map((s) => {
      const entry = s.entries.find((e) => e.name === historyExerciseName);
      return {
        date: formatDate(s.date),
        maxWeight: Math.max(...entry.sets.map((set) => set.weight)),
      };
    });

  const historySessionsDesc = [...historyDaySessions].reverse();

  const sessionsByDate = daySessions.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});

  const monthCount = daySessions.filter((s) => s.date.slice(0, 7) === todayStr().slice(0, 7)).length;

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
            <div className="text-[16px] font-bold tabular-nums leading-none">{monthCount}</div>
            <div className="text-[9px] text-neutral-500 font-semibold uppercase tracking-wide mt-0.5">
              Diesen Monat
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-28">
          {tab === "log" && (
            <div className="px-5 pt-5">
              {editingSessionId && (
                <div className="flex items-center justify-between mb-4 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
                  <span className="text-[12px] font-semibold text-orange-400">Du bearbeitest einen gespeicherten Tag</span>
                  <button
                    onClick={cancelEditSession}
                    className="text-[12px] font-semibold text-neutral-400 active:text-neutral-200"
                  >
                    Abbrechen
                  </button>
                </div>
              )}
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

              {/* Tag chips */}
              <div className="mb-1">
                <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Tag</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-6 mt-2">
                {days.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setActiveDayId(d.id)}
                    className={
                      "group px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 " +
                      (activeDayId === d.id
                        ? "bg-orange-500 text-neutral-950"
                        : "bg-neutral-900 text-neutral-300 active:bg-neutral-800")
                    }
                  >
                    {d.name}
                    {days.length > 1 && (
                      <span
                        onClick={(e) => deleteDay(d.id, e)}
                        className={
                          "rounded-full p-0.5 -mr-1 " +
                          (activeDayId === d.id ? "text-neutral-950/50 active:text-neutral-950" : "text-neutral-600")
                        }
                      >
                        <X size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
                {!addingDay && (
                  <button
                    onClick={() => {
                      setAddingDay(true);
                      setTimeout(() => dayInputRef.current && dayInputRef.current.focus(), 50);
                    }}
                    className="px-3.5 py-2 rounded-full text-[13px] font-medium bg-neutral-900 text-neutral-400 flex items-center gap-1 active:bg-neutral-800"
                  >
                    <Plus size={13} strokeWidth={3} />
                    Neu
                  </button>
                )}
              </div>

              {addingDay && (
                <div className="mb-6 flex items-center gap-2">
                  <input
                    ref={dayInputRef}
                    value={newDayName}
                    onChange={(e) => setNewDayName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmNewDay()}
                    placeholder="Name des Tages, z. B. Schultern"
                    className="flex-1 bg-neutral-900 rounded-lg px-3.5 py-2.5 text-[14px] text-neutral-100 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button
                    onClick={confirmNewDay}
                    className="w-10 h-10 rounded-lg bg-orange-500 text-neutral-950 flex items-center justify-center shrink-0 active:bg-orange-400"
                  >
                    <Check size={18} strokeWidth={3} />
                  </button>
                </div>
              )}

              {activeDay && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                      Übungen · {activeDay.name}
                    </span>
                    <button
                      onClick={() => setManagingExercises((v) => !v)}
                      className="text-[12px] font-semibold text-orange-400 flex items-center gap-1"
                    >
                      {managingExercises ? (
                        "Fertig"
                      ) : (
                        <>
                          <Pencil size={11} /> Bearbeiten
                        </>
                      )}
                    </button>
                  </div>

                  {managingExercises && (
                    <div className="mb-4">
                      {activeDay.exerciseNames.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {activeDay.exerciseNames.map((name) => (
                            <span
                              key={name}
                              className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-neutral-900 text-neutral-300 flex items-center gap-1.5"
                            >
                              {name}
                              <span
                                onClick={() => removeExerciseFromDay(name)}
                                className="rounded-full p-0.5 -mr-1 text-neutral-600"
                              >
                                <X size={11} strokeWidth={3} />
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          ref={exerciseInputRef}
                          value={newExerciseNameForDay}
                          onChange={(e) => setNewExerciseNameForDay(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addExerciseToDay()}
                          placeholder="Übung hinzufügen"
                          className="flex-1 bg-neutral-900 rounded-lg px-3.5 py-2.5 text-[14px] text-neutral-100 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-orange-500"
                        />
                        <button
                          onClick={addExerciseToDay}
                          className="w-10 h-10 rounded-lg bg-orange-500 text-neutral-950 flex items-center justify-center shrink-0 active:bg-orange-400"
                        >
                          <Check size={18} strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  )}

                  {activeDay.exerciseNames.length === 0 && !managingExercises && (
                    <div className="text-center py-10">
                      <p className="text-[13px] text-neutral-600 mb-4">
                        Noch keine Übungen für {activeDay.name} angelegt.
                      </p>
                      <button
                        onClick={() => {
                          setManagingExercises(true);
                          setTimeout(() => exerciseInputRef.current && exerciseInputRef.current.focus(), 50);
                        }}
                        className="bg-neutral-100 text-neutral-950 rounded-xl px-4 py-2.5 text-[13px] font-bold active:bg-neutral-300"
                      >
                        Übungen hinzufügen
                      </button>
                    </div>
                  )}

                  {activeDay.exerciseNames.map((name) => (
                    <ExerciseEntryCard
                      key={name}
                      name={name}
                      expanded={expandedExercise === name}
                      onToggle={() => setExpandedExercise(expandedExercise === name ? null : name)}
                      sets={(editingSessionId ? editDraft : activeDraft)[name] || []}
                      weight={getExerciseInput(name).weight}
                      reps={getExerciseInput(name).reps}
                      onWeightChange={(v) => setExerciseInput(name, { weight: v })}
                      onRepsChange={(v) => setExerciseInput(name, { reps: v })}
                      onAddSet={() => addSetToDraft(name)}
                      onRemoveSet={(id) => removeSetFromDraft(name, id)}
                    />
                  ))}

                  {totalDraftSets > 0 && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={saveDaySession}
                        className="flex-1 bg-orange-500 text-neutral-950 rounded-xl py-3.5 text-[14px] font-bold active:bg-orange-400 transition-colors"
                      >
                        {savedFlash
                          ? "Gespeichert ✓"
                          : editingSessionId
                          ? "Änderungen speichern"
                          : `${activeDay.name}-Tag speichern`}
                      </button>
                      <button
                        onClick={editingSessionId ? cancelEditSession : discardDraft}
                        className="w-14 rounded-xl bg-neutral-900 flex items-center justify-center active:bg-neutral-800 text-neutral-500"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </>
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

              <div className="flex gap-3 w-full mb-6">
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

              <div className="flex gap-2">
                <button
                  onClick={() => setSoundEnabled((v) => !v)}
                  className={
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors " +
                    (soundEnabled ? "bg-neutral-900 text-orange-400" : "bg-neutral-900/40 text-neutral-600")
                  }
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  Ton
                </button>
                <button
                  onClick={() => setVibrationEnabled((v) => !v)}
                  className={
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors " +
                    (vibrationEnabled ? "bg-neutral-900 text-orange-400" : "bg-neutral-900/40 text-neutral-600")
                  }
                >
                  <Vibrate size={16} />
                  Vibration
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
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-bold">{s.dayName}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEditSession(s)}
                              className="text-neutral-600 active:text-orange-400 p-1"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteDaySession(s.id)}
                              className="text-neutral-700 active:text-red-400 p-1 -mr-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {s.entries.map((e) => (
                          <div key={e.name} className="mb-2 last:mb-0">
                            <div className="text-[11px] font-semibold text-neutral-500 mb-1">{e.name}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {e.sets.map((set, i) => (
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
                    ))}
                    <button
                      onClick={() => goLogForDate(selectedCalendarDay)}
                      className="mt-1 text-[12px] font-semibold text-orange-400 text-center py-2"
                    >
                      + Weiteren Tag hier nachtragen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="px-5 pt-5">
              <div className="mb-1">
                <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Tag</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 mb-4">
                {days.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setHistoryDayId(d.id)}
                    className={
                      "px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors " +
                      (historyDayId === d.id
                        ? "bg-orange-500 text-neutral-950"
                        : "bg-neutral-900 text-neutral-300 active:bg-neutral-800")
                    }
                  >
                    {d.name}
                  </button>
                ))}
              </div>

              {historyDay && historyDay.exerciseNames.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  <button
                    onClick={() => setHistoryExerciseName(null)}
                    className={
                      "px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors " +
                      (historyExerciseName === null
                        ? "bg-neutral-100 text-neutral-950"
                        : "bg-neutral-900/60 text-neutral-500 active:bg-neutral-900")
                    }
                  >
                    Gesamt
                  </button>
                  {historyDay.exerciseNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => setHistoryExerciseName(name)}
                      className={
                        "px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors " +
                        (historyExerciseName === name
                          ? "bg-neutral-100 text-neutral-950"
                          : "bg-neutral-900/60 text-neutral-500 active:bg-neutral-900")
                      }
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}

              {historyExerciseName === null && historyChartData.length === 0 && (
                <div className="text-center py-16">
                  <TrendingUp size={28} className="mx-auto text-neutral-700 mb-3" />
                  <p className="text-[13px] text-neutral-600">Noch keine gespeicherten {historyDay?.name}-Tage.</p>
                </div>
              )}

              {historyExerciseName === null && historyChartData.length > 0 && (
                <div className="bg-neutral-900 rounded-2xl p-4 pt-5 mb-6 border border-neutral-800">
                  <div className="flex items-baseline justify-between px-1 mb-3">
                    <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                      Gesamtvolumen
                    </span>
                    <span className="text-[20px] font-bold tabular-nums text-orange-400">
                      {historyChartData[historyChartData.length - 1].volume}
                      <span className="text-[12px] text-neutral-500 font-semibold"> kg</span>
                    </span>
                  </div>
                  <div style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <LineChart data={historyChartData} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
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
                          domain={["dataMin - 20", "dataMax + 20"]}
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
                          formatter={(v) => [`${v} kg`, "Gesamtvolumen"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="volume"
                          stroke="#fb923c"
                          strokeWidth={2.5}
                          dot={{ fill: "#fb923c", r: 3.5, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {historyExerciseName !== null && exerciseChartData.length === 0 && (
                <div className="text-center py-16">
                  <TrendingUp size={28} className="mx-auto text-neutral-700 mb-3" />
                  <p className="text-[13px] text-neutral-600">Noch keine Werte für {historyExerciseName}.</p>
                </div>
              )}

              {historyExerciseName !== null && exerciseChartData.length > 0 && (
                <div className="bg-neutral-900 rounded-2xl p-4 pt-5 mb-6 border border-neutral-800">
                  <div className="flex items-baseline justify-between px-1 mb-3">
                    <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                      {historyExerciseName} · Maxgewicht
                    </span>
                    <span className="text-[20px] font-bold tabular-nums text-orange-400">
                      {exerciseChartData[exerciseChartData.length - 1].maxWeight}
                      <span className="text-[12px] text-neutral-500 font-semibold"> kg</span>
                    </span>
                  </div>
                  <div style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <LineChart data={exerciseChartData} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
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
              )}

              {historyDaySessions.length > 0 && (
                <>
                  <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Verlauf</span>
                  <div className="mt-2.5 flex flex-col gap-2">
                    {historySessionsDesc.map((s) => (
                      <div key={s.id} className="bg-neutral-900/60 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-semibold text-neutral-400">{formatDateLong(s.date)}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEditSession(s)}
                              className="text-neutral-600 active:text-orange-400 p-1"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteDaySession(s.id)}
                              className="text-neutral-700 active:text-red-400 p-1 -mr-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {s.entries.map((e) => (
                          <div key={e.name} className="mb-2 last:mb-0">
                            <div className="text-[11px] font-semibold text-neutral-500 mb-1">{e.name}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {e.sets.map((set, i) => (
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
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-neutral-950/95 backdrop-blur border-t border-neutral-900 flex px-3 py-2 gap-1">
          <NavButton
            active={tab === "log"}
            onClick={() => setTab("log")}
            icon={<Dumbbell size={17} strokeWidth={2.3} />}
            label="Training"
          />
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

        {confirmDeleteDayId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setConfirmDeleteDayId(null)}
            />
            <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
              <h2 className="text-[16px] font-bold mb-2">
                "{days.find((d) => d.id === confirmDeleteDayId)?.name}" löschen?
              </h2>
              <p className="text-[13px] text-neutral-400 leading-relaxed mb-5">
                Alle zugehörigen Übungen dieses Tages gehen dabei verloren. Bereits gespeicherte Trainings bleiben
                im Verlauf erhalten.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteDayId(null)}
                  className="flex-1 bg-neutral-800 text-neutral-200 rounded-xl py-2.5 text-[13px] font-semibold active:bg-neutral-700"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmDeleteDay}
                  className="flex-1 bg-red-500 text-neutral-950 rounded-xl py-2.5 text-[13px] font-bold active:bg-red-400"
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        )}
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

function ExerciseEntryCard({
  name,
  expanded,
  onToggle,
  sets,
  weight,
  reps,
  onWeightChange,
  onRepsChange,
  onAddSet,
  onRemoveSet,
}) {
  return (
    <div className="bg-neutral-900 rounded-2xl mb-3 border border-neutral-800 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5">
        <span className="text-[14px] font-bold">{name}</span>
        <div className="flex items-center gap-2">
          {sets.length > 0 && (
            <span className="text-[11px] font-bold text-orange-400 bg-orange-500/10 rounded-full px-2 py-0.5">
              {sets.length} {sets.length === 1 ? "Satz" : "Sätze"}
            </span>
          )}
          <ChevronDown
            size={16}
            className={"text-neutral-500 transition-transform " + (expanded ? "rotate-180" : "")}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <StepperField label="kg" value={weight} step={0.25} min={0} onChange={onWeightChange} />
            <StepperField label="Wdh." value={reps} step={1} min={1} onChange={onRepsChange} integer />
          </div>
          <button
            onClick={onAddSet}
            className="w-full bg-neutral-100 text-neutral-950 rounded-xl py-2.5 text-[13px] font-bold flex items-center justify-center gap-1.5 active:bg-neutral-300 mb-3"
          >
            <Plus size={15} strokeWidth={3} />
            Satz hinzufügen
          </button>
          {sets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {sets.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between bg-neutral-950 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums">
                      {s.weight}
                      <span className="text-neutral-500 font-medium text-[11px]"> kg</span>
                    </span>
                    <span className="text-neutral-700">×</span>
                    <span className="text-[13px] font-bold tabular-nums">
                      {s.reps}
                      <span className="text-neutral-500 font-medium text-[11px]"> Wdh.</span>
                    </span>
                  </div>
                  <button onClick={() => onRemoveSet(s.id)} className="text-neutral-600 active:text-red-400 p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepperField({ label, value, step, min, onChange, integer }) {
  const [text, setText] = useState(String(value));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setText(String(value));
    }
  }, [value]);

  function handleInputChange(e) {
    const rawInput = e.target.value;
    setText(rawInput);
    const raw = rawInput.replace(",", ".");
    if (raw === "" || raw === "-") return;
    const num = parseFloat(raw);
    if (!isNaN(num)) onChange(integer ? Math.round(num) : num);
  }

  function handleFocus(e) {
    isFocused.current = true;
    e.target.select();
  }

  function handleBlur() {
    isFocused.current = false;
    const num = parseFloat(text.replace(",", "."));
    if (text.trim() === "" || isNaN(num)) {
      setText(String(value));
    }
  }

  return (
    <div className="bg-neutral-950 rounded-xl p-3 flex flex-col items-center">
      <span className="text-[10px] font-bold tracking-widest text-neutral-600 uppercase mb-2">{label}</span>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="text-[28px] font-bold tabular-nums leading-none mb-3 bg-transparent text-center w-full outline-none focus:text-orange-400"
      />
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
