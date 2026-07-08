"use client";

import { useState } from "react";

interface Rule {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const DAYS = [
  { day_of_week: 1, label: "Lundi" },
  { day_of_week: 2, label: "Mardi" },
  { day_of_week: 3, label: "Mercredi" },
  { day_of_week: 4, label: "Jeudi" },
  { day_of_week: 5, label: "Vendredi" },
  { day_of_week: 6, label: "Samedi" },
  { day_of_week: 0, label: "Dimanche" },
];

type DayState = { enabled: boolean; start: string; end: string };

function buildInitialState(initialRules: Rule[]): Record<number, DayState> {
  const state: Record<number, DayState> = {};
  for (const day of DAYS) {
    const existing = initialRules.find((rule) => rule.day_of_week === day.day_of_week);
    state[day.day_of_week] = existing
      ? { enabled: true, start: existing.start_time.slice(0, 5), end: existing.end_time.slice(0, 5) }
      : { enabled: false, start: "09:00", end: "18:00" };
  }
  return state;
}

export function AvailabilityEditor({
  managementToken,
  creatorName,
  creatorSlug,
  initialRules,
}: {
  managementToken: string;
  creatorName: string;
  creatorSlug: string;
  initialRules: Rule[];
}) {
  const [days, setDays] = useState<Record<number, DayState>>(() => buildInitialState(initialRules));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateDay(dayOfWeek: number, patch: Partial<DayState>) {
    setSaved(false);
    setDays((prev) => ({ ...prev, [dayOfWeek]: { ...prev[dayOfWeek], ...patch } }));
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSaved(false);

    const rules = Object.entries(days)
      .filter(([, state]) => state.enabled)
      .map(([dayOfWeek, state]) => ({
        day_of_week: Number(dayOfWeek),
        start_time: state.start,
        end_time: state.end,
      }));

    try {
      const response = await fetch("/api/creator/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ management_token: managementToken, rules }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Une erreur est survenue.");
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center px-6 py-5 sm:px-10">
        <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
          Yessrr
        </span>
      </header>

      <main className="relative z-10 mx-auto max-w-xl px-6 py-10 sm:px-10 sm:py-16">
        <div className="text-center">
          <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Ton planning
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-white">
            Disponibilités de {creatorName}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Coche les jours où tu es disponible et définis tes horaires. Les
            réservations déjà payées ne sont jamais affectées.
          </p>
        </div>

        <div className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-indigo-950/50 sm:p-8">
          {DAYS.map((day) => {
            const state = days[day.day_of_week];
            return (
              <div
                key={day.day_of_week}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <label className="flex w-32 items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(e) => updateDay(day.day_of_week, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 accent-indigo-500"
                  />
                  {day.label}
                </label>

                <input
                  type="time"
                  value={state.start}
                  disabled={!state.enabled}
                  onChange={(e) => updateDay(day.day_of_week, { start: e.target.value })}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white disabled:opacity-40"
                />
                <span className="text-neutral-500">→</span>
                <input
                  type="time"
                  value={state.end}
                  disabled={!state.enabled}
                  onChange={(e) => updateDay(day.day_of_week, { end: e.target.value })}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white disabled:opacity-40"
                />
              </div>
            );
          })}

          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
              Planning enregistré.
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-2 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>

          <a
            href={`/${creatorSlug}`}
            className="block text-center text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
          >
            Voir ma page de réservation →
          </a>
        </div>
      </main>
    </div>
  );
}
