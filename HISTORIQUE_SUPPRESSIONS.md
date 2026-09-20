# Historique des suppressions — simplification d’UltimaBase

Ce fichier répertorie les suppressions décidées pour le jalon 30, leur raison,
leur impact et leur livraison effective. Il sera mis à jour dans le commit de
chaque issue : une suppression en cours ne devient « réalisée » qu’après
validation et audit sans anomalie restante.

Dernière mise à jour : **20 septembre 2026**. Périmètre de l’exécution autorisée :
**3001 à 3014 incluses**, puis arrêt avant la simplification individuelle des plugins.

## Règle commune

Les fonctionnalités actuelles et les capacités utilisées des plugins sont
conservées. Une implémentation, ses exports, sa documentation ou ses seuls tests
ne suffisent pas à justifier une capacité sans consommateur concret. Les
invariants de sécurité, de cycle de vie et de conformité restent obligatoires.

Deux retraits concernent des usages existants expressément acceptés : les
applications actives simultanément dans un même environnement JavaScript, et
l’API publique de mesure `RuntimeCostProbe`. Les tests parallèles isolés et les
mesures internes restent conservés.

Les lignes ci-dessous recensent des décisions approuvées, pas de nouvelles
propositions. Tout autre retrait présentant un consommateur incertain ou une
perte fonctionnelle doit être expliqué et arbitré avant modification.

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

| Issues    | Ancien mécanisme à retirer                                                                        | Ce qui reprend sa responsabilité                                                  | État                   |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| 3008–3009 | Stockages indépendants des opérations et faits recopiés entre compilation et exécution            | Graphe privé canonique et liaison d’exécution attribuée au propriétaire           | Livré                  |
| 3010      | Ancienne table des sources et lectures Runtime des vues de mutation                               | Même graphe, avec la sémantique propre aux mutations conservée                    | Livré                  |
| 3011      | Registres de surfaces et générateurs redondants                                                   | Projections immuables des mêmes faits pour les méthodes développeur et Typegen    | À réaliser             |
| 3012      | Registres et comparaisons en double entre plans statiques et bindings des transports              | Projections REST/GraphQL du graphe, avec codecs et contrôle d’exécution conservés | À réaliser             |
| 3013      | Adaptateurs temporaires de migration, chemins historiques et vérifications réellement redondantes | Chemins canoniques et tests conservant chaque invariant requis                    | À réaliser             |
| 3014      | Aucun retrait nouveau autorisé par ce seul checkpoint                                             | Audit final de parité, sécurité, capacités des plugins, documentation et mesures  | À réaliser, puis arrêt |

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

- **3010 — livrée dans ce commit :** le Runtime des mutations lit désormais la
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

## Sources de décision

- [Plan actif](CURRENT_PLAN.md)
- [ADR-0258 : une application active](docs/adr/0258-single-active-application-lifecycle.md)
- [ADR-0259 : noyau réduit et commandes canoniques](docs/adr/0259-smaller-plugin-kernel-and-canonical-commands.md)
- [ADR-0260 : dispatch HTTP à propriétaire unique](docs/adr/0260-single-owner-http-dispatch.md)
- [ADR-0261 : compilation et matérialisation des commandes](docs/adr/0261-command-compilation-and-binding-phases.md)
- [Matrice des contrats à préserver](docs/plans/2026-09-20-architecture-contract-matrix.md)
- [Inventaire et audit des décisions](docs/plans/2026-09-20-smaller-kernel-decision-proposal.md)
