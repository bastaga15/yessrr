"use client";

import { useState } from "react";

const YESSRR_DOMAIN = "yessrr.fr/";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // strip accents (e.g. "é" -> "e")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function OnboardingPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");

  const [slug, setSlug] = useState("");
  // Once the creator edits the slug field directly, stop overwriting it from
  // Prénom/Nom — they've taken the wheel (e.g. to pick a pseudonym).
  const [slugTouched, setSlugTouched] = useState(false);

  const [slugError, setSlugError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [managementToken, setManagementToken] = useState<string | null>(null);

  function handleFirstName(value: string) {
    setFirstName(value);
    if (!slugTouched) setSlug(slugify(`${value} ${lastName}`));
  }

  function handleLastName(value: string) {
    setLastName(value);
    if (!slugTouched) setSlug(slugify(`${firstName} ${value}`));
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlugError(null);
    setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);
    setSlugError(null);

    try {
      const response = await fetch("/api/creator/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          hourly_rate: hourlyRate,
          slug,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data.field === "slug") {
          setSlugError(data.error ?? "Ce slug est déjà utilisé.");
        } else {
          setFormError(data.error ?? "Une erreur est survenue.");
        }
        return;
      }

      setCreatedSlug(data.slug);
      setManagementToken(data.management_token);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
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

      <main className="relative z-10 mx-auto max-w-lg px-6 py-10 sm:px-10 sm:py-16">
        {createdSlug ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900 p-8 text-center shadow-2xl shadow-indigo-950/50">
            <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              Compte créé
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-white">
              Ta page est en ligne !
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Partage ce lien à ta communauté :
            </p>
            <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm text-indigo-300">
              {YESSRR_DOMAIN}
              {createdSlug}
            </p>
            <a
              href={`/${createdSlug}`}
              className="mt-6 inline-block w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Voir ma page →
            </a>

            {managementToken && (
              <>
                <p className="mt-6 text-sm text-neutral-400">
                  Garde précieusement ce lien pour définir tes disponibilités
                  (personne d&rsquo;autre ne peut le retrouver) :
                </p>
                <p className="mt-2 break-all rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-neutral-300">
                  {`/manage/${managementToken}`}
                </p>
                <a
                  href={`/manage/${managementToken}`}
                  className="mt-3 inline-block w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:border-indigo-400/50 hover:bg-indigo-500/10 hover:text-white"
                >
                  Définir mes disponibilités →
                </a>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="text-center">
              <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                Deviens créateur Yessrr
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                Crée ta page de réservation
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                Quelques infos et ta communauté peut réserver un appel avec
                toi en un clic.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-indigo-950/50 sm:p-8"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">
                    Prénom
                  </label>
                  <input
                    required
                    value={firstName}
                    onChange={(e) => handleFirstName(e.target.value)}
                    placeholder="Jean"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">
                    Nom
                  </label>
                  <input
                    required
                    value={lastName}
                    onChange={(e) => handleLastName(e.target.value)}
                    placeholder="Dupont"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jean@exemple.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">
                  Tarif horaire
                </label>
                <div className="relative">
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="50"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-neutral-500">
                    €/h
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">
                  Ton URL Yessrr
                </label>
                <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5 focus-within:border-indigo-400/60 focus-within:ring-1 focus-within:ring-indigo-400/60">
                  <span className="flex items-center bg-white/5 pl-3 text-sm text-neutral-500">
                    {YESSRR_DOMAIN}
                  </span>
                  <input
                    required
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="jean-dupont"
                    className="w-full bg-transparent py-2 pr-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
                  />
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">
                  Aperçu :{" "}
                  <span className="text-indigo-300">
                    {YESSRR_DOMAIN}
                    {slug || "..."}
                  </span>
                </p>
                {slugError && (
                  <p className="mt-1.5 text-sm text-red-400">{slugError}</p>
                )}
              </div>

              {formError && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Création en cours…" : "Créer ma page"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
