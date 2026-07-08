import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Defense in depth: the frontend already slugifies as the creator types, but
// this route never trusts client input — a raw fetch("/api/creator/onboarding")
// call could send anything.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface OnboardingRequestBody {
  first_name: string;
  last_name: string;
  email: string;
  hourly_rate: string | number;
  slug: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<OnboardingRequestBody>;
    const { first_name, last_name, email, hourly_rate, slug } = body;

    if (!first_name || !last_name || !email || !slug || hourly_rate === undefined || hourly_rate === null || hourly_rate === "") {
      return NextResponse.json(
        { error: "Champs manquants : first_name, last_name, email, hourly_rate, slug sont requis." },
        { status: 400 },
      );
    }

    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: "Le slug ne doit contenir que des minuscules, chiffres et tirets.", field: "slug" },
        { status: 400 },
      );
    }

    const hourlyRateNumber = Number(hourly_rate);
    if (!Number.isFinite(hourlyRateNumber) || hourlyRateNumber < 0) {
      return NextResponse.json({ error: "Tarif horaire invalide." }, { status: 400 });
    }

    // Fast, friendly pre-check. This alone is NOT sufficient — see the 23505
    // handling below, which is the real safety net against a race where two
    // people submit the same slug at (almost) the same time.
    const { data: existing, error: lookupError } = await supabase
      .from("creators")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    if (existing) {
      return NextResponse.json(
        { error: "Ce slug est déjà utilisé", field: "slug" },
        { status: 409 },
      );
    }

    const { data: creator, error: insertError } = await supabase
      .from("creators")
      .insert({
        name: `${first_name} ${last_name}`.trim(),
        email,
        slug,
        hourly_rate_cents: Math.round(hourlyRateNumber * 100),
      })
      .select("id, slug, management_token")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const isSlugConflict = insertError.message?.includes("slug");
        return NextResponse.json(
          {
            error: isSlugConflict ? "Ce slug est déjà utilisé" : "Cet email est déjà utilisé.",
            field: isSlugConflict ? "slug" : "email",
          },
          { status: 409 },
        );
      }
      throw insertError;
    }

    return NextResponse.json(
      { id: creator.id, slug: creator.slug, management_token: creator.management_token },
      { status: 201 },
    );
  } catch (error) {
    console.error("[/api/creator/onboarding]", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
