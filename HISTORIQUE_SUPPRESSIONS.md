# Historique des suppressions — simplification d’UltimaBase

Ce fichier conserve les suppressions livrées au jalon 30 et, dans une section
séparée, les candidats du jalon 31. Il indique leur raison, leur impact et leur
livraison effective. Il sera mis à jour dans le commit de
chaque issue : une suppression en cours ne devient « réalisée » qu’après
validation et audit sans anomalie restante.

Dernière mise à jour : **21 septembre 2026**. Le jalon 30 est terminé et reste
historique. Le jalon 31 est préparé à la demande de l’utilisateur ; aucune de
ses issues n’a démarré et aucun nouveau retrait public n’est accepté à ce stade.
Le lancement de l’implémentation et tout nouveau push attendent une autorisation
explicite. L’arrêt après la 3014, puis la reprise autorisée jusqu’à la 3034,
restent consignés dans le journal archivé du jalon 30.

## Règle commune

Les fonctionnalités actuelles et les capacités utilisées des plugins sont
conservées. Une implémentation, ses exports, sa documentation ou ses seuls tests
ne suffisent pas à justifier une capacité sans consommateur concret. Les
invariants de sécurité, de cycle de vie et de conformité restent obligatoires.

Trois retraits ciblés ont été expressément acceptés : les applications actives
simultanément dans un même environnement JavaScript, l’API publique de mesure
`RuntimeCostProbe`, et les callbacks/constructeurs dans la vue descriptive
`typegenGraph` (ADR-0262). Les tests parallèles isolés, les mesures internes,
les déclarations générées et les API d’exécution restent conservés.

Les sections du jalon 30 ci-dessous recensent des décisions approuvées.
La section finale du jalon 31 distingue les nouvelles propositions non livrées.
Tout autre retrait présentant un consommateur incertain ou une perte
fonctionnelle doit être expliqué et arbitré avant modification.

## Capacités publiques retirées

### R-001 — Décoration générique des capabilities

- **État : réalisée**, issue 3004, commit `5adb09b3`.
- **Retrait :** `decorateCapability`, `capability:decorate`, et leur mécanique
  exclusive de déclaration, de composition et de contrôle.
- **Raison :** aucun usage concret retenu ; une branche supplémentaire dans le
  graphe des plugins pour une extension hypothétique.
- **Conservé :** composition explicite des fournisseurs, cardinalités
  `single`/`multiple`/`pipeline`, middleware et ordre déterministe.

### R-002 — Remplacement générique des capabilities

- **État : réalisée**, issue 3004, commit `5adb09b3`.
- **Retrait :** `replaceCapability`, `capability:replace`, les cibles de
  remplacement et les contrôles propres à cette substitution.
- **Raison :** aucun consommateur concret ; suppression d’un second chemin de
  sélection des fournisseurs.
- **Conservé :** un graphe de fournisseurs déterministe avec rejet des conflits.

### R-003 — Remplacement du compilateur de schémas

- **État : réalisée**, issue 3004, commit `5adb09b3`.
- **Retrait :** `replaceSchemaCompiler`, `schema:replace`,
  `schemaCompilerCapability` et le protocole public permettant de choisir un
  autre compilateur.
- **Raison :** aucun compilateur alternatif utilisé.
- **Conservé :** compilation canonique du Core, contributions additives des
  plugins, contrôle structurel, intégrité des relations et provenance.

### R-004 — Remplacement du Runtime et API publique de mesure

- **État : réalisée**, issue 3004, commit `5adb09b3`.
- **Retrait :** `replaceRuntime`, `runtime:replace`,
  `runtimeExecutorCapability` et le protocole d’exécuteur substituable.
- **Retrait associé dans `@ultimabase/testing` :** `RuntimeCostProbe`,
  `RuntimeCostProbeOptions`, `RuntimeCostSnapshot`, `diffRuntimeCostSnapshots`
  et `assertNoOptionalRuntimeCost`.
- **Raison :** le remplacement n’avait pas d’usage produit ; son consommateur
  identifié était notre instrumentation de performance. L’utilisateur a
  accepté de garder cette instrumentation uniquement dans les tests internes.
- **Conservé :** Runtime canonique et mesures réelles des scénarios sans plugin
  métier, Hooks seul, Access seul et Hooks + Access. Les compteurs ont été
  comparés avant retrait de l’ancienne API. Aucun nouveau mécanisme public de
  remplacement ou option de production réservée aux tests n’est ajouté.

### R-005 — Registre d’extensions de Query

- **État : réalisée**, issue 3005, commit `21bb2e8f`.
- **Retrait :** `defineQueryExtension`, `query:extend`, `queries.extend()`,
  extensions attachées aux handles et leurs projections Typegen.
- **Raison :** pas d’usage concret en dehors des exemples et tests du mécanisme.
- **Conservé :** Query, filtres, builders immuables, CRUD et fonctions ordinaires
  réutilisant ces API.

### R-006 — Contributions Typegen manuelles

- **État : réalisée**, issue 3005.
- **Retrait :** `typegen:contribute`, `typegenContributions.add()`, les nœuds de
  types manuels, les augmentations et déclarations arbitraires ajoutées au
  fichier principal.
- **Raison :** niveau de déclaration supplémentaire sans consommateur produit.
- **Conservé :** types dérivés du graphe compilé, schémas, champs, options,
  opérations, mutations et références nominales effectivement consommées
  (`defineTypegenReference`, `typegen:reference`).

### R-007 — Fichiers supplémentaires émis par les plugins via Typegen

- **État : réalisée**, issue 3005.
- **Retrait :** `typegen:emit`, `typegenOutputs.emit()`, les sorties annexes
  `.d.ts`/`.json`, leur registre et leur génération ; support des sorties
  `kind: 'metadata'` dans le writer.
- **Raison :** aucun besoin concret de ces sorties supplémentaires.
- **Conservé :** génération déterministe du fichier de déclarations de
  l’application, empreinte, écriture atomique et utilitaires explicites
  d’écriture pour les intégrations de build.

### R-008 — Patches destructifs de schéma

- **État : réalisée**, issue 3005 ; ajout explicitement validé après audit.
- **Retrait :** `schema:transform`, remplacement/renommage/suppression de champs,
  remplacement/suppression d’index et de contraintes, suppression d’options de
  schéma/champ, et variantes des setters remplaçant une valeur existante via
  `target`. Les contrats de cible et les branches IR exclusives disparaissent.
- **Raison :** aucun consommateur concret de ces transformations ; elles
  multipliaient les cas de provenance et de validation.
- **Conservé :** ajouts de champs/index/contraintes, déclarations d’options,
  setters additifs, sélecteurs, provenance et rejet des doublons. Une valeur
  existante ne peut pas être écrasée silencieusement.
- **Nettoyage identifié :** six fichiers de l’ancienne chaîne de transformation (handlers, coordination
  et contexte) n’ont plus d’appelant, le
  compilateur canonique ayant déjà repris leur rôle. Leur retrait est livré
  dans cette même issue.
  Dans `packages/core/src/plugins` : `schema-transformations.ts`,
  `schema-transformation-context.ts`, `schema-field-transformations.ts`,
  `schema-index-transformations.ts`, `schema-constraint-transformations.ts`
  et `schema-option-transformations.ts`.

### R-009 — Observateur générique du Core

- **État : réalisée**, issue 3004, commit `5adb09b3` ; ajout validé après audit.
- **Retrait :** `runtimeObserverCapability`, `provideRuntimeObserver`, la
  factory générique `postCommitEvent` et leurs contrats/branches exclusifs.
- **Raison :** aucun consommateur produit de ce protocole générique.
- **Conservé :** **`runtime:observe`**, événements et diagnostics propres à
  Hooks/Access, livraison après commit, absence de livraison après rollback,
  attribution des callbacks et isolation des diagnostics.

### R-010 — Opérations génériques attachées aux schémas et modèles

- **État : réalisée**, issue 3005 ; ajout explicitement validé après audit.
- **Retrait :** cibles `schema`/`model` de `defineOperation`,
  `schemaCommands`/`modelCommands`, accès génériques `command()`/`commands` sur
  leurs handles, et les cartes générées correspondantes.
- **Raison :** mécanisme inutilisé dans le produit, distinct des vraies mutations
  de schéma utilisées par Soft Delete.
- **Conservé :** opérations applicatives, **`AppUser.signUp/login/refresh/logout`**,
  CRUD natif, **`schemaMutations`** et méthodes Soft Delete sur schéma/modèle.
  Les anciennes opérations ne sont pas recréées sous une autre API.

Chaque retrait comprend ses implémentations exclusives, exports, branches
inutiles, exemples et tests devenus sans objet. Les tests mixtes conservent les
invariants encore requis. Les anciens paramètres peuvent rester nommés dans
les tests de rejet ; aucune compatibilité silencieuse n’est prévue.

## Capacités de déploiement retirées

| Décision         | Suppression prévue                                                                                | Raison et comportement conservé                                                                                                                                                                                           | État / issue     |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| D-001 / ADR-0258 | Plusieurs applications initialisées simultanément dans un même environnement JavaScript           | Une seule application active ; requêtes concurrentes isolées ; remplacement après disposal complet ; tests parallèles dans des workers/processus isolés. Une seconde activation échoue avant les effets d’infrastructure. | Réalisée en 3006 |
| D-001 / ADR-0258 | Hébergement de plusieurs applications sur un même fournisseur Hono et `HttpApplicationMountTable` | Le serveur appartient à l’application active. L’identifiant HTTP vérifie toujours l’application exacte ; autorité Master, sessions, préflight, politique navigateur et erreurs sûres restent conservés.                   | Réalisée en 3007 |

## Implémentations internes à remplacer puis supprimer

Ces retraits réduisent les états et validations en double ; ils ne retirent pas
les fonctionnalités restantes. Les noms précis et les commits seront ajoutés
au fur et à mesure des migrations et de leurs audits.

| Issues    | Ancien mécanisme à retirer                                                                        | Ce qui reprend sa responsabilité                                                  | État                 |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| 3008–3009 | Stockages indépendants des opérations et faits recopiés entre compilation et exécution            | Graphe privé canonique et liaison d’exécution attribuée au propriétaire           | Livré                |
| 3010      | Ancienne table des sources et lectures Runtime des vues de mutation                               | Même graphe, avec la sémantique propre aux mutations conservée                    | Livré                |
| 3011      | Registres de surfaces et générateurs redondants                                                   | Projections immuables des mêmes faits pour les méthodes développeur et Typegen    | Livré                |
| 3012      | Registres et comparaisons en double entre plans statiques et bindings des transports              | Projections REST/GraphQL du graphe, avec codecs et contrôle d’exécution conservés | Livré                |
| 3013      | Adaptateurs temporaires de migration, chemins historiques et vérifications réellement redondantes | Chemins canoniques et tests conservant chaque invariant requis                    | Livré                |
| 3014      | Aucun retrait nouveau autorisé par ce seul checkpoint                                             | Audit final de parité, sécurité, capacités des plugins, documentation et mesures  | Livré, arrêt atteint |

## Journal de livraison

- **3001 — `b2c10fc2` :** inventaire et baseline, pas de suppression produit.
- **3002 — `481b3723` :** décision de cycle de vie ADR-0258 ; implémentation
  programmée en 3006/3007.
- **3003 — `f7e9596b` :** approbation et périmètre précis des dix retraits dans
  ADR-0259.
- **3004 — `5adb09b3` :** R-001 à R-004 et R-009 livrés et audités.
- **3005 — `21bb2e8f` :** R-005 à R-008 et R-010, après correction
  des constats et audit final sans anomalie restante. Réduction nette de
  **4 479 lignes de production** et **41 exports publics**. Les vérifications
  sont détaillées dans l’issue ; les tests unitaires, E2E, TypeScript, build,
  lint et documentation passent. Ce fichier est créé à la demande de l’utilisateur.

- **3006 — `30bd1452` :** retrait des applications initialisées
  simultanément dans un même environnement JavaScript. L’exécution concurrente
  des requêtes et les workers indépendants restent autorisés. Le remplacement
  attend les opérations en cours et la libération complète des ressources ;
  les anciens handles, contextes et grants Master restent invalides. La
  visibilité des méthodes de mutation ne cumule plus les anciennes applications.
  Aucun helper public de test ni mode de contournement n’est ajouté : les suites
  utilisent `beforeAll(start)` et `afterAll(dispose)`. Audit final sans anomalie
  restante ; 2 510 tests unitaires/types/performance et 379 intégrations validés.
  Cette étape ajoute **344 lignes de production** pour le contrôle et la fermeture
  sûre du cycle de vie. Le retrait de l’hébergement HTTP partagé reste en 3007.

- **3007 — `fc579bf4` :** retrait de `HttpApplicationMountTable`,
  de son type de configuration `HttpServerProviderCompatibility`, des tableaux
  d’applications, du set Hono des applications démarrées, de la comparaison
  CORS entre applications et du comptage des derniers montages. Le pont privé
  `fetchPreparedHttpApplication` et sa WeakMap disparaissent aussi.
  Le type consommé `HttpServerOwnership`, les validations de protocole et
  les erreurs sûres restent conservés. L’utilitaire public minimal de dispatch
  a été explicitement validé dans ADR-0260 ; il ne conserve aucune application.
  Réduction de **240 lignes de production** et **un export public net**.
  Audit final sans anomalie ; 2 523 tests unitaires/types/performance et 379
  intégrations passent. Aucun changement d’implémentation dans Core.

- **3008 — livrée dans `86a5bbd8` :** les déclarations d’opérations et de
  mutations appartiennent désormais au même graphe privé. Les stockages
  `#compiledOperations` et `#compiledSchemaSurfaces` sont remplacés par ce graphe
  et ses index dérivés. Les quatre registres Runtime `#handlers` et
  `#transportBindings`, ainsi que les comparaisons de propriétaire répétées
  dans les planners, disparaissent. Le type interne inutilisé
  `CompiledPluginSchemaMutation` et son export intermédiaire sont supprimés.
  Les handlers/codecs sont rattachés à leur commande pendant la matérialisation,
  conformément à la précision explicitement validée dans ADR-0261. Les vues
  de transition conservent les identités et l’ordre des méthodes ; aucune
  capacité de plugin ni API publique supplémentaire n’est ajoutée ou retirée.
  Cette étape de fondation ajoute **100 lignes de production** ; les exports
  publics et la taille des déclarations restent inchangés. Audit final sans
  anomalie restante : **2 529 tests unitaires/types/performance et 379
  intégrations** passent. Les adaptations restantes sont traitées en 3009–3012.

- **3009 — livrée dans `08c0b334` :** la construction d’enveloppe et la validation
  des entrées communes aux handles et aux transports ne sont plus dupliquées.
  Le Runtime des opérations ne lit plus `getOperation()` ni les anciennes vues
  de déclaration : identité, transactions, erreurs et résultats viennent de la
  commande canonique. La vue publique reste un adaptateur dérivé sans pouvoir
  d’enregistrement. Aucun changement métier dans Password Auth ou Plugin Kit,
  aucune nouvelle API ; les sessions, le stockage privé et les quatre méthodes
  d’authentification restent couverts. Audit final sans anomalie : **2 532 tests
  unitaires/types/performance et 379 intégrations** passent. Cette transition
  ajoute **52 lignes de production** ; les suppressions des adaptations restantes
  suivent en 3010–3013.

- **3010 — livrée dans `394045ab` :** le Runtime des mutations lit désormais la
  commande canonique et ses cibles figées. La table privée `schemaMutationSources`
  et son lecteur `readPluginSchemaMutationSource()` disparaissent. Handles et
  transports partagent la préparation du payload et de la projection, dans
  l’ordre de validation existant. Les vues publiques restent des adaptations
  dérivées ; aucun registre d’exécution indépendant n’est conservé. Aucun
  changement d’API ou de plugin concret : les deux modes Soft Delete, le Master,
  les Hooks, Access, les relations et les transactions restent couverts. Audit
  final sans anomalie : **2 533 tests unitaires/types/performance et 379
  intégrations** passent. Cette migration ajoute **50 lignes de production**,
  sans changement des exports ou de la taille des déclarations.

## Retrait supplémentaire approuvé — inspection Typegen

- **État : réalisée**, issue 3011, commit `c5073432`, ADR-0262 explicitement validé.
- **Retrait :** accès aux callbacks `input.snapshot` et `result.snapshot`, à
  l'identité du token exécutable et aux constructeurs de schéma depuis
  `CompiledTypegenGraph` / `typegenGraph`.
- **Raison :** les consommateurs Typegen et de conformité utilisent uniquement
  les descriptions. Cette projection lit désormais le graphe canonique sans
  exposer des objets exécutables inutilisés par ces outils.
- **Conservé :** déclarations d'origine, validateurs Runtime, méthodes directes,
  références nominales de types, propriétaires, alias, ordre et génération.
- **Vérification :** audit sans anomalie, 2 534 tests unitaires/types/performance,
  381 intégrations et 66 vérifications du site passent. Déclarations générées et
  empreintes identiques avant/après. `legacyViews()` et l’argument de provenance
  inutilisé du projecteur Typegen disparaissent ; réduction d'une ligne de production.
- Une option supprimée pourra être ajoutée lorsqu'un besoin concret l'exigera.

## Projections des transports — issue 3012 réalisée dans `df49ccdd`

Le plan et l'exécution partagent les mêmes descripteurs immuables dérivés des
commandes canoniques. Disparaissent les reconstructions parallèles, la liste de
bindings et le résolveur de surfaces conservés par le planner, le contrôle des
bindings sans cible, les lecteurs Runtime devenus inutilisés et les comparaisons
structurelles de GraphQL avec sa table de correspondance. Les frontières de
sélection, de contexte et de cycle de vie restent en place. Un binding sans
alias sélectionné reste inactif et ne crée aucune route, conformément à la 3012.
Audit sans anomalie : **2 535 tests unitaires/types/performance, 381 intégrations
et 66 vérifications du site** passent. Réduction de **111 lignes de production**,
avec les mêmes exports publics et la même taille de déclarations.

## Nettoyage final — issue 3013

- **3013 — `0828a1f4` :** retrait du dernier repli privé des lecteurs de bindings
  vers les anciens tokens source ; les lecteurs utilisent uniquement les
  commandes canoniques. Les deux scénarios de conformité Hooks/Access partagent
  leur préparation et conservent toutes leurs assertions. Les guides internes,
  la roadmap du site et le registre des décisions sont réconciliés. L’audit
  de couverture compare tous les emplacements conservés : aucune perte, aucun
  seuil ou exclusion modifié. Les 2 776 tests du contrôle de couverture,
  381 intégrations, 66 contrôles de contenu et 56 tests navigateur passent.
  Réduction de **4 lignes de production**, exports publics inchangés.

## Checkpoint Core — issue 3014 réalisée

Aucun retrait produit supplémentaire. Le checkout neuf a révélé une référence
TypeScript manquante pour `create-app` ; elle est ajoutée avec son test de
régression. L’audit réconcilie tous les contrats, les dix retraits, les cinq
écarts approuvés et les 39 protocoles d’origine. Les 16 plugins ont leur baseline,
sans démarrage de leur simplification.

Les tests de couverture (2 777), tests ordinaires (2 536), intégrations (381),
contrôles documentaires (66) et tests navigateur (56) passent. Tous les
emplacements de couverture conservés correspondent au rapport final de la 3013.
Bilan depuis la référence : **6 221 lignes de production supprimées nettes**,
dont **4 968 dans le Core**, et **106 exports publics en moins nets**. Cette issue
ne modifie aucune ligne de production. Les mesures n’établissent pas de gain
fiable de performances ou de CI.

Le [rapport détaillé](docs/plans/2026-09-21-core-kernel-simplification-checkpoint.md)
consigne aussi les corrections de l’environnement de validation et les délais
locaux. **Arrêt après la 3014 :** aucun travail sur la 3015, aucune reprise du
stash Soft Delete et aucun push. Le jalon reste ouvert pour une reprise explicite.

## Sources de décision

- [Plan actif](CURRENT_PLAN.md)
- [ADR-0258 : une application active](docs/adr/0258-single-active-application-lifecycle.md)
- [ADR-0259 : noyau réduit et commandes canoniques](docs/adr/0259-smaller-plugin-kernel-and-canonical-commands.md)
- [ADR-0260 : dispatch HTTP à propriétaire unique](docs/adr/0260-single-owner-http-dispatch.md)
- [ADR-0261 : compilation et matérialisation des commandes](docs/adr/0261-command-compilation-and-binding-phases.md)
- [ADR-0262 : inspection Typegen descriptive](docs/adr/0262-descriptive-typegen-command-inspection.md)
- [Matrice des contrats à préserver](docs/plans/2026-09-20-architecture-contract-matrix.md)
- [Inventaire et audit des décisions](docs/plans/2026-09-20-smaller-kernel-decision-proposal.md)

## Reprise des plugins — issue 3015 réalisée

Après l’arrêt respecté au checkpoint Core, l’utilisateur a autorisé les issues
3015 à 3034. Access retire sa méthode interne de prédicats relationnels sans
appelant, son relais privé devenu inutile, une finalisation de sélection
répétée et deux callbacks qui ne faisaient qu’ignorer un résultat réussi.
Le contrôle relationnel actif de Core, les règles métier, les erreurs, les
capabilities et les 79 exports restent inchangés. La compilation des règles
reste nécessaire et n’a pas été remaniée artificiellement.

Bilan de production Access : **5 227 → 5 185 lignes (−42)**, 29 fichiers.
Un test supplémentaire couvre le refus d’une sélection interdite sur une
mutation personnalisée. Les 2 778 tests de couverture et les 381 intégrations
sur exports construits passent, sans perte de couverture des chemins conservés.
Audit final sans anomalie restante ; aucun retrait public supplémentaire.

## Hooks — issue 3016 réalisée

Suppression de deux listes privées de champs jamais lues à l’exécution, de
l’ancien helper d’observateurs sans appelant, de paramètres internes inutilisés,
de plans de phases dupliqués et de relais de résolution d’entrée. La résolution
de schéma exécute directement son unique phase réelle, `resolveInput`.
L’ordre des callbacks, leur propriétaire, les snapshots, les transactions,
l’annulation, les diagnostics et les événements après commit restent conservés.

Bilan de production Hooks : **5 620 → 5 528 lignes (−92)**, 33 fichiers,
102 exports inchangés. Les 2 778 tests de couverture, 83 tests du package et
38 intégrations ciblées sur les exports construits passent sans perte de
couverture conservée. Audit final sans anomalie ; correction de deux précisions
documentaires existantes, sans changement public supplémentaire.

## Validation — issue 3017 réalisée

La projection arithmétique réutilise le schéma déjà vérifié et prépare une seule
fois l’expression commune aux cibles. Le dispatch des mises à jour est regroupé.
Deux validateurs de fixture sans import ni export public sont supprimés. Les
snapshots, les erreurs, l’ordre des validateurs et les deltas atomiques restent
conservés ; aucune capacité de validation ne disparaît.

Bilan : **787 → 757 lignes (−30)** selon la mesure constante du jalon, dont
23 lignes de fixtures inutilisées et 7 de logique exécutable. Les neuf exports
et déclarations construites restent identiques. Les 2 778 tests de couverture
passent sans perte sur les chemins conservés ; après suppression de la fixture,
les 41 tests du package et les deux intégrations construites passent aussi.
Audit final sans anomalie restante.

## Roles — issue 3018 réalisée

Le contrôle des cycles ne construit plus un second graphe et un résultat dont
aucun appelant produit ne se servait. Les appartenances directes et héritées
utilisées par Access restent calculées et mémorisées. Les événements réutilisent
les changements de relations déjà lus. Le garde privé des anciennes suppressions
en bloc, débranché lors de l’ADR-0164, disparaît avec son test isolé ; une
intégration vérifie le contrat actuel des lots atomiques et leur rollback.

Bilan de production : **2 397 → 2 313 lignes (−84)**, 12 fichiers, 40 exports
et déclarations publiques identiques. Les 2 778 tests de couverture, 22
intégrations ciblées et 66 contrôles du site passent sans perte de couverture
conservée. Le README et le site corrigent leur description périmée de
`deleteMany()` ; aucune politique de suppression ne change. Audit final vert.

## ACL — issue 3019 réalisée

Les événements lisent directement les snapshots validés par le Core : l’ancien
adaptateur de résultats, ses formats hérités et ses relais privés disparaissent.
La fusion des permissions après résolution des rôles repose sur le parseur ACL
canonique existant. Le choix du droit requis par une opération ne construit
plus une liste intermédiaire et une combinaison qui ne pouvaient pas servir.
La composition restrictive des politiques, la gestion Master, les limites,
les codecs et le nettoyage transactionnel restent inchangés.

Bilan de production : **3 725 → 3 581 lignes (−144)**, 19 → 18 fichiers,
42 exports et déclarations publiques identiques. Les 333 tests source ciblés
et d’intégration passent, avec les mêmes chemins et appels ACL couverts que le
rapport global précédent ; les 43 intégrations construites passent également.
Audit final vert, sans modification du Core ou d’Access.

## Password Authentication — issue 3020 réalisée

Le contrôle des usernames lit le schéma via le helper existant du Core au lieu
de redécrire les huit formes de mutation. Les wrappers privés de hachage qui
n’avaient que des tests pour consommateurs disparaissent ; ces tests exercent
désormais le chemin normalisé réellement utilisé par les opérations. Le type
privé de credential est réutilisé pour sa comparaison et sa mise à niveau.
Les méthodes AppUser, champs de signup, sessions, transactions, politiques,
Argon2id, payloads et erreurs restent inchangés.

Bilan de production : **3 329 → 3 234 lignes (−95)**, 21 fichiers, 32 exports
et déclarations publiques identiques. Après correction de l’isolation d’une
nouvelle fixture, les 318 tests source ciblés et d’intégration ainsi que les
106 contrôles sur packages construits passent. Aucun chemin conservé ne perd
sa couverture ; le garde d’upsert gagne un cas couvert. Audit final vert.

## Soft Delete — issue 3021 réalisée

Suppression des objets intermédiaires du plan de visibilité : un ensemble privé
conserve les mêmes identités de schémas et les mêmes contrôles de propriétaire.
Les trois commandes partagent leur validateur existant sans payload. Les types
du manifeste se déduisent de ses valeurs littérales immuables au lieu de recopier
chaque privilège et sa justification. Les modes, filtres, commandes, transports,
transactions et opérations privées Master restent inchangés.

Bilan de production : **788 → 738 lignes (−50)**, huit fichiers, cinq exports
et types publics équivalents. Les 274 contrôles source et d’intégration et les
23 intégrations construites passent sans perte de couverture conservée. Audit
final vert. Le stash des fonctionnalités Soft Delete suspendues reste intact.

## PostgreSQL — issue 3022 réalisée

Les trois anciens lecteurs scalaires, déjà contournés par le compilateur
relationnel pour toutes les lectures, disparaissent avec leurs branches mortes.
Les mutations singulières et les upserts partagent le même verrouillage privé
sans modifier leurs requêtes, contraintes, transactions ou garanties SQL. Une
closure de compilation n'est plus créée sur le chemin qui ne l'utilisait pas.

Bilan de production : **10 891 → 10 794 lignes (−97)**, 65 fichiers, 39 exports
et déclarations publiques identiques. Un fichier repasse sous 600 lignes.
Les 2 778 contrôles fonctionnels de couverture et les 383 intégrations construites
passent sans perte de couverture conservée ; l'unique échec de métadonnée du
premier passage a été corrigé et les neuf contrôles du backlog repassent au vert.
Le README décrit désormais correctement les transactions et cibles manquantes
déjà en place. Audit final vert, sans changement du contrat public.

## PostgreSQL Vector — issue 3023 auditée sans suppression

Le plugin possède déjà un validateur partagé, une factory et une déclaration
de méthode sans plan parallèle. L'audit ne justifie aucune suppression interne :
**246 lignes de production et 11 exports conservés, delta nul**. Une phrase du
README et un JSDoc périmé sont corrigés. Le stockage physique PostgreSQL reste
explicitement non livré, comme avant ; aucun nouveau mécanisme n'est ajouté.
Les 56 contrôles source/types et huit contrôles construits passent. Le code
exécutable et la structure des types sont identiques, avec la couverture
complète du passage précédent conservée. Audit final vert.

## HTTP — issue 3024 réalisée

La ressource HTTP conserve directement son état privé : la table de recherche
par application, le booléen de fermeture et deux copies de configuration
disparaissent. Le retrait de l'exécuteur ferme toujours les requêtes et reste
vérifié après les étapes asynchrones. Une branche aux deux résultats identiques
est supprimée ; routes et CORS partagent leur liste de méthodes. Les headers
sensibles sont mémorisés dans un ensemble au lieu d'un compteur toujours limité
à une occurrence, avec les mêmes rejets de doublons.

Bilan de production HTTP : **2 517 → 2 499 lignes (−18)**, 14 fichiers et
64 exports conservés. Le contrat GraphQL HTTP reste inchangé (82 lignes).
Les 364 contrôles source et 383 intégrations construites passent, sans perte
de couverture conservée. Credentials, provenance, Master, CORS, erreurs,
timeouts et disposal gardent leur comportement. Audit final vert.

## Hono Server — issue 3025 réalisée

Les hooks publics `stop` et `dispose` partagent le même arrêt privé. Deux relais
de lecture de capabilities et l'alias privé `dispose` du provider disparaissent.
La file d'attente et la propriété du listener rendent deux conditions redondantes,
qui sont supprimées. L'admission des requêtes, le nettoyage après échec,
la fermeture progressive et la protection contre les anciens propriétaires restent
intacts.

Bilan de production : **495 → 492 lignes (−3)**, cinq fichiers, six exports
et déclarations publiques identiques. Les 277 contrôles source et 147 intégrations
construites passent sans perte de couverture conservée, avec les scénarios réseau
et Chromium. Les assertions des tests sont conservées. Audit final vert.

## REST — issue 3026 réalisée

Le registre privé de provenance sans consommateur et les deux blocs `catch`
qui relançaient toujours la même erreur disparaissent. Les projections des
champs virtuels partagent une fonction privée ; la table d'identité des noms
d'opération et les branches déjà traitées de la sélection HTTP sont retirées.
Les contrôles réels des routes, propriétaires, commandes, limites et erreurs
restent en place, ainsi que tous les codecs et contrats REST v1.

Bilan de production : **4 955 → 4 875 lignes (−80)**, 27 fichiers, 45 exports
et déclarations publiques identiques. Les 358 contrôles source et 383 intégrations
construites passent sans perte de couverture conservée. Aucun contrat public
ni assertion de test ne change. Audit final vert.

## GraphQL — issue 3027 réalisée

La fermeture retire l'état privé complet au lieu de maintenir trois indicateurs
et des états partiellement vidés. Deux index de schémas reconstruits sont
remplacés par le registre compilé existant. L'ordre des types vient de leur
registre de déclaration, sans tableau parallèle. Le calcul du propriétaire et
celui des noms de types sont partagés ; deux relais vers le compilateur de
filtres disparaissent. Les validations de composition, sélections de commandes,
caches récursifs et signatures de curseurs sont conservés.

Bilan de production : **8 710 → 8 662 lignes (−48)**, 52 fichiers, 33 exports
et déclarations publiques identiques. Les 2 779 tests de couverture complète
et 383 intégrations construites passent. Aucun seuil, exclusion ou assertion
n'est affaibli ; aucune couverture conservée n'est perdue. Le schéma public,
les erreurs, les capacités des plugins et la fermeture restent identiques.
Audit final vert.

## GraphQL Yoga — issue 3028 auditée sans suppression

L'audit confirme que les validations HTTP, les limites GraphQL et la projection
du protocole répondent à des contrats distincts. Les deux essais de simplification
ont été retirés après contrôle : la projection du protocole est nécessaire et le
regroupement des erreurs n'offrait pas de gain net utile en préservant tous leurs
diagnostics. Aucun élargissement d'API n'a été ajouté.

**815 lignes de production et quatre exports Yoga conservés, delta nul** ;
le contrat GraphQL HTTP conserve ses 82 lignes et trois exports. L'exemple du
README définit maintenant un schéma interrogeable et un démarrage complet.
Les 51 contrôles source/types, 52 intégrations construites/archives et 66 contrôles
documentaires passent. Le code final est identique à celui de la couverture
complète précédente. Audit final vert, sans nouvelle fonctionnalité.

## GraphiQL — issue 3029 réalisée

L'environnement de déploiement n'est plus conservé après le calcul de
l'activation. Le résultat normalisé contient seulement les deux propriétés
publiques existantes : `enabled` et `path`. Les variables intermédiaires de la
factory sont conservées : leur retrait dégradait l'inférence des manifestes.
Aucun cast ni nouveau mécanisme de typage n'a été ajouté.

Bilan de production : **280 → 278 lignes (−2)**, quatre fichiers, cinq exports
et déclarations publiques identiques. Les 20 contrôles source/HTTP et
54 intégrations construites/archives passent avec une couverture identique.
Le HTML, les assets, la politique de sécurité et les règles d'environnement
restent inchangés. Audit final vert.

## Apollo Sandbox — issue 3030 réalisée

Comme pour GraphiQL, l'environnement est consommé par la normalisation puis
retiré de l'état conservé. Les exports existants réutilisent directement les
deux propriétés normalisées : `enabled` et `path`. Aucun contrat public ne change.

Bilan de production : **293 → 291 lignes (−2)**, quatre fichiers, cinq exports
et déclarations publiques identiques. Les 20 contrôles source/HTTP et
52 intégrations construites/archives passent avec une couverture identique.
Le HTML, les assets, le hook de requête, l'URL fixe et les règles de production
restent inchangés. Audit final vert ; la revue des 16 plugins est terminée.

## Documentation Core et création de plugins — issue 3031 réalisée

La revue couvre 44 pages du site et corrige 12 pages : parcours d'installation,
application unique et workers, Typegen, tests et publication des commandes.
Une présentation en double et des formulations devenues ambiguës sont retirées.
Aucune API ni fonctionnalité supplémentaire n'est supprimée. **Delta de
production nul**. Les 66 contrôles de contenu et 38 contrôles Chromium passent,
ainsi que typage, lint et build du site. Audit final vert.

## Documentation données et sécurité — issue 3032 réalisée

La revue couvre 26 pages et corrige neuf pages, dont un exemple Roles vérifié
sur PostgreSQL avec les déclarations Typegen réelles. Les démarrages implicites
dans les modules de configuration et une fausse mention de hooks de lecture
sont retirés. Les limites de visibilité Soft Delete restent explicites. Deux
défauts d'accessibilité du site sont corrigés et protégés par les tests navigateur.
Aucune API ni fonctionnalité supplémentaire n'est supprimée ; **delta de
production des packages nul**. Les 66 contrôles de contenu, 31 tests navigateur
et 12 combinaisons page/thème/écran passent. Audit final vert.

## Documentation HTTP et transports — issue 3033 réalisée

La revue couvre 15 pages et corrige six pages ainsi que deux exemples de README.
Le démarrage est retiré des configurations réutilisables et la fermeture des
listeners est documentée. Les exemples Hono et GraphQL reçoivent le fournisseur
PostgreSQL qui leur manquait. Les routes, formats, erreurs, permissions et
capacités des plugins restent inchangés ; **delta de production nul**.
Les parcours réels REST/GraphQL, Typegen et PostgreSQL passent, avec 66 contrôles
de contenu, 32 tests navigateur et 24 combinaisons page/thème/écran. Audit vert.

## Audit final — issue 3034 réalisée, jalon 30 terminé

La matrice conserve ses 89 identifiants. Les 36 protocoles retenus et les usages
publics restent présents ; les seules suppressions de capacités sont celles
déjà validées. Les 16 plugins ont été audités, dont deux sans réduction forcée.
La vérification complète part d'une copie Git propre. Un défaut de formatage
GraphQL retire trois lignes sans changer le JavaScript canonique ; la roadmap
et une ancienne mention des extensions Query sont corrigées.

Bilan final : **134 104 → 127 093 lignes de production (−7 011)**, dont
**73 748 → 68 780 dans Core (−4 968)**. Après le point 3014 : **−790 lignes**,
dont trois de formatage. Les 1 726 exports publics restent identiques depuis 3014. La couverture conservée ne perd aucun emplacement ; le rapport final
sépare les mesures locales des performances et d'une CI hébergée non relancée.
Aucun nouveau pouvoir public ni fonctionnalité suspendue n'est ajouté.
Le plan est archivé et l'exécution s'arrête après 3034, sans push.

## Jalon 31 — candidats préparés, aucune suppression livrée

Le [plan](docs/plans/2026-09-21-residual-complexity-simplification.md) et
l’[inventaire initial](docs/plans/2026-09-21-residual-complexity-inventory.md)
portent les preuves, décisions et critères de conservation. Les anciens R-001
à R-010 n’autorisent pas ces nouveaux retraits publics.

| Candidat                                                                 | Issues    | État actuel                                                                    | À conserver                                                     |
| ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| RC-01 : fonctions privées inutilisées et registres Access/Hooks vides    | 3101–3104 | Nettoyage proposé ; 14 fonctions / 304 lignes de corps recensées, à revérifier | Déclarations actuelles, provenance et API publiques             |
| RC-02 : chemins de champs recopiés dans Hooks                            | 3104      | Réutilisation des types Core proposée ; fichier de 143 lignes                  | Imports publics Hooks, inférence et aide de l’éditeur           |
| RC-03 : aller-retour du compilateur via une représentation intermédiaire | 3105–3106 | Décision d’architecture en attente                                             | Validation, ordre, ownership, relations et publication atomique |
| RC-04 : extension Runtime normalization/commit inutilisée                | 3107–3108 | Décision publique en attente                                                   | Interceptors utilisés par ACL, transactions et hooks de commit  |
| RC-05 : marqueur Typegen sans lecteur                                    | 3107/3109 | Décision publique en attente, y compris son effet d’unicité                    | Génération automatique, types et empreintes déterministes       |
| RC-06 : anticipation des migrations                                      | 3107/3110 | Décision publique et usages de test à trancher                                 | Synchronisation PostgreSQL, stockage privé et provenance utile  |

Une proposition ne devient « approuvée » qu’après la décision nécessaire, puis
« réalisée » après son implémentation, sa validation et son audit sans anomalie
restante. Chaque issue livrée complète cet historique dans son commit dédié.
Les nombres ci-dessus sont des mesures de candidats, pas des gains réalisés.
