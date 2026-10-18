# Programme en cours (2026-10-18)

Note de passation du coordinateur, à vérifier contre l'arbre avant de s'y fier. Les notes de travail
plus anciennes sont dans le tag `api-challenge-archive`.

## Comment reprendre

- Une session par chantier, qui part de cette note et de la mémoire.
- Au début de chaque tâche, conseiller un modèle et un niveau d'effort (tableau dans
  [le brief des agents](../engineering/agent-brief.md)).
- Agents : suivre le brief (tests ciblés et `yarn validate:package`, un seul agent lourd à la fois).
  Coordinateur : une `yarn validate:full` par fusion dans `main`, plus `yarn website:test` si le site
  change et `yarn typecheck:typescript-7` si les types changent.

## Nettoyage de l'amplification : terminé

Fait : doc à source unique (ADR-0343), README racine court, régions orphelines retirées, couverture
par paquet et jobs de CI groupés (ADR-0342), configuration d'exemples partagée, fichiers statiques de
`create-app` réels, bases de test partagées (`tooling/vitest/`), mutations de plugin sur les étapes
natives (ADR-0344, faille Access corrigée), tests propres d'`auth-plugin`, `testing` et `plugin-kit`
(94 %, 96 % et 99 % des branches ; bugs corrigés : course de première ligne privée avec ADR-0345,
deux défauts de `testApplication`, commandes `update` sans `data` avec ADR-0346), 42 ADR remplacés
archivés (tag `adr-superseded-archive`), index d'architecture à jour, `ultima-base.ts` sous la limite.

Mesure après nettoyage : commit médian 3 fichiers (7 avant) ; aucun commit de code récent n'a touché la
doc ni les exemples ; validation locale ≈ 12 min ; CI complète ≈ 63 minutes facturées (97 avant).

Abandonné : types de champs génériques (les survols par type sont le contrat ; voir ac5c9a48).

## Ensuite

1. ADR « vocabulaire et exposition » : spike fait, [ADR-0347](../adr/0347-one-operation-vocabulary-and-shared-exposure.md)
   accepté par l'utilisateur le 2026-10-18 sur la branche `adr/vocabulary-exposure` (pas encore
   poussée ni fusionnée). Choix de l'utilisateur
   (2026-10-18) : périmètre §2.1 + §2.3 seulement ; hiérarchie `all` > `read`/`write` > opération >
   méthode, définie par Core ; clé `expose` possédée par Core (avertissement si aucun transport), avec exceptions par transport
   dans `rest`/`graphql` qui gagnent sur `expose` ; options communes (`default`, `hide`, `pagination`,
   `publicWrites`) sur les transports, une fois dans `apiServer()`, jamais sur `App` ;
   diagnostic Access au démarrage (avertissement hors production, échec en production), sans retirer
   de route. Écarté : vocabulaire des seules méthodes ou des seules opérations, `expose` dans
   `api-server` ou dans un plugin d'exposition, options d'exposition sur `App` (laisse croire qu'elles
   bornent l'API serveur), retrait des routes refusées (révèle l'absence de règle, prive Master par HTTP).
   **Faille trouvée le 2026-10-18 (implémentation arrêtée, en attente de décision) :** les droits
   ACL ne s'appliquent à aucune commande de plugin. La politique de lignes ACL se limite à
   `aclConstraintOperationKinds` (`packages/acl-permissions-plugin/src/plugin.ts:219`), sans
   `plugin-schema-mutation` ; `softDeleteOne/Many` et `restoreOne/Many` réussissent sans aucun droit
   sur la ligne (même illisible ; le contrôle `checkReadable` est sauté pour un résultat `{ id }`).
   Test rouge : `packages/acl-permissions-plugin/tests/e2e/acl-plugin-commands-postgres.postgres.e2e.test.ts`
   (8 échecs, 3 succès ; il attend le droit `update` pour l'effet `update`, `deleteOne` garde `delete`).
   Décision de l'utilisateur (2026-10-18) : option A, ADR séparé → [ADR-0348](../adr/0348-plugin-commands-need-the-acl-right-of-their-effect.md)
   accepté ; correctif confié à un agent `implementer` dans la worktree `../ultimadatabase-acl-fix`
   (branche `fix/acl-plugin-commands`), à relire puis fusionner `--no-ff` dans `adr/vocabulary-exposure`.
   Inventaire de la tranche fait (lecture seule) ; amendement d’implémentation de l’ADR-0347 **accepté le 2026-10-18**
   (fin de l'ADR : plan compilé à la première demande, `true`/groupes ouvrent les commandes, clé
   d'opération = méthode One servie, `default` dans `apiServer()` avec GraphQL, `expose` dans le message
   de `.with`), en attente de validation. Choix de conception sans effet public : catalogue dans
   `packages/core/src/plugins/command-catalog.ts` (natif statique + entrées du `CompiledCommandGraph`) ;
   contrôle des noms dans `snapshotSchemaMutationMap` et dans `command()` de Plugin Kit ; `expose`
   extrait dans `configure` comme `relations` (piège de provenance sinon) ; plan via
   `planExposure` sur la capacité de planification des transports ; message `publicWrites` inchangé
   (le transport décrit les méthodes) ; renommer `ultimabaseAuthWriteEmail` en `…One` et ~25 noms de
   commandes de tests ; étendre `examples/schema-form-d/tools/gen.mjs` avec `expose` pour le banc ;
   exemple de la tranche : `examples/rest`.
   Correctif ACL : appliqué seul sur `main` (choix de l'utilisateur), puis `main` fusionnée ici. Cas limite
   repoussé à la passe de tests propres d'`access-plugin` et de l'ACL : une opération non-Master lancée par
   un hook pendant le nettoyage des références ACL, sur le même schéma, échappe au filtre `acl-rows`.
   Fait : `validate:full` vert (808 fichiers, 4479 tests), `website:test` 59/59, TS 7 ok ; fusionné dans `main`
   local (a399235f, non poussé) puis ici (c10a1856). Attention : le projet `postgres-e2e` teste les `dist`
   construits ; sans rebuild, utiliser `coverage-postgres-e2e` pour tester les sources.
   Tranche, passe A (Core et Plugin Kit) terminée : worktree `../ultimadatabase-slice`, branche
   `feat/vocabulary-exposure-slice` (11 commits depuis 93ddd615, sans cast). Catalogue
   (`packages/core/src/plugins/command-catalog.ts`), règle de nommage (Core et `command()`), `expose` possédé par
   Core, `planExposure`, options communes dans Plugin Kit (`parseTransportExposureOptions`, `readExposurePlan`,
   `assertPublicWrites`). Effets visibles : `ultimabaseAuthWriteEmail` devient `ultimabaseAuthWriteEmailOne` ;
   les noms de commandes de test renommés changent les routes et champs GraphQL générés ; nouveaux types de plan
   à la racine de Core (à côté de `ApplicationOperationTransportPlanner`). `adr/vocabulary-exposure` fusionnée
   dans la tranche : `yarn validate:package acl-permissions-plugin` vert (131/131). Pendant la passe A,
   l'avertissement « no transport » apparaît même avec REST (REST ne lit pas encore le plan).
   Passe B terminée et relue (HEAD 14b6eaaa) : REST lit le plan, `apiServer()` reçoit `hide`,
   `pagination`, `publicWrites` (nouvelle dépendance api-server → plugin-kit), `examples/rest` passe à `expose`,
   doc REST/api-server/Build a Plugin, `gen.mjs` émet `expose` sur deux schémas sur trois.
   Mesures (2026-10-18) :
   - `yarn build` vert dans la tranche et dans la base (worktree `../ultimadatabase-acl-fix` détachée sur
     a399235f, reconstruite par `yarn build` : une base non bundlée donnait 8563 différences parasites).
   - Audit DX : 930 différences (604 ajouts, 62 retraits, 264 modifiées) + 11 pour `examples/schema-form-d`
     (audité seul : bug d'outil préexistant, « Duplicate audit key » quand il est audité avec `tests`, même
     `main` contre `main`). Ajouts : nouveaux exports, clés de `RestMethodRules`, options d'`apiServer()`,
     tests de types. Retraits : membres `string` de `RestCommandName`. Modifiées : `.with` gagne
     `& SchemaExposeRules<…>` (survols et diagnostics TS ; retour tronqué sur les gros schémas), survol de
     `RestMethodName` (union explicite), JSDoc REST, bruit de bundler et ordre d'une union. **Non annoncé** :
     le survol de `SchemaRulesSource` développe `RegisteredSchema<…>` (déclaration déplacée dans le chunk
     partagé par le bundler).
   - Banc forme D (3 passages entrelacés, charge < 4), médianes main → tranche : TS 7 50 = 0,55 → 0,56 s,
     200 = 1,79 → 1,83 s ; TS 6 50 = 1,88 → 1,90 s, 200 = 5,55 → 5,56 s. Sous les seuils de l'ADR-0297.
     Contrôles sur la tranche (14b6eaaa) : `yarn install --immutable` exit 0 ; `validate:full` exit 0 (817 fichiers,
     4568 tests, aucune erreur de type) ; `typecheck:typescript-7` exit 0 (44 projets ok) ; `website:test` 59/59.
     Tranche présentée le 2026-10-18. Réponses de l'utilisateur : dépendance api-server → plugin-kit
     acceptée ; règle `One`/`Many` gardée pour l'instant (crainte : `archiveOne` seul fait croire à un
     `archiveMany`) ; GraphQL doit fonctionner sans REST, donc la tranche n'entre pas dans `main` avant que
     GraphQL lise le plan (aujourd'hui `expose` n'a aucun effet sur GraphQL et l'avertissement « no
     transport » apparaît avec GraphQL seul) ; bug « Duplicate audit key » proposé en session séparée.
     Option B (`SchemaRulesSource`) essayée : cause = le bundler de déclarations découpe par module ;
     `exposure-rules.ts` importe `source-schema-templates.ts`, qui passe dans le chunk partagé, et le survol
     y développe `RegisteredSchema<…>`. Correctif qui marche sur la branche d'essai
     `exp/schema-rules-source-hover` (05ec8518, depuis 14b6eaaa) : `SchemaRulesSource` dans son propre module
     - copie privée `ExposureSchema` dans `exposure-rules.ts`. Audit `core` : l'écart disparaît, mais le
       survol du nouvel `ExposureCommandKey` affiche `ExposureSchema<TSchema>` (nom privé) au lieu de
       `SchemaRulesSource<TSchema>`. `typecheck` et `typecheck:tests` de core verts. Attention : les `dist`
       de la tranche sont construits depuis cette branche d'essai ; relancer `yarn build` sur la tranche.
       Prochaine action vérifiable : décision de l'utilisateur entre B (fusionner l'essai) et A (une ligne
       dans l'ADR-0347), puis l'étape GraphQL (agent `implementer`, tests d'abord).
1. ADR « commandes » (revue DX §4.1, §4.2, §4.5) et ADR « corbeille » (§4.4), séparés de l'ADR-0347.
1. ADR « erreurs » (revue DX §3.3).
1. Tests propres des paquets encore autour de 76 à 79 % des branches : `access-plugin` d'abord
   (sécurité), puis `roles-plugin`, `validation-plugin`, `postgres-plugin`.
1. Le reste de [la revue DX](revue-dx.md) et de [la revue de la déclaration](revue-dx-declaration.md) :
   sections 1, 3 (sauf 3.3) et 5.1 traitées par les ADR-0339 à 0341.
1. Migrations de base de données, préparation de la publication (versions en lockstep, liens des
   README vers l'URL publique du site), OAuth, benchmarks de la section Comparaison.

À ne faire que si un ADR change le démarrage d'une application : le code de démarrage répété dans les
17 exemples, les modèles en chaînes de `create-app`, les listes d'exports retirés dans les tests.
