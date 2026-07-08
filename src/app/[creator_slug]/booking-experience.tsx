"use client";

import { useEffect, useState } from "react";

export interface DaySlots {
  date: string;
  label: string;
  slots: { time: string; iso: string }[];
}

interface SelectedSlot {
  iso: string;
  time: string;
  dayLabel: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function BookingExperience({
  creatorSlug,
  creatorName,
  days,
}: {
  creatorSlug: string;
  creatorName: string;
  days: DaySlots[];
}) {
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSlot) return;
    const frame = requestAnimationFrame(() => setModalVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [selectedSlot]);

  function openSlot(day: DaySlots, slot: { time: string; iso: string }) {
    setError(null);
    setSelectedSlot({ iso: slot.iso, time: slot.time, dayLabel: day.label });
  }

  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setSelectedSlot(null), 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_slug: creatorSlug,
          customer_email: customerEmail,
          customer_name: customerName,
          slot_time: selectedSlot.iso,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Une erreur est survenue.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center justify-between border-b border-white/10 px-6 py-5 sm:px-10">
        <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
          Yessrr
        </span>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-semibold">
            {initials(creatorName)}
          </span>
          <span className="text-sm text-neutral-300">{creatorName}</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-6 py-16 text-center sm:px-10 sm:py-24">
        <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Protocole d&rsquo;arbitrage automatisé
        </span>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Réserve un appel avec {creatorName}
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-neutral-400">
          Réserve et paye ton coaching en 1 clic. Notre protocole garantit la
          présence : si le créateur a un empêchement, tu es{" "}
          <span className="text-indigo-300">
            remboursé à la seconde près
          </span>
          . Si tu ne viens pas, il est payé.
        </p>

        <section className="mt-12 space-y-8 text-left">
          {days.length === 0 && (
            <p className="text-center text-sm text-neutral-500">
              Aucun créneau disponible pour le moment — reviens bientôt.
            </p>
          )}

          {days.map((day) => (
            <div key={day.date}>
              <h2 className="mb-4 text-center text-sm font-medium uppercase tracking-wide text-neutral-500">
                {day.label}
              </h2>
              <div className="mx-auto grid max-w-md grid-cols-2 gap-3 sm:grid-cols-4">
                {day.slots.map((slot) => (
                  <button
                    key={slot.iso}
                    onClick={() => openSlot(day, slot)}
                    className="rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-neutral-200 transition hover:border-indigo-400/50 hover:bg-indigo-500/10 hover:text-white"
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      {selectedSlot && (
        <div
          className={`fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity duration-200 ${
            modalVisible ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-indigo-950/50 transition-all duration-200 ${
              modalVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-sm text-neutral-500">
                  Créneau sélectionné
                </p>
                <p className="text-lg font-semibold text-white">
                  {selectedSlot.dayLabel} à {selectedSlot.time}
                </p>
                <p className="text-sm text-neutral-500">avec {creatorName}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-neutral-500 transition hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">
                  Nom
                </label>
                <input
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Jean Dupont"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="jean@exemple.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Redirection vers le paiement…" : "Confirmer et Payer"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
