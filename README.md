# Yessrr

Réservation d'appels vidéo payants entre un créateur de contenu et sa communauté, avec arbitrage automatique des absences : si le créateur ne vient pas, le client est remboursé ; si le client ne vient pas, le créateur est payé.

## Le problème

Une prestation payante en visio entre deux inconnus bute sur la confiance. Le client craint de payer pour un appel qui n'aura pas lieu, le créateur de bloquer un créneau pour quelqu'un qui ne viendra pas. Les outils de réservation existants encaissent le paiement mais laissent ce litige aux deux parties.

Yessrr enregistre l'heure d'arrivée de chacun et applique la règle sans intervention humaine.

## Fonctionnement

1. Le créateur définit ses disponibilités : un planning hebdomadaire, plus des exceptions par date.
2. Le client choisit un créneau et paie par Stripe Checkout. Le créneau est revérifié côté serveur.
3. À la confirmation du paiement, chaque partie reçoit un lien personnel vers la salle d'appel.
4. La page d'appel s'ouvre 15 minutes avant l'heure et note la première arrivée de chacun.
5. Une tâche planifiée tranche après l'appel :

| Situation | Décision |
|---|---|
| Créateur absent ou en retard de plus de 10 minutes | Client remboursé |
| Créateur présent, client absent ou en retard de plus de 15 minutes | Créateur payé |
| Les deux présents | Créateur payé |

6. Le créateur reçoit 90 % du montant par virement Stripe Connect. S'il n'a pas encore configuré son compte, la somme attend et part dès qu'il le fait.

## Points techniques

- **Paiements différés.** Le paiement est encaissé sur le compte de la plateforme puis transféré, au lieu d'exiger un compte Stripe Connect dès la réservation. Un créateur peut donc être réservé avant d'avoir terminé sa configuration.
- **Arbitrage idempotent.** Une réservation déjà tranchée est ignorée : un événement rejoué ne peut pas rembourser deux fois.
- **Rôles signés.** Le lien de chaque partie porte un jeton HMAC. Le rôle n'est jamais lu dans l'URL, ce qui empêche un client de se faire passer pour le créateur afin de fausser l'arbitrage.
- **Disponibilités calculées à la volée.** Les créneaux ne sont pas stockés : ils sont dérivés des règles et des réservations existantes, donc modifier un planning ne peut pas corrompre une réservation.
- **Paniers abandonnés.** Une réservation non payée après 10 minutes est supprimée et sa session Stripe expirée, pour libérer le créneau sans risquer un paiement orphelin.
- **Base fermée par défaut.** Sécurité au niveau des lignes activée sans aucune règle d'accès ; seul le serveur atteint la base.

L'architecture détaillée est dans [`CLAUDE.md`](CLAUDE.md), l'état du produit et les décisions prises dans [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Pile technique

Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres), Stripe Checkout et Connect, Resend pour les e-mails, Jitsi Meet pour la vidéo, GitHub Actions pour les tâches planifiées.

## Installation

Prérequis : Node.js 18 ou plus, un projet Supabase, un compte Stripe en mode test, un compte Resend.

```bash
git clone https://github.com/bastaga15/yessrr.git
cd yessrr
npm install
cp .env.local.example .env.local   # puis renseigner les variables
npm run dev
```

Base de données : exécuter `schema.sql` dans l'éditeur SQL de Supabase. Les fichiers de `migrations/` retracent les évolutions successives et ne sont utiles que pour une base existante.

Les quatre tâches planifiées sont déclenchées par `.github/workflows/arbitration-cron.yml`, qui appelle les routes `/api/cron/*` avec l'en-tête `x-cron-secret`.

## État du projet

Le parcours complet a été testé de bout en bout avec Stripe en mode test : réservation, paiement, appel, les trois issues d'arbitrage, virement différé, e-mails de rappel. Le produit n'a pas été lancé commercialement.

## Limites connues

- Aucune suite de tests automatisés : les scénarios ont été vérifiés à la main.
- Pas de compte utilisateur. Le créateur gère son planning par un lien secret, à traiter comme un mot de passe.
- La présence est mesurée au clic sur « Rejoindre ». Quelqu'un qui rejoint puis quitte aussitôt est compté présent.
- Les migrations s'appliquent à la main, sans outil dédié.
- La page d'inscription des créateurs reste sommaire.
- Un seul fuseau horaire (Europe/Paris) et une durée d'appel unique.

## Licence

Code publié pour consultation. Tous droits réservés.

Bastien Lechat, [LecTech](https://lectech.fr)
