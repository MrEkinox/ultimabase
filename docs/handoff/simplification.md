# Passation : simplification avant la première release

Branche `simplify/kernel-dead-weight`, partie de `main` (`1ced18d3`). Ce
fichier est supprimé quand le programme est terminé.

## Mandat (utilisateur, 2026-10-08)

Avant toute nouvelle fonctionnalité : réduire la complexité inutile, rendre
l'écriture de plugins simple pour une communauté, et supprimer la corvée de
génération Typegen. Les API publiques peuvent changer avant la release, chacune
par un ADR validé par l'utilisateur (ADR-0288). Choix validés : programme dans
l'ordre de l'ADR-0288 ; Typegen sur deux voies ; privilèges en rapport dérivé.

## Preuves de l'audit

- Plugins : sondes dans `node_modules/.cache/plugin-probe/` (ignoré par Git).
  Quatre plugins typiques : 22 à 69 lignes et jusqu'à 12 identifiants
  obligatoires aujourd'hui ; 5 à 12 lignes sur la façade prototype
  `f-facade.ts` (214 lignes, API publique seulement, testée contre PostgreSQL).
  `GET /health` répond 401 sans en-tête d'application.
- Typegen : sondes dans `node_modules/.cache/typegen-probe/`. Cause : cycles
  d'inférence TS7022/TS7023 entre schémas qui se référencent. Piste nouvelle :
  relations en getters façon Zod 4 (`p3/g4n`, `p3/g10`, `p3/g11` : zéro
  génération, cycles exacts, `@ts-expect-error` effectifs) — sur une
  bibliothèque simulée, pas encore sur le vrai Core (`p8` échoue).
- Core : 1 118 exports dont 220 valeurs ; inventaire des exports sans
  consommateur par analyse des imports (script de session `core-imports.mjs`,
  reproductible : parser TypeScript sur tous les fichiers hors
  `packages/core`).

## État

- ADR-0288, 0289, 0290 acceptés (2026-10-08). L'utilisateur a aussi décidé
  de retirer tout ce que seuls des tests utilisent, passerelles d'adaptateur
  et privilège `adapter:raw` compris.
- ADR-0289 en cours d'implémentation par un agent dans un worktree isolé
  (`.claude/worktrees/`) ; revue du diff avant fusion.

## Décisions de conception notées (à formaliser par ADR le moment venu)

En attente : aucun de ces chantiers ne démarre sans décision explicite de
l'utilisateur.

- Enregistrement explicite des schémas conservé (`schemas: [...]`) : pas
  d'enregistrement à l'import ; piste ultérieure, un avertissement en
  développement pour un schéma défini mais non enregistré.
- Fichier de configuration `ultimabase.config.ts` (`defineConfig`), à traiter
  avec le volet « génération invisible » de Typegen (CLI `ultimabase dev`,
  `ultimabase typegen --watch`, chargeur jiti existant de Typegen) :
  - sucre fin au-dessus de l'API programmatique, qui reste la vérité ; aucun
    effet à l'import ; le CLI reste facultatif ;
  - trois fichiers pour éviter le cycle d'imports : `src/app.ts` (plugins),
    les schémas (`App.Schema.define`), `ultimabase.config.ts` (app, schemas,
    valeurs d'environnement surchargeables) ;
  - les tests importent la même config via `createTestApplication` de
    `@ultimabase/testing` (config et surcharges), sans CLI.
- `definePlugin` (plugin-kit) ne couvre que ce que Core fournit ; les
  capacités d'un transport viennent d'un helper du plugin concerné (ex.
  `httpRoutes` d'http-plugin), déclaré en pair explicite seulement si utilisé.
- Fuites de Core à corriger : connaissance de Typegen (52 fichiers), protocole
  neutre de « rôle » hébergé dans Core, option `postgres` codée en dur dans
  `private-storage/definition.ts`.
- DX application (à mesurer par une sonde avant ADR, sur décision de
  l'utilisateur) : presets de plugins, réglages par défaut sûrs, en-tête
  d'application facultatif avec une seule application, opérations
  d'authentification exposées par défaut.

## Prochaine action vérifiable

Relire le diff de l'agent ADR-0289 (fichiers supprimés, tests modifiés,
résultats de `yarn validate:full` et du DX audit contre `81e9bd04`), le
fusionner en `--no-ff`, puis implémenter l'ADR-0290.
