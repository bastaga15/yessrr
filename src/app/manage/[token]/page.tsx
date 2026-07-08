import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AvailabilityEditor } from "./availability-editor";

// Must always reflect the latest saved rules — never let Next.js cache the
// underlying Supabase fetch for this page.
export const dynamic = "force-dynamic";

export default async function ManageAvailabilityPage({
  params,
}: {
  params: { token: string };
}) {
  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, slug")
    .eq("management_token", params.token)
    .maybeSingle();

  if (!creator) {
    notFound();
  }

  const { data: rules } = await supabase
    .from("weekly_availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("creator_id", creator.id);

  return (
    <AvailabilityEditor
      managementToken={params.token}
      creatorName={creator.name}
      creatorSlug={creator.slug}
      initialRules={rules ?? []}
    />
  );
}
