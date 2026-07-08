"use client";

import { useState } from "react";
import type { ConnectStatus } from "@/lib/stripe-connect";

export function PaymentsSection({
  managementToken,
  status,
  releasedCount,
}: {
  managementToken: string;
  status: ConnectStatus;
  releasedCount: number;
}) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setIsRedirecting(true);
    setError(null);

    try {
      const response = await fetch("/api/creator/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ management_token: managementToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Une erreur est survenue.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setIsRedirecting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-indigo-950/50 sm:p-8">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
        Paiements
      </h2>

      {status.payoutsEnabled ? (
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
            ✓ Paiements activés — tu reçois automatiquement ta part à chaque réservation.
          </p>
          {releasedCount > 0 && (
            <p className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
              {releasedCount} paiement{releasedCount > 1 ? "s" : ""} en attente
              {releasedCount > 1 ? " viennent" : " vient"} d&rsquo;être débloqué
              {releasedCount > 1 ? "s" : ""} et arrivent sur ton compte.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-400">
            {status.connected
              ? "Ta configuration Stripe n'est pas encore terminée — reprends là où tu t'es arrêté."
              : "Tu peux déjà recevoir des réservations sans faire ça maintenant. Connecte ton compte Stripe quand tu veux pour être payé — l'argent de tes réservations t'attend, rien n'est perdu si tu attends."}
          </p>

          {error && (
            <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={handleConnect}
            disabled={isRedirecting}
            className="mt-4 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRedirecting
              ? "Redirection…"
              : status.connected
                ? "Continuer la configuration"
                : "Connecter mon compte Stripe"}
          </button>
        </>
      )}
    </div>
  );
}
