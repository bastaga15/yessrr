import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface OverrideRequestBody {
  management_token: string;
  date: string; // "yyyy-MM-dd"
  is_available: boolean;
  start_time?: string; // "HH:MM", required when is_available
  end_time?: string;
}

async function findCreatorId(managementToken: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("creators")
    .select("id")
    .eq("management_token", managementToken)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

/** Sets (creates or replaces) the override for a specific date. */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<OverrideRequestBody>;
    const { management_token, date, is_available, start_time, end_time } = body;

    if (!management_token || !date || typeof is_available !== "boolean") {
      return NextResponse.json(
        { error: "management_token, date et is_available sont requis." },
        { status: 400 },
      );
    }

    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json({ error: "date doit être au format YYYY-MM-DD." }, { status: 400 });
    }

    if (is_available) {
      if (!start_time || !end_time || !TIME_PATTERN.test(start_time) || !TIME_PATTERN.test(end_time)) {
        return NextResponse.json(
          { error: "start_time et end_time (HH:MM) sont requis quand is_available est vrai." },
          { status: 400 },
        );
      }
      if (end_time <= start_time) {
        return NextResponse.json({ error: "end_time doit être après start_time." }, { status: 400 });
      }
    }

    const creatorId = await findCreatorId(management_token);
    if (!creatorId) {
      return NextResponse.json({ error: "Lien de gestion invalide." }, { status: 404 });
    }

    const { error: upsertError } = await supabase.from("availability_overrides").upsert(
      {
        creator_id: creatorId,
        date,
        is_available,
        start_time: is_available ? start_time : null,
        end_time: is_available ? end_time : null,
      },
      { onConflict: "creator_id,date" },
    );

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("[/api/creator/availability-overrides] PUT", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Removes the override for a date, reverting it to the recurring weekly rule. */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<Pick<OverrideRequestBody, "management_token" | "date">>;
    const { management_token, date } = body;

    if (!management_token || !date) {
      return NextResponse.json({ error: "management_token et date sont requis." }, { status: 400 });
    }

    const creatorId = await findCreatorId(management_token);
    if (!creatorId) {
      return NextResponse.json({ error: "Lien de gestion invalide." }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("availability_overrides")
      .delete()
      .eq("creator_id", creatorId)
      .eq("date", date);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[/api/creator/availability-overrides] DELETE", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
