export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center px-6 py-5 sm:px-10">
        <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
          Yessrr
        </span>
      </header>

      <main className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center sm:px-10 sm:py-28">
        <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Protocole d&rsquo;arbitrage automatisé
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Monétise ta communauté,
          <br />
          un appel à la fois.
        </h1>

        <p className="mx-auto mt-5 max-w-lg text-balance text-base leading-relaxed text-neutral-400">
          Tes fans réservent et paient un appel avec toi en un clic. Notre
          protocole garantit la présence :{" "}
          <span className="text-indigo-300">
            remboursé à la seconde près
          </span>{" "}
          si tu as un empêchement, payé quand même si c&rsquo;est ton fan qui
          ne vient pas.
        </p>

        <a
          href="/onboarding"
          className="mt-10 inline-block rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Devenir créateur
        </a>
      </main>
    </div>
  );
}
