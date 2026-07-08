"use client";

import { useMemo, useState } from "react";

interface WeeklyRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface Override {
  date: string; // "yyyy-MM-dd"
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Monday-first 6x7 grid covering the given month, including the trailing/
// leading days of the adjacent months needed to fill whole weeks.
function buildMonthGrid(viewMonth: Date): Date[] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    return date;
  });
}

export function AvailabilityCalendar({
  managementToken,
  initialRules,
  initialOverrides,
}: {
  managementToken: string;
  initialRules: WeeklyRule[];
  initialOverrides: Override[];
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [overrides, setOverrides] = useState<Record<string, Override>>(() => {
    const map: Record<string, Override> = {};
    for (const override of initialOverrides) map[override.date] = override;
    return map;
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mode, setMode] = useState<"available" | "blocked">("available");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rulesByDay = useMemo(() => {
    const map = new Map<number, WeeklyRule>();
    for (const rule of initialRules) map.set(rule.day_of_week, rule);
    return map;
  }, [initialRules]);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const isCurrentMonthView =
    viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();

  function describeDay(date: Date): { label: string; tone: "override-available" | "recurring" | "blocked" | "closed" } {
    const key = toDateKey(date);
    const override = overrides[key];

    if (override) {
      return override.is_available
        ? { label: `${override.start_time!.slice(0, 5)}-${override.end_time!.slice(0, 5)}`, tone: "override-available" }
        : { label: "Bloqué", tone: "blocked" };
    }

    const rule = rulesByDay.get(date.getDay());
    return rule
      ? { label: `${rule.start_time.slice(0, 5)}-${rule.end_time.slice(0, 5)}`, tone: "recurring" }
      : { label: "Fermé", tone: "closed" };
  }

  function openDay(date: Date) {
    if (date < today) return;

    const key = toDateKey(date);
    setSelectedDate(key);
    setError(null);

    const override = overrides[key];
    if (override?.is_available) {
      setMode("available");
      setStartTime(override.start_time!.slice(0, 5));
      setEndTime(override.end_time!.slice(0, 5));
    } else if (override) {
      setMode("blocked");
    } else {
      const rule = rulesByDay.get(date.getDay());
      setMode("available");
      setStartTime(rule ? rule.start_time.slice(0, 5) : "09:00");
      setEndTime(rule ? rule.end_time.slice(0, 5) : "18:00");
    }
  }

  async function handleSave() {
    if (!selectedDate) return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/creator/availability-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          management_token: managementToken,
          date: selectedDate,
          is_available: mode === "available",
          ...(mode === "available" ? { start_time: startTime, end_time: endTime } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Une erreur est survenue.");

      setOverrides((prev) => ({
        ...prev,
        [selectedDate]:
          mode === "available"
            ? { date: selectedDate, is_available: true, start_time: `${startTime}:00`, end_time: `${endTime}:00` }
            : { date: selectedDate, is_available: false, start_time: null, end_time: null },
      }));
      setSelectedDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetToRecurring() {
    if (!selectedDate) return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/creator/availability-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ management_token: managementToken, date: selectedDate }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Une erreur est survenue.");

      setOverrides((prev) => {
        const next = { ...prev };
        delete next[selectedDate];
        return next;
      });
      setSelectedDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setIsSaving(false);
    }
  }

  const toneClasses: Record<string, string> = {
    "override-available": "border-indigo-400/50 bg-indigo-500/10 text-indigo-200",
    recurring: "border-white/10 bg-white/5 text-neutral-300",
    blocked: "border-red-400/30 bg-red-500/10 text-red-300",
    closed: "border-white/5 bg-transparent text-neutral-600",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-indigo-950/50 sm:p-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Exceptions par date
        </h2>
        <div className="flex items-center gap-3 text-sm text-neutral-300">
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            disabled={isCurrentMonthView}
            className="disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Mois précédent"
          >
            ←
          </button>
          <span className="min-w-[9rem] text-center capitalize">{MONTH_FORMATTER.format(viewMonth)}</span>
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Mois suivant"
          >
            →
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-neutral-400">
        Clique une date pour la rendre disponible avec des horaires différents,
        ou la bloquer — sans toucher à ton planning récurrent ni aux
        réservations déjà faites.
      </p>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="pb-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const inMonth = date.getMonth() === viewMonth.getMonth();
          const isPast = date < today;
          const { label, tone } = describeDay(date);
          const key = toDateKey(date);

          return (
            <button
              key={key}
              type="button"
              onClick={() => openDay(date)}
              disabled={isPast}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-[11px] transition disabled:cursor-not-allowed ${
                inMonth ? toneClasses[tone] : "border-transparent text-neutral-700"
              } ${isPast ? "opacity-30" : "hover:border-indigo-400/50"} ${
                selectedDate === key ? "ring-1 ring-indigo-400" : ""
              }`}
            >
              <span className="font-semibold">{date.getDate()}</span>
              {inMonth && <span className="leading-tight">{label}</span>}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-sm text-white">
            Modifier le{" "}
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("available")}
              className={`flex-1 rounded-lg border py-1.5 text-sm ${
                mode === "available"
                  ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-200"
                  : "border-white/10 text-neutral-400"
              }`}
            >
              Disponible
            </button>
            <button
              type="button"
              onClick={() => setMode("blocked")}
              className={`flex-1 rounded-lg border py-1.5 text-sm ${
                mode === "blocked"
                  ? "border-red-400/40 bg-red-500/10 text-red-300"
                  : "border-white/10 text-neutral-400"
              }`}
            >
              Bloqué
            </button>
          </div>

          {mode === "available" && (
            <div className="mb-3 flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              />
              <span className="text-neutral-500">→</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              />
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {overrides[selectedDate] && (
              <button
                type="button"
                onClick={handleResetToRecurring}
                disabled={isSaving}
                className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-neutral-300 hover:border-white/30"
              >
                Revenir au planning récurrent
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="ml-auto text-sm text-neutral-500 hover:text-neutral-300"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
