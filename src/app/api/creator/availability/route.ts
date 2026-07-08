import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface RuleInput {
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
}

interface AvailabilityRequestBody {
  management_token: string;
  rules: RuleInput[];
}

function isValidRule(rule: unknown): rule is RuleInput {
  if (typeof rule !== "object" || rule === null) return false;
  const { day_of_week, start_time, end_time } = rule as Record<string, unknown>;

  return (
    typeof day_of_week === "number" &&
    Number.isInteger(day_of_week) &&
    day_of_week >= 0 &&
    day_of_week <= 6 &&
    typeof start_time === "string" &&
    TIME_PATTERN.test(start_time) &&
    typeof end_time === "string" &&
    TIME_PATTERN.test(end_time) &&
    end_time > start_time
  );
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AvailabilityRequestBody>;
    const { management_token, rules } = body;

    if (!management_token || !Array.isArray(rules)) {
      return NextResponse.json(
        { error: "management_token et rules (tableau) sont requis." },
        { status: 400 },
      );
    }

    if (!rules.every(isValidRule)) {
      return NextResponse.json(
        { error: "Chaque règle doit avoir day_of_week (0-6), start_time et end_time (HH:MM), avec end_time > start_time." },
        { status: 400 },
      );
    }

    const dayOfWeeks = rules.map((rule) => rule.day_of_week);
    if (new Set(dayOfWeeks).size !== dayOfWeeks.length) {
      return NextResponse.json(
        { error: "Un seul créneau récurrent par jour de la semaine." },
        { status: 400 },
      );
    }

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id")
      .eq("management_token", management_token)
      .maybeSingle();

    if (creatorError) {
      throw creatorError;
    }
    if (!creator) {
      return NextResponse.json({ error: "Lien de gestion invalide." }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("weekly_availability_rules")
      .delete()
      .eq("creator_id", creator.id);

    if (deleteError) {
      throw deleteError;
    }

    if (rules.length > 0) {
      const { error: insertError } = await supabase.from("weekly_availability_rules").insert(
        rules.map((rule) => ({
          creator_id: creator.id,
          day_of_week: rule.day_of_week,
          start_time: rule.start_time,
          end_time: rule.end_time,
        })),
      );

      if (insertError) {
        throw insertError;
      }
    }

    return NextResponse.json({ saved: true, rules });
  } catch (error) {
    console.error("[/api/creator/availability]", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
