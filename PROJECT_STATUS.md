# Yessrr — état du projet

Doc de contexte produit/business/infra pour repartir vite dans une nouvelle session.
Pour l'architecture code, voir `CLAUDE.md`.

## Le produit

Plateforme de booking d'appels vidéo payants pour créateurs de contenu (YouTubers,
streamers) avec leur communauté. Cible : créateurs 10k-100k abonnés (ni micro, ni
mega-influenceurs) — segment sous-servi. Commission plateforme : 10% (pas encore
implémentée techniquement, voir Stripe Connect ci-dessous).

**Killer feature : l'arbitrage automatique.** Si le créateur ne se présente pas
(ou >10min de retard), le client est remboursé automatiquement. Si le créateur est
là mais le client non (ou >15min de retard), le créateur est payé quand même. Ça
résout le problème de confiance classique des prestations payantes en visio.

**Lecture honnête du marché** (discutée en session) : ce concept a déjà été tenté
plusieurs fois (Superpeer — a pivoté en 2022 après levée de fonds, Cameo — asynchrone
pas du live, Minnt, Bump). Pas un océan bleu. Le vrai risque n'est pas technique,
c'est la distribution (convaincre les 50 premiers créateurs) et si les gens veulent
vraiment du call vidéo en tête-à-tête avec un inconnu. Priorité actuelle : valider
la demande vite avec du vrai monde, pas peaufiner la stack.

## Ce qui marche aujourd'hui (testé bout en bout)

- Onboarding créateur (`/onboarding`) → génère un slug + `management_token`.
- Édition du planning hebdomadaire (`/manage/<token>`).
- Réservation avec vrais créneaux calculés depuis le planning (`/[slug]`).
- Checkout Stripe avec le tarif réel du créateur.
- Webhook Stripe → confirmation + génération salle Jitsi + emails (client + créateur).
- Page d'appel avec fenêtre horaire (`/call/<bookingId>`) + tracking de présence.
- Arbitrage automatique (manuel via webhook simulé, ET via cron réel) — les 3 règles
  testées : no-show créateur (remboursé), no-show client (créateur payé), match
  parfait (completed). Idempotent.
- RLS activée sur toutes les tables (default-deny, service-role bypass).
- Déploiement : `yessrr.fr` + `www.yessrr.fr` en prod sur Vercel, connecté à GitHub
  (`github.com/bastaga15/yessrr`, privé) — push sur `main` = déploiement auto.
- Favicon + page d'accueil réels (plus le boilerplate Next.js par défaut).

## Comptes / infra déjà configurés

- **Supabase** : base de données (URL/clés dans `.env.local` et Vercel env vars).
- **Stripe** : compte en **mode test** (`sk_test_...`). CLI authentifiée localement
  (`stripe login`, expire dans 90 jours). Webhook prod créé pointant vers
  `https://yessrr.fr/api/webhooks/stripe` avec son propre secret (différent de celui
  utilisé par `stripe listen` en local).
- **Resend** : domaine `yessrr.fr` vérifié, envoi depuis `reservations@yessrr.fr`.
- **Vercel** : projet `yessrr` sous le compte `bastaga15` (même compte que
  `lectech.fr`, mais projets/domaines totalement séparés). CLI installée et
  authentifiée.
- **GitHub** : repo `bastaga15/yessrr` (privé), CLI `gh` installée et authentifiée.
- **DNS (OVH)** : `yessrr.fr` et `www.yessrr.fr` pointent vers Vercel (`A 76.76.21.21`).
- **Un seul vrai créateur en base** : "Bastien" (slug `bastien`), utilisé pour les
  tests manuels. Toutes les données de test créées pendant le développement ont été
  nettoyées après chaque session de test.

## Pas encore fait (roadmap dans l'ordre discuté)

1. **Configurer un scheduler externe réel** pour appeler `POST /api/cron/arbitration`
   toutes les ~5min (header `x-cron-secret`). Décidé : GitHub Actions ou Upstash
   QStash plutôt que Vercel Cron (limité à 1x/jour sur le plan Hobby). **Pas encore
   configuré** — le cron existe et fonctionne, mais rien ne l'appelle automatiquement
   en prod pour l'instant.
2. **Stripe Connect** — actuellement 100% de l'argent reste sur le compte Stripe de
   la plateforme, rien ne part vers les créateurs. Décision prise : automatiser
   (pas de paiement manuel). Pas commencé — c'est un chantier à part entière
   (compte Express, `account.updated` webhook, destination charges avec
   `application_fee_amount`, adapter le remboursement pour `refund_application_fee`).
3. **Séquences email** — aujourd'hui seul l'email de confirmation existe. À ajouter :
   rappel J-1 ET H-1 avant l'appel, notification distincte no-show/remboursement
   (actuellement le no-show ne déclenche aucun email), demande d'avis après l'appel.
4. **Vraie page d'onboarding** — polish/contenu à revoir, prévu explicitement comme
   dernière étape avant un vrai passage en prod (pas urgent).
5. **Durcir l'arbitrage contre la fraude** — rien n'empêche aujourd'hui un client
   malhonnête de "rejoindre" l'appel puis couper immédiatement pour faire déclencher
   un no-show créateur. Signalé comme risque produit réel, pas encore traité.

## Décisions notables (pour ne pas les rediscuter)

- **Jitsi plutôt que Daily.co** : Daily demandait une carte bancaire et rognait la
  marge. Jitsi (`meet.jit.si`, gratuit) n'a pas d'API de limitation de durée/fenêtre
  horaire — d'où la page `/call/[bookingId]` qui gère ça nous-mêmes.
- **Pas de Cal.com** : Cal.com sait faire réservation + paiement + Jitsi nativement,
  donc la barrière technique de ce qu'on a construit est réellement faible — mais
  l'arbitrage (notre vraie valeur) n'existe pas chez eux et devrait de toute façon
  être recodé par-dessus leur système de paiement, en dépendant de leur modèle
  interne plutôt que de le posséder de bout en bout. Reconsidérable si besoin de
  vitesse extrême ou de fonctionnalités calendrier qu'on n'a pas (sync Google
  Calendar, multi-fuseaux avancé).
- **Système de disponibilités maison plutôt qu'un outil externe** : besoin jugé
  trop étroit (récurrence hebdo + ne jamais toucher un créneau réservé) pour
  justifier une dépendance lourde.
- **`management_token` plutôt qu'un vrai système d'auth** : pas de login créateur
  pour l'instant, choix delibéré pour aller vite en MVP.

## Non traité / connu mais pas prioritaire

- 16 vulnérabilités Dependabot sur les dépendances (visibles sur GitHub), pas
  spécifiques à notre code — dépendances transitives classiques d'un scaffold
  Next.js. `npm audit fix` à envisager à un moment.
- Deux fichiers logo (`LogoYessrr.jpeg`, `LogoYessrrwthoutbg.png`) à la racine,
  ajoutés par l'utilisateur — seul le PNG sans fond est utilisé actuellement
  (favicon, `src/app/icon.png`).
