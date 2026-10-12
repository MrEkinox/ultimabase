# Plan de l'étape 6 de la migration : plugins, retraits, documentation (proposé le 2026-10-11)

Suite de [migration-core.md](migration-core.md). Source des décisions :
[revue-plugins/](revue-plugins/README.md) (validées le 2026-10-09), reports des
étapes 1 à 5b, leviers de l'étape 5 (projections de plugins, ancienne forme,
couches Typegen).

## Principes

- Un ADR par plugin, rédigé depuis sa revue au début de son sous-étape, validé
  par l'utilisateur avant l'implémentation (ADR-0288).
- Chaque sous-étape : agent dans son worktree, porte complète
  (`validate:full`, e2e construits, `website:test` si le site change, audit DX,
  banc), relecture du coordinateur, validation de l'utilisateur, fusion
  `--no-ff` dans `main`.
- 6.0 et 6.1 seuls (fondations et Access, dont dépendent les autres) ; ensuite
  deux agents en parallèle au plus sur des sous-étapes indépendantes.
- L'ancienne forme et Typegen restent jusqu'à 6.8 ; chaque plugin migré passe
  ses exemples et tests à la forme D.

## Sous-étapes

| #   | Contenu                                                                                                                                                                                                                                                    | Revues                                                | Dépend de |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| 6.0 | Façade `definePlugin` (plugin-kit) et emplacements HKT des projections de plugins (levier 3 de l'étape 5), prouvés sur Soft Delete migré en entier (commandes `softDeleteOne/Many`, `restoreOne`, `purgeOne`, `deletedAt`, règles `readDeleted`/`restore`) | simplification.md, soft-delete.md                     | —         |
| 6.1 | Access : `allowWithoutRule` (et sa valeur `'development'`, refus en production, avertissement, reportés des étapes 2 et 4), prédicats, sémantique `item`                                                                                                   | access.md                                             | 6.0       |
| 6.2 | Hooks et Validation (événements `hooksPlugin({ events })`, `PublicError`, relations dans les hooks, agrégation)                                                                                                                                            | hooks.md, validation.md                               | 6.1       |
| 6.3 | ACL et Roles, fabrique `App.RoleSchema` (amendement 3 d'ADR-0297) : fin du contournement `Register` de l'étape 4                                                                                                                                           | acl.md, roles.md                                      | 6.1       |
| 6.4 | Authentification : socle et Password Auth, fabrique `App.PasswordUserSchema`, changement de mot de passe et d'e-mail                                                                                                                                       | password-auth.md                                      | 6.3       |
| 6.5 | Stockage : PostgreSQL, contrat des adaptateurs, pg-vector                                                                                                                                                                                                  | postgres.md, adaptateurs.md, pg-vector.md             | 6.0       |
| 6.6 | Transports : HTTP, REST (`/api/…`, `defineOperation`, OpenAPI), GraphQL (champ de santé, opérateurs déclarés d'ADR-0301), Yoga, explorateurs (fusion), Hono, preset `api-server`                                                                           | http.md, rest.md, graphql*.md, hono.md, api-server.md | 6.1       |
| 6.7 | Testing (`testApplication`), create-app, exemples (application de référence todo-backend)                                                                                                                                                                  | testing.md, create-app.md                             | 6.2–6.6   |
| 6.8 | Retraits : ancienne forme de déclaration, Typegen et ses couches dans Core, fuites de Core (protocole de rôle, option `postgres` codée en dur) ; passe de documentation ; remesure des objectifs d'ADR-0297 et objectifs révisés                           | ADR-0297, simplification.md                           | 6.7       |

Parallélisme proposé après 6.1 : 6.2 avec 6.5, puis 6.3 avec 6.6, puis 6.4.

6.6 découpée le 2026-10-11 (trop grande pour une seule relecture) : 6.6a socle HTTP et Hono (ADR-0323), 6.6b REST (exposition par le plugin propriétaire, `defineOperation`, OpenAPI, `/api`, `publicWrites`, liaisons automatiques de 6.0 retirées), 6.6c GraphQL, Yoga, explorateur unique, opérateurs déclarés d'ADR-0301 et preset `api-server`.

## Points à trancher en cours de route

- Authentification : l'OAuth lié au même utilisateur (revue password-auth)
  est-il dans 6.4 ou une étape à part après la migration ?
- Objectifs de vitesse d'ADR-0297 : révisés en 6.8 avec les chiffres réels.

## Prochaine action vérifiable

Validation de ce plan par l'utilisateur, puis ADR de la façade `definePlugin`
et des emplacements HKT (6.0).

Ajouts décidés le 2026-10-12 :

- 6.8 : page de documentation « Performances de TypeScript » (TS 6 et TS 7 pris en charge, TS 7 conseillé pour la rapidité des types, chiffres du banc, installation côte à côte de TS 6 pour typescript-eslint et les outils qui ont besoin de l'API de TypeScript) ; job de CI qui vérifie les types et les infobulles sous TS 7.
- Après la migration : essai borné d'Oxlint avec tsgolint (inventaire des règles d'`eslint.config.ts` couvertes, résultats comparés à ESLint sur le dépôt, temps mesuré) ; réévaluation de typescript-eslint à la sortie de TypeScript 7.1 (API de programmation).
