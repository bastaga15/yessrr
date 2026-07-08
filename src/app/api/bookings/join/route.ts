import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Role = "creator" | "customer";

interface JoinRequestBody {
  booking_id: string;
  role: Role;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<JoinRequestBody>;
    const { booking_id, role } = body;

    if (!booking_id || (role !== "creator" && role !== "customer")) {
      return NextResponse.json(
        { error: "booking_id et role ('creator' ou 'customer') sont requis." },
        { status: 400 },
      );
    }

    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, creator_joined_at, customer_joined_at")
      .eq("id", booking_id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking introuvable." }, { status: 404 });
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json(
        {
          error: `Impossible de rejoindre : ce booking est au statut "${booking.status}".`,
        },
        { status: 409 },
      );
    }

    const column = role === "creator" ? "creator_joined_at" : "customer_joined_at";
    const alreadyJoinedAt: string | null = booking[column];

    // First join wins — arbitration relies on the moment someone *first*
    // showed up, not their latest reconnect after a dropped connection.
    if (alreadyJoinedAt) {
      return NextResponse.json({ booking_id, [column]: alreadyJoinedAt });
    }

    const joinedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ [column]: joinedAt })
      .eq("id", booking_id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ booking_id, [column]: joinedAt });
  } catch (error) {
    console.error("[/api/bookings/join]", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
