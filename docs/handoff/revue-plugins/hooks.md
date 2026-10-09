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
   `hooksPlugin({ events: [onEvent(todoCreated, handler)] })` (corrigé pendant la revue HTTP : pas dans `new App`, Core ne connaît pas les événements du plugin Hooks) ; liaison
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
12. **Hooks globaux d'application** : `hooksPlugin({ global: { … } })` avec
    les mêmes phases et la clé `all` ; `item` générique et `schema` pour savoir
    lequel ; plus besoin d'écrire un plugin ni de recopier un hook d'audit
    dans chaque schéma.
13. **Règles d'`afterCommit` à spécifier** : exécution séquentielle dans
    l'ordre global → `all` → opération, une erreur journalisée n'empêche pas
    les suivants ; opérations en masse = un `afterCommit` par ligne après le
    commit de toute la transaction ; la réponse au client n'attend pas les
    `afterCommit` (utilitaire de test pour les attendre).
14. **Vérification du code (2026-10-09, lecture seule, `main` 116cf14e)** :
    - Récursion : une écriture faite dans un hook rejoint la transaction et
      redéclenche les hooks. Garde par identité du hook (pas de profondeur) :
      réentrer le même hook lève `RUNTIME_CALLBACK_RECURSION` et annule tout,
      donc aucune boucle infinie possible ; mais un cas légitime est bloqué
      (un `afterUpdate` de Todo qui met à jour un **autre** Todo, son parent).
      À décider.
    - Liens de relation par table de jointure : seuls les hooks de mise à jour
      de Todo s'exécutent, Tag n'en voit rien ; le changement n'apparaît que
      dans l'arbre interne (`nestedWrite` / `operation`), pas dans `item`. Par
      pointeur inverse, les hooks de Tag s'exécutent normalement. À décider
      avec la décision 1 (`changes`).
    - Événements : **pas de livraison garantie**. `delivery` vaut seulement
      `optional`/`required` (exiger un consommateur) ; livraison en mémoire,
      après commit, au plus une fois, sans file durable ni nouvel essai,
      perdue si le processus s'arrête ; les consommateurs sont **attendus**
      sur le chemin de la requête et leur échec fait **rejeter l'appel alors
      que l'écriture est enregistrée** (risque de nouvel essai client et de
      doublon) ; ils ne peuvent pas interroger la base. Corrige la prémisse de
      la décision 5.
    - Tests manquants relevés : auto-écriture et cycle via l'API de modèle,
      hooks lors de `connect`/`disconnect`/`set` en mise à jour, consommateur
      d'événement en échec, événement requis sans consommateur.

15. **Décisions après vérification** :
    - Un échec après commit (consommateur d'événement, `afterCommit`) ne
      rejette jamais l'appel : il est journalisé. Les événements gardent leur
      rôle de découplage avec la même garantie « au mieux » qu'`afterCommit`,
      écrite noir sur blanc ; la décision 5 ne parle plus de livraison
      garantie. Une livraison durable (outbox écrite dans la transaction,
      nouveaux essais, au moins une fois) sera un futur plugin de file
      d'attente, noté pour plus tard.
    - Récursion : limite de profondeur (par exemple 16) avec la chaîne
      affichée dans le message, au lieu de la garde par identité qui
      bloquait les cascades légitimes (enfant → parent).
    - Liens de relation : `changes.tags` les montre sous forme lisible
      (`{ connect: [...], disconnect: [...] }`, différence calculée pour
      `set`), y compris pour une table de jointure.
16. **Absent volontairement** : aucune option pour désactiver les hooks
    (`skipHooks`) ; Master contourne les droits, jamais les hooks ; la doc
    explique pourquoi.
