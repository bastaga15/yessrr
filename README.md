# Yessrr

Plateforme de booking d'appels payants pour créateurs de contenu, avec
arbitrage automatique des no-shows (remboursement client ou paiement
créateur selon qui s'est présenté).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase · Stripe ·
Jitsi Meet · Resend.

## Développement local

```bash
npm install
npm run dev
```

Copie `.env.local.example` (à créer si besoin) avec les variables
nécessaires : Supabase, Stripe, Resend, `ARBITRATION_WEBHOOK_SECRET`,
`CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.

## Migrations

Les scripts SQL dans `migrations/` sont à exécuter dans l'ordre via le
SQL Editor de Supabase (pas d'outil de migration automatisé pour l'instant).

## Déploiement

Déployé sur Vercel, connecté à ce repo — un push sur `main` déploie
automatiquement en production.
