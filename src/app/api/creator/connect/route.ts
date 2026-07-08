import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";

interface ConnectRequestBody {
  management_token: string;
}

/**
 * Starts (or resumes) Stripe Connect Express onboarding for a creator.
 * Creates the connected account on first call, reuses it on subsequent
 * calls (e.g. if the creator abandoned onboarding partway through) — a
 * fresh Account Link can always be generated for an existing account.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ConnectRequestBody>;
    const { management_token } = body;

    if (!management_token) {
      return NextResponse.json({ error: "management_token est requis." }, { status: 400 });
    }

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id, email, stripe_connect_id")
      .eq("management_token", management_token)
      .maybeSingle();

    if (creatorError) {
      throw creatorError;
    }
    if (!creator) {
      return NextResponse.json({ error: "Lien de gestion invalide." }, { status: 404 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    const stripe = new Stripe(stripeSecretKey);

    let accountId = creator.stripe_connect_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: creator.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      const { error: updateError } = await supabase
        .from("creators")
        .update({ stripe_connect_id: accountId })
        .eq("id", creator.id);

      if (updateError) {
        throw updateError;
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const manageUrl = `${appUrl}/manage/${management_token}`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: manageUrl,
      return_url: manageUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error("[/api/creator/connect]", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
