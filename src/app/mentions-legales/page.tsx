function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-400">{children}</div>
    </section>
  );
}

export default function MentionsLegalesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center px-6 py-5 sm:px-10">
        <a
          href="/"
          className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent"
        >
          Yessrr
        </a>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-6 py-10 sm:px-10 sm:py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Mentions légales
        </h1>
        <p className="mt-2 text-sm text-neutral-500">Dernière mise à jour : juillet 2026</p>

        <Section title="Éditeur du site">
          <p>
            Le site yessrr.fr est édité par Bastien Lechat, micro-entrepreneur,
            immatriculé sous le SIRET{" "}
            <strong className="text-neutral-200">945 007 615 00012</strong>.
          </p>
          <p>Adresse : Joinville-le-Pont (94), France</p>
          <p>
            Email :{" "}
            <a
              href="mailto:bastien.lechat@yessrr.fr"
              className="text-indigo-300 underline-offset-4 hover:underline"
            >
              bastien.lechat@yessrr.fr
            </a>
          </p>
          <p>Directeur de la publication : Bastien Lechat</p>
        </Section>

        <Section title="Hébergement">
          <p>
            Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA
            91789, États-Unis —{" "}
            <a
              href="https://vercel.com"
              className="text-indigo-300 underline-offset-4 hover:underline"
            >
              vercel.com
            </a>
            .
          </p>
        </Section>

        <Section title="Prestataires techniques">
          <p>
            Pour fonctionner, Yessrr fait appel aux prestataires suivants, qui
            traitent tout ou partie des données nécessaires au service :
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-neutral-300">Supabase Inc.</strong> —
              hébergement de la base de données.
            </li>
            <li>
              <strong className="text-neutral-300">Stripe, Inc.</strong> — traitement
              des paiements et virements aux créateurs.
            </li>
            <li>
              <strong className="text-neutral-300">Resend</strong> — envoi des emails
              transactionnels (confirmations, rappels).
            </li>
          </ul>
        </Section>

        <Section title="Propriété intellectuelle">
          <p>
            L&rsquo;ensemble des éléments du site yessrr.fr (textes, logo, charte
            graphique, code) est protégé au titre du droit d&rsquo;auteur. Toute
            reproduction ou représentation, totale ou partielle, sans autorisation
            préalable, est interdite.
          </p>
        </Section>

        <Section title="Données personnelles">
          <p>
            Les données collectées (email, nom, informations de paiement) sont
            utilisées exclusivement pour permettre la réservation et le bon
            déroulement des appels entre créateurs et clients. Une politique de
            confidentialité détaillée sera publiée séparément.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Pour toute question relative au site ou à ces mentions légales,
            contacte-nous à l&rsquo;adresse indiquée ci-dessus.
          </p>
        </Section>

        <a
          href="/"
          className="mt-10 inline-block text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
        >
          ← Retour à l&rsquo;accueil
        </a>
      </main>
    </div>
  );
}
