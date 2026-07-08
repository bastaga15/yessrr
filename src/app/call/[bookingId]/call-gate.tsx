"use client";

import { useState } from "react";

export function CallGate({
  bookingId,
  role,
  videoRoomUrl,
  formattedSlot,
}: {
  bookingId: string;
  role: "creator" | "customer";
  videoRoomUrl: string;
  formattedSlot: string;
}) {
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setIsJoining(true);
    setError(null);

    try {
      const response = await fetch("/api/bookings/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, role }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Une erreur est survenue.");
      }

      window.location.href = videoRoomUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setIsJoining(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-8 text-center shadow-2xl shadow-indigo-950/50">
        <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          {formattedSlot}
        </span>
        <h1 className="mt-4 text-xl font-semibold text-white">Ton appel est prêt</h1>
        <p className="mt-2 text-sm text-neutral-400">
          En cliquant, on enregistre ton arrivée puis tu es redirigé vers
          l&rsquo;appel.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          onClick={handleJoin}
          disabled={isJoining}
          className="mt-6 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isJoining ? "Connexion…" : "Rejoindre l'appel"}
        </button>
      </div>
    </div>
  );
}
