# Revue du plugin Hooks (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/hooks-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : moteur du cycle de vie des écritures sur le modèle de KeystoneJS
(`resolveInput`, `beforeOperation`, `afterOperation`), hooks de champ et de
schéma, exécution transactionnelle (une erreur annule tout), ordre garanti,
hooks des mutations de plugin, contributions des plugins tiers par
`provideHookContributions`. `hooksPlugin()` reste sans option obligatoire.

## Décisions

1. **`resolveInput` transforme des données** : `create({ data })`,
   `update({ changes, originalItem })` (seulement ce qui change),
   `upsert({ mode, data, changes })` ; Core retraduit en opérations. Les
   opérations atomiques (`increment`, `connect`/`disconnect`…) restent des
   opérations, visibles sous forme lisible, jamais réécrites en valeurs.
   L'arbre interne reste accessible aux plugins par
   `provideHookContributions`.
2. **`context.principal`** (capacité neutre de Core, comme Access) ; le
   contexte garde `access`, `requestId`, `signal`, `source`.
3. **`item` et `originalItem` sont des données** (`Model<"Todo">`), sans
   méthodes ; agir sur d'autres lignes passe par l'API normale, qui hérite de
   la transaction et de l'autorité.
4. **`afterCommit` dans le schéma** : exécuté après la réussite du commit,
   hors transaction ; une erreur est journalisée sans rien annuler ;
   « au mieux », dans le même processus (limite écrite dans la JSDoc et la
   doc).
5. **Événements garantis typés** : `defineEvent<P>('todo.created')`,
   `context.emit(todoCreated, payload)`, consommateur déclaré dans
   l'application sans écrire de plugin :
   `new App({ schemas, events: [onEvent(todoCreated, handler)] })` ; liaison
   par valeur (charge utile typée), plus par chaîne. Garantie de livraison
   actuelle à vérifier avant migration.
6. **`PublicError` dans Core** : `throw new PublicError(message, { code? })`
   donne une erreur client propre (REST 400, erreur GraphQL), message montré,
   code stable optionnel, annulation ; toute autre erreur reste masquée et
   journalisée.
7. **`beforeOperation.upsert`** ajouté (avec `mode`).
8. **Clé `all`** pour `resolveInput`, `beforeOperation`, `afterOperation` et
   `afterCommit` ; `all` s'exécute avant le hook de l'opération.
9. **Hooks de champ simples** : la valeur seule, appelés seulement pour une
   valeur non nulle (décision 14 des formes).
10. **Pas de hooks de lecture** (`beforeFind`/`afterFind`) : couverts par
    Access, les règles de champ et les champs virtuels ; à rouvrir sur un
    besoin réel.
11. **Gardé** : noms de phases Keystone, listes de hooks par phase (ordre de
    déclaration), hooks des mutations de plugin, API des plugins tiers.
