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
- ADR-0289, première partie fusionnée (`535bc3ee`, travail d'agent revu) :
  production −1 849 lignes (Core −1 416, postgres −427), tests −1 421. Fait :
  fabriques `restrict*`/`constraint`, intercepteurs `before/afterOperation`
  de Core, `contributeSchemaMutationBinding`, passerelles d'adaptateur et
  privilège `adapter:raw` retirés ; tokens Runtime et métadonnées de
  privilèges retirés de l'API publique. Revue : changements d'ordre dans
  `contributions-observers.test.ts` (l'ordre global/schéma appartenait aux
  intercepteurs retirés) et message `protected policy selectionFields must be
an array` (préexistant, `protected-policy.ts:253`) jugés corrects.
- ADR-0289, seconde partie fusionnée (`29fb7b14`, travail d'agent revu) :
  production −1 256 lignes (Core −779, postgres −458), tests −1 140. Retirés :
  effet `constraints` de `protectedPolicy`, `databaseConstraint`, registre et
  compilateur de contraintes, privilège `adapter:consume`, contraintes de
  schéma (`defineSchemaConstraint`, `schemaPatch().addConstraint()`). Revue :
  test d'injection SQL conservé (valeur piégée déplacée dans le filtre de
  lignes, jamais dans le texte SQL).
- Validation plus rapide (ADR-0291, `b2a451b6`) : `validate:full` sans double
  passage des tests ; `validate:affected` pour les commits intermédiaires.
- Gate complet sur `29fb7b14` (arbre de build propre) : `validate:full` exit 0
  en 742 s (avant : 1 085 s). Performance 180 s ; couverture 634 fichiers /
  2 919 tests, 92,56 / 86,31 / 97,5 / 93,18.
- DX audit contre `81e9bd04` : 1 452 différences, toutes sur des noms retirés ;
  côté application, seule la statique `constraints` disparaît des classes de
  schéma (17 complétions des exemples).
- `validate:affected` sur une modification d'une ligne (graphiql) : 209 s,
  après correction d'un bug latent de `main` révélé par l'outil
  (`tests/tsconfig.json` ne compilait pas seul : l'option `acl` venait d'une
  augmentation globale d'un support de test, voir commit du correctif).
- Nombre de workers de la couverture : laissé à 4 (couverture à 291 s).

- ADR-0290 fusionné (`ea1259f7`, travail d'agent revu) : justifications de
  privilèges facultatives avec descriptions générées dans le rapport ;
  `authority:elevate` et `storage:private` exigent toujours une justification ;
  conditions `when` retirées ; 11 cartes de justifications supprimées dans les
  plugins officiels, 3 réduites aux privilèges critiques. `validate:full` de
  l'agent : exit 0 (634 fichiers / 2 920 tests). DX audit : 973 différences,
  0 diagnostic modifié, toutes annoncées par l'ADR.
- Documentation : liens morts des ADR corrigés (`6fc822b6`), `AGENTS.md`
  réécrit en contrat plus court (`ccc14f4a`).

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
- Chantier « API complète sans Typegen » (après ADR-0289 et ADR-0290, avant
  la façade `definePlugin`) : remettre en question déclaration des plugins,
  schémas, requêtes et mutations. Deux problèmes de typage à résoudre sans
  génération : (1) références entre schémas (cibles en chaîne, cycles entre
  fichiers) — contrainte de l'utilisateur : colocalisation, les champs de
  relation restent dans le schéma qu'ils concernent (relations déclarées à
  part façon Drizzle écartées) ; pistes : getters, cibles par valeur avec une
  autre technique d'inférence différée, cibles en chaîne résolues au niveau
  de l'application par la liste `schemas` (erreurs croisées signalées sur
  l'application plutôt que sur le champ, à mesurer) ; (2) options de plugins qui exigent le schéma complet
  (`access`, `hooks`, `acl`, champs virtuels, champs ajoutés par plugins) —
  pistes : définition en deux temps `.with((schema) => ...)`, `NoInfer`.
  Méthode : inventaire, 2 à 3 alternatives par domaine prouvées par
  prototypes de types (compile sans génération, hovers, coût à 10/50/200
  schémas), présentation côte à côte, choix de l'utilisateur, preuve sur le
  vrai Core, ADR « API cible », migration.
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

## Après la fusion de l'ADR-0289 (décidé, à faire)

- Retrait de l'héritage Codex : il ne reste que `AGENTS.md`, conservé comme
  contrat multi-outils (lu par Codex, Cursor, Copilot, Gemini… et importé par
  `CLAUDE.md`) mais raccourci ; `apps/website/AGENTS.md` est généré par
  Next.js et le bouton « Open in ChatGPT » du site sert les lecteurs, tous deux
  conservés.
- Liens morts des ADR vers `issues/` et `docs/plans/` : remplacer par une
  mention du tag `reference-archive`.

## À faire au moment de rendre le dépôt public

- Activer le « private vulnerability reporting » de GitHub
  (`gh api -X PUT repos/MrEkinox/ultimadatabase/private-vulnerability-reporting`) :
  indisponible tant que le dépôt est privé (réponse 404 le 2026-10-08), alors
  que `SECURITY.md` et le code de conduite y renvoient déjà.

## Prochaine action vérifiable

Fait : branche fusionnée et poussée (`main` à `ebd9b4ef`, CI verte, 30 jobs).
En cours : chantier « API complète sans Typegen » sur la branche
`api-challenge`, phase 1 (inventaire par trois agents en lecture seule, fiches
dans `api-inventory/`). Voir le [plan](api-challenge-plan.md).
