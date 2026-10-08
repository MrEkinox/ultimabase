# Plan : remise en question de l'API développeur, sans Typegen

Statut : en attente. Démarre après la fusion de l'ADR-0289 et
l'implémentation de l'ADR-0290, sur décision de l'utilisateur. Le programme
global est dans [simplification.md](simplification.md).

## Objectif

Trouver la meilleure API possible pour le développeur d'application :
déclarer et configurer les plugins, créer une application, définir les
schémas, faire des requêtes et des mutations. Le but prioritaire est un
typage exact **sans génération de code**, pour qu'il n'y ait jamais de
décalage entre les types utilisés et la réalité. La façade `definePlugin`
pour les auteurs de plugins vient après et s'appuie sur l'API retenue.

## Périmètre : tout, Core et chaque plugin

L'utilisateur veut tout remettre en question (2026-10-08), pas seulement
Core. Chaque plugin officiel est examiné pour lui-même :

- comment on l'installe et ce que valent ses options (noms, valeurs par
  défaut, options inutiles ou dangereuses, cohérence avec les autres plugins) ;
- ce qu'il apporte sur les schémas et comment (options de schéma, champs,
  opérations, routes) ;
- son API pour le développeur : par exemple pour Hooks, les phases, les
  signatures, le contexte reçu (élément avant et après, utilisateur courant,
  requête), la façon de modifier ou de refuser une écriture ; pour Access,
  ACL et Roles, l'expression des règles ; pour Password Auth, la
  personnalisation de l'utilisateur et des routes ; pour REST et GraphQL, ce
  qui est exposé par défaut ;
- ce qui manque au développeur et ce qui est superflu.

Plugins concernés : access, acl-permissions, roles, hooks, validation,
soft-delete, password-auth, http, server-hono, rest, graphql, graphql-yoga,
graphql-http, graphiql, apollo-sandbox, postgres, pg-vector, typegen (à
retirer si possible), testing, create-app.

Livrable par plugin, ajouté à l'inventaire (phase 1) : une fiche « API
actuelle, frictions mesurées, propositions », notée sur la grille.

## Contraintes non négociables

- Micro-noyau : Core ne connaît aucun plugin ; tout ce qu'un plugin ajoute
  (options de schéma, champs, opérations) passe par des mécanismes génériques.
- Colocalisation : ce qui est lié s'écrit au même endroit. Les champs de
  relation restent dans le schéma qu'ils concernent ; pas de fichier central
  de relations.
- Enregistrement explicite des schémas (`schemas: [...]`), pas d'effet à
  l'import.
- Invariants de sécurité d'`AGENTS.md` : Master infalsifiable, contraintes qui
  ne font que restreindre, transactions automatiques, un seul moteur
  d'opérations, builders immuables, pas d'Active Record.
- Un fichier de configuration (`ultimabase.config.ts`) doit rester possible
  sans cycle d'imports, même s'il est implémenté plus tard.

## Pistes déjà rejetées

L'utilisateur autorise explicitement (2026-10-08) à rouvrir une piste que les
ADR ou les preuves archivées (tag `reference-archive`, jalon 63 : issues
6301, 6310, 6312, 6316) déclarent avoir échoué, si elle paraît prometteuse.
Condition : lire d'abord la preuve de l'échec et rouvrir avec une hypothèse
nouvelle qui explique pourquoi la tentative précédente a échoué et ce qui
change ; ne jamais refaire la même tentative à l'identique.

## Les deux problèmes de typage à résoudre sans génération

1. Références entre schémas : relations circulaires, souvent entre deux
   fichiers, aujourd'hui exprimées par des cibles en chaîne.
2. Options qui exigent le schéma complet en cours de déclaration : `access`,
   `hooks`, `acl`, champs virtuels, y compris les champs ajoutés par d'autres
   plugins (par exemple `isDeleted`).

## Grille d'évaluation (chaque proposition est notée dessus)

| Critère                | Mesure                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sans génération        | compile et reste exact sans fichier généré                                                                                                                                                        |
| Colocalisation         | relations et options écrites dans le schéma                                                                                                                                                       |
| Concision              | lignes de l'application de référence, nombre de concepts                                                                                                                                          |
| Une forme par concept  | aucune syntaxe spéciale pour un cas particulier                                                                                                                                                   |
| Révélation progressive | le cas courant n'exige aucune option                                                                                                                                                              |
| Erreurs                | message clair, signalé sur la ligne fautive                                                                                                                                                       |
| Hovers                 | lisibles ; moins de 2 000 caractères, viser 300 pour le cas courant                                                                                                                               |
| Performance TypeScript | typecheck à froid et délai édition → diagnostic à 10, 50 et 200 schémas ; pas plus de 10 % au-delà des mesures actuelles (10 schémas : 3,57 s / 2,01 s ; 50 schémas : 8,08 s / 6,74 s / 1,53 Gio) |
| JavaScript             | utilisable sans TypeScript                                                                                                                                                                        |
| Coût de migration      | fichiers et packages touchés                                                                                                                                                                      |

## Phases

### 1. Inventaire et mesures de départ

- Inventaire de toute l'API publique côté application : création de
  l'application et des plugins, Master, démarrage et arrêt ; schémas (champs,
  relations, objets imbriqués, enums, index, champs virtuels) ; options de
  plugins sur les schémas ; requêtes (`where`, `select`, `include`, tri,
  pagination, `count`, `exists`) ; mutations (create, update, upsert, delete,
  écritures imbriquées, `increment`, `unset`) ; transactions ; contexte de
  requête ; erreurs.
- Pour chaque élément : ce qui dépend de Typegen et pourquoi.
- Mesures de référence de l'API actuelle avec les sondes existantes
  (`packages/typegen/tests/performance`), étendues à 200 schémas.

Livrable : `docs/handoff/api-inventory.md`.

### 2. Application de référence « idéale » (spécification par l'exemple)

Décision (2026-10-08) : l'application de référence est `examples/todo-backend`,
que l'utilisateur autorise à modifier librement. Elle sert de comparaison
avant / après ligne à ligne et doit être enrichie de ce qui lui manque :
schémas répartis dans plusieurs fichiers avec références en cycle,
auto-relation (sous-tâches), plusieurs-à-plusieurs (étiquettes, projets
partagés), commentaires, soft delete, Password Auth, REST et GraphQL, un champ
virtuel, une pièce jointe et une notification temps réel (API hypothétique),
et le fichier de configuration.

Rôle des exemples (utilisateur, 2026-10-08) : `examples/` sert aussi de
documentation (« comment on fait ceci, cela »). Donc deux niveaux : de petits
exemples ciblés par sujet (`relations`, `access-control`, `hooks`,
`custom-field-plugin`, `testing`, puis `files` et `realtime`), chacun avec son
README et vérifié par la CI, qui servent aussi de bancs d'essai par problème de
typage ; et `todo-backend` enrichi raisonnablement comme application complète
et juge global. Piste : que les pages du site incluent le code des exemples
(une seule source) au lieu de recopier des extraits ; vérifier ce que permet
Fumadocs. Piste liée : `create-app` qui démarre un projet depuis un
exemple (`--example todo-backend`), comme `create-next-app --example`.

Une petite application façon Parse, écrite comme on voudrait qu'elle
s'écrive, avec plusieurs variantes là où le choix est ouvert :

- `User` (password auth) avec `Profile` 1-1 ; `Post` ↔ `User` (auteur,
  relation inverse) ; `Comment` avec réponses (auto-relation) ; `Tag`
  plusieurs-à-plusieurs ;
- rôles et ACL, `access` avec filtre `where`, un hook avant écriture, soft
  delete, un champ personnalisé fourni par un plugin, un champ virtuel, un
  objet imbriqué, une opération personnalisée exposée en REST et GraphQL ;
- le fichier de configuration et un test qui démarre l'application ;
- des tests de types : ce qui doit compiler, ce qui doit échouer
  (`@ts-expect-error`).

Entrées de conception tirées du futur projet de l'utilisateur (à mettre en
production) : un champ fichier, un abonnement temps réel et une évolution de
schéma (ajout de colonne, renommage de champ) figurent dans l'application de
référence. L'API cible doit pouvoir les accueillir sans contorsion, même s'ils
sont construits plus tard.

Revue avec l'utilisateur : choix des formes souhaitées avant tout prototype.

### 3. Laboratoire de typage

Références à étudier (utilisateur, 2026-10-08 : s'inspirer des formes de
bibliothèques connues dont la DX est prouvée ; la cohérence de l'ensemble passe
avant l'emprunt, chaque proposition indique sa référence et pourquoi elle reste
cohérente avec le reste) :

| Domaine                              | Références                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Schémas et inférence sans génération | Zod 4 (getters), Drizzle, Effect Schema                                                                          |
| Requêtes et mutations                | Prisma (`findMany`, `where`, `include`), requêtes Drizzle                                                        |
| Système de plugins                   | Better Auth (plugins qui ajoutent champs, routes et types client sans génération), Fastify, Vite/Rollup, Payload |
| Hooks                                | Parse Cloud Code, Payload, extensions Prisma                                                                     |
| Configuration et CLI                 | Vite `defineConfig`, Payload `buildConfig`, Next.js `dev`                                                        |
| Migrations                           | Prisma Migrate, Drizzle Kit                                                                                      |
| Exemples et démarrage                | `create-next-app --example`, templates Payload                                                                   |

Prototypes de types (bibliothèque simulée, hors dépôt suivi), plusieurs
variantes par problème :

- Problème 1 : getters ; cibles par valeur avec une autre technique
  d'inférence différée ; cibles en chaîne résolues au niveau de l'application
  par la liste `schemas` ; toute autre forme découverte.
- Problème 2 : déclaration unique avec `NoInfer` ; définition en deux temps
  (`define(...).with((schema) => ...)`) ; options en fonction du schéma.
- Champs et options apportés par les plugins, sans génération.
- Requêtes et mutations : méthodes statiques de classe actuelles contre
  accès liés à l'application (par exemple `app.Post.findMany`), coût de
  typage de `where`, `select` et `include` imbriqués.

Chaque variante est mesurée sur la grille, avec un générateur de schémas
synthétiques pour 10, 50 et 200 schémas. Règle d'arrêt : deux variantes
comparables qui échouent sans élément nouveau, on s'arrête et on rapporte.

### 4. Décision

Rapport comparatif : code côte à côte, notes sur la grille, compromis
explicites (ce qui se dégrade, par exemple les opérateurs `where` des champs
personnalisés). L'utilisateur choisit. ADR « API cible » qui remplace les ADR
concernés (0279 à 0284 au minimum) et la section « Retained typing
boundaries ».

### 5. Preuve sur le vrai Core

Tranche verticale dans un worktree : deux schémas en cycle dans deux
fichiers, `access` et `hooks` complets, une requête et une mutation, un champ
apporté par un plugin, sans fichier généré. Mesures de performance contre la
grille, tests de language service sur les sources et sur les packages
construits, DX audit montrant uniquement les différences annoncées.

### 6. Migration

Core, tous les plugins officiels, retrait ou réduction de Typegen et de sa
connaissance dans Core, exemples, `create-app`, site, tests publics (changés
volontairement, chaque changement justifié). Le fichier de configuration et
le CLI suivent sur décision de l'utilisateur.

### Volet parallèle : migrations PostgreSQL

Brique la plus bloquante pour la production. Elle dépend de la forme
compilée des schémas et de PostgreSQL, peu de la syntaxe d'écriture :
conception (ADR, l'ADR-0266 les avait reportées) pendant les phases 3 et 4,
implémentation dès le choix de l'API cible, en parallèle de la phase 6.

### 7. Façade `definePlugin`

Sur l'API retenue, dans `plugin-kit`, sans dépendance vers un plugin concret.

### Volet parallèle : organisation du dépôt

S'inspirer aussi de l'organisation des dépôts de bibliothèques connues (Vite,
Next.js, TanStack, Payload, Better Auth, Hono) : exemples et modèles de
démarrage, fichiers de contribution (CODE_OF_CONDUCT, formulaires d'issues,
modèle de PR), `playground/`, cache de tâches (Turborepo ou Nx) pour réduire
le temps de validation, documentation incluant le code des exemples.
Inventaire dans [repo-organization.md](repo-organization.md) ; chaque
changement d'outillage passe par un ADR.

## Points de décision pour l'utilisateur

1. Formes souhaitées après la phase 2.
2. Choix de l'API cible après la phase 4.
3. Compromis acceptés (syntaxe, cas avancés dégradés).
4. Démarrage du fichier de configuration et du CLI.

## Risques

- Aucune variante ne passe tous les critères sur le vrai Core : repli sur une
  génération automatique et invisible, mais seulement si l'utilisateur
  l'accepte.
- Performances TypeScript dégradées à 200 schémas : budget mesuré à chaque
  étape.
- Migration large : faite par tranches, chacune validée par
  `yarn validate:full`.

## Après la façade

Fichiers puis temps réel, écrits comme des plugins sur la façade
`definePlugin` : ils valident la façade et débloquent le projet de
l'utilisateur, avec les migrations.
