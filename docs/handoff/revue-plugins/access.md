# Revue du plugin Access (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md) : revue avec l'utilisateur avant
migration. Source : [fiche d'inventaire](../api-inventory/access-plugin.md),
README du paquet, ADR-0293. Les décisions qui changent un contrat public
donneront un ADR à la migration (ADR-0288).

## Concept

Conservé. Modèle calqué sur KeystoneJS, en trois étapes à l'exécution :
opération (avant chargement), filtre de lignes (dans la requête), contrôle
par objet `item` (sur l'original verrouillé et le candidat, sécurité par ligne
en JavaScript sans ACL). Access (règles générales dans le code) et ACL (droits
stockés par ligne) restent deux plugins complémentaires qui se cumulent ; la
documentation explique quand utiliser l'un ou l'autre.

## Décisions

1. **`allow` et `where` fusionnés** : une fonction par opération renvoie
   `true` (toutes les lignes), `false` (aucune) ou un filtre ; elle s'exécute
   avant le chargement (l'étape « opération » est préservée). Le type interdit
   de ne rien renvoyer, ce qui supprime le piège d'ADR-0293 (`undefined`) ;
   un nouvel ADR remplacera cette partie d'ADR-0293.
2. **`item` conservé** pour les mutations : forme détaillée
   `{ where, item }`, `item({ originalItem, item, principal, … })` renvoie un
   booléen.

   ```ts
   update: ({ principal, where }) => (principal ? where.eq('author', principal.id) : false),
   update: {
   	where: ({ principal }) => principal !== undefined,
   	item: ({ originalItem, item, principal }) =>
   		originalItem.author === principal?.id && item.author === originalItem.author,
   },
   ```

3. **Ouverture sans règle, explicite et par opération** : l'option `default`
   (et sa forme détaillée) est remplacée par `allowWithoutRule`. Sans elle,
   tout est refusé.

   ```ts
   accessPlugin({ allowWithoutRule: { all: true, write: false } }) // tout sauf les écritures
   accessPlugin({ allowWithoutRule: { read: true, count: false } }) // lecture publique sauf count
   accessPlugin({ allowWithoutRule: { all: 'development' } }) // prototype
   ```

   - Clés : `all` ; groupes `read` (`one`, `many`, `count`, `exists`) et
     `write` (`create`, `update`, `upsert`, `delete` et mutations de plugin) ;
     chaque opération seule. Priorité : opération > groupe > `all` ; une règle
     de schéma l'emporte toujours.
   - Valeurs : `true` (autorisé partout, y compris en production),
     `'development'` (autorisé hors production ; refus de démarrer en
     production avec un message explicite), `false` ou absent (refusé).
   - Une valeur peut aussi être un prédicat de contexte qui renvoie un
     booléen (pas de filtre : le repli vaut pour tous les schémas, dont les
     champs ne sont pas connus) : `write: isAuthenticated`,
     `delete: hasRole(Admin)`. Ce sont les mêmes prédicats que dans les règles
     de schéma ; ils reçoivent `principal`, l'opération et le nom du schéma.
   - Journal au démarrage, production comprise, listant ce qui est ouvert
     (avec le nom du prédicat le cas échéant).
   - Une ouverture de `write` est une politique explicite au sens d'ADR-0294 :
     les transports n'exigent pas `publicWrites: true` en plus.

4. **`principal` neutre** : capacité de Core « principal courant »
   (`{ id, schema }` ou `undefined`), fournie par l'authentification et lue par
   Access, Hooks et Roles ; plus d'import de `passwordPrincipal` dans les
   règles. Décision d'architecture : ADR.
5. **Règles de champ partielles** : `output`, `where`, `orderBy` et `fill`,
   `replace`, `clear` deviennent facultatifs ; omission = aucune restriction.
6. **Utilitaires** : on garde `anyOf`, `allOf`, `not` ; on retire `allowAll`,
   `denyAll`, `allOperations`, `allMutations` (inutiles avec le refus par
   défaut et `true`/`false`).
7. **Granularité de lecture** conservée en option
   (`read: { one, many, count, exists }`), `read: fn` couvre les quatre.
8. **Diagnostic de refus en développement** : le serveur journalise la règle
   qui a refusé (opération, schéma, étape) ; rien ne change côté client.
9. **Récapitulatif au démarrage** des schémas exposés sans règle Access
   (« tout refusé »), informatif.
10. **Rejeté** : raccourci `owner: 'author'` (le cas propriétaire tient en une
    ligne avec 1 et 4 ; deuxième forme pour le même besoin).

11. **`can()` à prévoir** : savoir si une action est permise sans l'exécuter,
    pour l'interface (afficher un bouton) et pour tester ses règles :
    `ultimabase.plugin(accessPlugin).can({ principal, operation, schema, item })`.
12. **`isAuthenticated`** : prédicat fourni (`create: isAuthenticated`),
    utilisable aussi dans `allowWithoutRule`.
13. **Hors périmètre** : l'isolation multi-tenant sera un plugin séparé, prévu
    plus tard par l'utilisateur.
14. **À vérifier dans le code** : écritures imbriquées soumises aux règles du
    schéma cible, `include` filtrés par les règles du schéma cible, résultat
    d'une création ou mise à jour non relisible par l'appelant.

Les mutations de plugin (`softDelete`, `archive`…) gardent leur clé propre
dans `access`, avec la même forme (fonction ou `{ where, item }`) ; leur
`input` est disponible dans la fonction.
