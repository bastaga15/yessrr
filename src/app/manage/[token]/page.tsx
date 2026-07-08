import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getConnectStatus } from "@/lib/stripe-connect";
import { releasePendingPayouts } from "@/lib/payouts";
import { AvailabilityEditor } from "./availability-editor";
import { PaymentsSection } from "./payments-section";

// Must always reflect the latest saved state — never let Next.js cache the
// underlying Supabase/Stripe fetches for this page.
export const dynamic = "force-dynamic";

export default async function ManageAvailabilityPage({
  params,
}: {
  params: { token: string };
}) {
  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, slug, stripe_connect_id")
    .eq("management_token", params.token)
    .maybeSingle();

  if (!creator) {
    notFound();
  }

  const { data: rules } = await supabase
    .from("weekly_availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("creator_id", creator.id);

  const connectStatus = await getConnectStatus(creator.stripe_connect_id);

  // The moment we see the creator is Connect-ready (typically their first
  // load of this page after finishing Stripe onboarding), sweep for any
  // booking that was decided in their favor while they were still pending —
  // that money has been sitting on the platform balance until now.
  let releasedCount = 0;
  if (connectStatus.payoutsEnabled && creator.stripe_connect_id) {
    releasedCount = await releasePendingPayouts(creator.id, creator.stripe_connect_id);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />

      <header className="relative z-10 flex items-center px-6 py-5 sm:px-10">
        <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
          Yessrr
        </span>
      </header>

      <main className="relative z-10 mx-auto max-w-xl space-y-8 px-6 py-10 sm:px-10 sm:py-16">
        <div className="text-center">
          <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Ton compte
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-white">
            Bonjour {creator.name}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Configure tes paiements et ton planning de disponibilités.
          </p>
        </div>

        <PaymentsSection
          managementToken={params.token}
          status={connectStatus}
          releasedCount={releasedCount}
        />

        <AvailabilityEditor
          managementToken={params.token}
          initialRules={rules ?? []}
        />

        <a
          href={`/${creator.slug}`}
          className="block text-center text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
        >
          Voir ma page de réservation →
        </a>
      </main>
    </div>
  );
}
