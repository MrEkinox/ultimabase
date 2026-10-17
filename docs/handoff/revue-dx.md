# Revue DX (2026-10-16)

Revue en lecture seule de `main` 41cae632. Les 17 exemples, les pages du site et les README ont été
relus par quatre agents, chacun sur une tranche : démarrage et Core, règles métier, auth et
transports, création de plugins et transversal. Les quatre rapports comptent environ 105 constats.
Ce document les regroupe par thème, écarte les doublons et donne mon avis.

Les constats les plus forts ont été vérifiés dans le code, à savoir les points 1.1, 2.2, 3.1, 4.4
et la plupart des corrections immédiates.

Légende :

- **[ADR]** : change un contrat public, donc une décision est nécessaire.
- **[doc]** : simple correction de doc ou d'exemple.
- **[inv]** : invariant voulu ; le coût DX est réel, mais l'invariant n'est pas à casser.

## 0. Corrections immédiates, sans ADR

Ce sont des erreurs de doc ou d'exemple, toutes vérifiables :

- **Exemple invalide.** La JSDoc de `t.asMaster` montre `Task.deleteMany({ where: {} })`, qui
  n'est pas valide puisque `where` est une liste de cibles uniques
  (`packages/testing/src/application/test-application.ts:75`).
- **API inexistante.** La JSDoc de `anyOf` cite `isOwner("author")`, qui n'existe pas
  (`packages/access-plugin/src/authoring/utilities.ts:62`). Elle s'affiche au survol.
- **Contradiction Validation / Hooks.** `using-plugins.mdx:165` dit que Validation « ne transforme
  pas », alors que `validation.mdx:111` dit que la sortie du validateur est ce qui est stocké.
- **Mauvais renvoi.** La doc d'ACL dit que `'write'` vaut « comme dans Access », ce qui est faux :
  Access inclut aussi create et upsert.
- **Option inexistante.** Le dépannage de Soft Delete cite un interrupteur `mutations` qui n'existe
  pas.
- **Commentaire périmé.** `examples/schema-form-d/src/ultimabase.ts:9` dit que `Register` est
  « optional », alors qu'il est obligatoire.
- **Mauvaise erreur dans les exemples.** Les Hooks de `todo-backend` et `schema-form-d` lèvent un
  `TypeError` pour une règle métier. Un client REST ou GraphQL reçoit alors une erreur interne. Il
  faut utiliser `PublicError` et tester la réponse publique.
- **Pages de Core contradictoires.** Elles parlent encore de `get(field)` sur les résultats (qui
  sont des objets simples) et de `limit`/`offset` (la pagination est par curseur).
- **Appels `t.afterCommit()` inutiles.** Il y en a 22 en fin de test, alors que la sortie du
  `using` attend déjà. Le guide de test se contredit sur ce point.
- **`appId` superflu.** Il est présent dans presque tous les exemples sans servir à rien (il ne
  compte qu'avec `requireApplicationId`).
- **Historique dans la doc utilisateur.** On y trouve encore « migration step 6.8b », des
  fonctionnalités retirées, et 59 références d'ADR dans les commentaires d'exemples et certains
  messages d'erreur.
- **Exemple « minimal » trompeur.** Le parcours de découverte envoie vers `examples/minimal`, qui
  est en réalité l'exemple le plus complet (15 paquets). Il faut pointer vers `modeling` et
  renommer `minimal` (par exemple `full-stack`).
- **Ordre des pages « Créer un plugin ».** La page d'entrée ouvre sur un `plugin()` brut « pas
  utile », puis recommande `definePlugin`. Il faut commencer par `definePlugin` avec un test.

Mon avis : un agent peut faire tout ça d'un coup, sans risque. Je recommande de commencer par là.

## 1. Ce que chaque application paie (impact le plus large)

1.1 **Clé Master obligatoire, même sans transport.** [ADR]

- `MasterAuthority` exige des `keys` non vides
  (`packages/core/src/runtime/master/master-authority.ts:117`).
- Pourtant, `useMasterKey: true` ne vérifie aucune clé.
- Résultat : environ 15 lignes de lecture d'environnement, de garde et d'`onUse` dans 7 exemples
  et dans `create-app`, plus une fausse clé injectée dans 6 configurations Vitest.
- Proposition : une autorité Master sans clé pour l'usage interne au serveur, les clés n'étant
  exigées qu'avec `httpPlugin({ master: true })` ; ou une lecture de la clé au `start()`.
- Mon avis : c'est le meilleur rapport gain/effort de la revue. L'audit (`onUse`) reste obligatoire.

1.2 **Attente de l'arrêt écrite à la main.** [ADR léger, additif]

- On trouve 8 lignes de `new Promise` sur `SIGINT`/`SIGTERM` dans 14 fichiers `main.ts` et dans
  le template, sous deux styles différents.
- Proposition : `await app.waitForShutdown()`, ou un plugin serveur qui gère les signaux.

1.3 **Bloc `Register` obligatoire.** [inv ADR-0297]

- Le bloc fait 5 lignes. Il est imposé pour les performances de typage.
- On le garde, mais :
  - `principal` devrait se déduire de `App.UserSchema` au lieu d'être déclaré à part (aujourd'hui,
    sans ça, il reste `PointerValue`) [ADR] ;
  - `create-app` devrait l'écrire.

1.4 **Mise en place du projet incohérente.** [doc + create-app]

- L'installation manuelle et `create-app` enseignent deux structures différentes.
- La fabrique porte quatre noms : `App`, `SchemaApplication`, `Application`,
  `MinimalSchemaApplication`.
- Les imports locaux se terminent tantôt en `.js`, tantôt en `.ts`.
- Proposition : une seule structure (`app.ts` qui contient `App`), partout.

1.5 **`...apiServer()` doit être étalé.** [ADR léger]

- `use()` n'accepte pas une liste imbriquée, d'où l'étalement obligatoire.
- Les entrées passées à `use()` mélangent appels et valeurs nues.

## 2. Exposition REST et GraphQL (incohérences les plus visibles côté client)

2.1 **Quatre vocabulaires d'opérations dans un même `.with`.** [ADR]

- Access utilise `create`/`read`, REST et GraphQL `createOne`/`findMany`, Hooks
  `create`/`update`/`all`, et `allowWithoutRule` `read`/`write`/`one`/`many`.
- Les commandes de plugin sont séparées en One/Many partout, d'où « donnez à `restoreOne` et
  `restoreMany` la même règle que `delete` ».
- Proposition : un seul vocabulaire, et des groupes de commandes (`softDelete` qui couvre
  One et Many).

2.2 **L'auth exposée deux fois.** [ADR, amende l'ADR-0324]

- Chaque opération d'auth existe aussi sous `/api/operations/<nom>`.
- Le corps de requête et les statuts y sont différents de ceux de `/api/auth`.
- Pour les cacher, il faut étaler trois objets, et cette liste casse dès qu'on change
  d'identifiant.
- Proposition : un propriétaire qui sert ses propres routes n'est pas exposé en plus par défaut ;
  ou `hide: [authPlugin]`.
- Mon avis : priorité haute, chaque application authentifiée est concernée.

2.3 **Exposition écrite par transport, sans lien avec Access.** [ADR]

- On écrit `rest: {…}` puis la même chose en `graphql: {…}`, avec deux `hide`, deux
  `publicWrites` et deux `pagination`.
- Des routes refusées d'office par Access apparaissent quand même dans OpenAPI et dans le schéma
  GraphQL.
- Proposition : une clé `expose` commune aux deux transports, et des options partagées dans
  `apiServer`.

2.4 **Route `POST` morte pour l'utilisateur.** [ADR]

- Avec un identifiant e-mail, la création directe du User échoue toujours, Master compris.
- La route de création générique existe pourtant, et apparaît dans OpenAPI.

## 3. Résultats d'écriture et refus (le plus souvent signalé : trois agents sur quatre)

3.1 **Une écriture autorisée échoue si l'appelant ne peut pas lire le résultat.** [ADR, inv ADR-0306]

- Sans `select: { id: true }`, la création ou la suppression échoue avec `PERMISSION_DENIED`, et
  rien n'est écrit.
- C'est le cas pour les journaux d'audit, les formulaires de contact ou une création par un
  éditeur, en TypeScript comme en REST.
- Proposition : sans `select` explicite, renvoyer `{ id }` au lieu d'échouer, et garder l'échec pour
  un `select` explicite.
- Mon avis : ne fait pas fuiter d'information (on connaît déjà la ligne qu'on vient d'écrire ; Parse
  renvoie `objectId`). Très bon gain.

3.2 **Un refus revient sous quatre formes.** [doc + ADR]

- Selon la façon dont la règle est écrite, le même refus donne `PERMISSION_DENIED`, `[]`/`null`,
  `NOT_FOUND`, ou un `PublicError` en 400.
- À faire tout de suite : une table « refus → résultat » sur la page Access [doc].
- À décider ensuite : un statut 403 pour les refus de politique [ADR].

3.3 **Erreurs de validation non homogènes.** [ADR]

- Les chemins d'issue changent selon l'opération : `['input','code']`,
  `['update',0,'room','value']`, `['endsOn']`.
- Un `PublicError` donne 400, alors que la validation donne 422 avec `issues`, sans moyen de
  fusionner les deux.
- Un UUID mal formé dans un `where` donne un `TypeError`, pas une `VALIDATION_ERROR`.
- Une collision unique dans un upsert donne `VALIDATION_ERROR` au lieu de `UNIQUE_VIOLATION`.
- Proposition : chemins relatifs au champ, `PublicError` avec `issues`, et un garde
  `isFrameworkError(e, code)`.

3.4 **Session expirée indistincte.** [ADR]

- Sur une route de données, une session expirée donne `HTTP_APPLICATION_REJECTED`, le même code
  qu'une mauvaise clé Master.
- Une application cliente ne peut donc pas savoir s'il faut reconnecter l'utilisateur.

## 4. Commandes et formes (cohérence de l'API)

4.1 **Les `*Many` ne ressemblent ni aux `*One` ni à Prisma.** [ADR]

- `updateMany({ data: [{ where, data }] })` et `deleteMany({ where: [...] })` prennent des listes
  de cibles uniques, pas un filtre.
- Leurs résultats par défaut diffèrent : seulement `id` pour les `*Many`, la ligne complète pour
  les `*One`.
- Une cible absente donne `null` pour les `*One`, mais `NOT_FOUND` avec annulation pour les
  `*Many`.
- Il n'existe aucun « mettre à jour ou supprimer tout ce qui correspond à un filtre ».
- Mon avis : la sémantique par élément est voulue (cycle de vie par ligne). Je propose de la
  renommer (`updateEach`) et d'ajouter `updateWhere`/`deleteWhere` filtrés, qui gardent le cycle par
  ligne.

4.2 **Les commandes Soft Delete ont une autre forme que les commandes natives.** [ADR]

- `softDeleteOne({ id })` face à `deleteOne({ where: { id } })`.
- `NOT_FOUND` face à `null`.
- Un filtre pour les `*Many` de Soft Delete, une liste de cibles pour `deleteMany`.

4.3 **Trois formes pour un même lien.** [ADR, revisite l'ADR-0308]

- La lecture renvoie un `Pointer`, le filtre accepte un id ou un `Pointer`, l'écriture exige
  `{ connect: id }`.
- En REST, un pointeur lu sous forme `{ type: 'pointer', … }` ne peut pas être renvoyé tel quel.
- Proposition : accepter un id ou un `Pointer` comme raccourci de `connect`.

4.4 **La corbeille marche à l'inverse pour `readDeleted` et pour Master.** [ADR]

- Un modérateur qui détient `readDeleted` voit les lignes supprimées dans ses lectures ordinaires.
- Master, lui, ne les voit que si son `where` nomme `isDeleted`.
- Proposition : la règle de Master pour tout le monde, plus une option explicite `withDeleted`.

4.5 **Cibler une ligne s'écrit de six façons.** [doc + ADR]

- Les écritures sont `where: { id }`, `where: { id: { eq } }`, `{ id }` au premier niveau,
  `{ id, data }` dans une écriture imbriquée, `item: { id }`…
- Proposition : utiliser partout `where: { id }` dans la doc ; aligner Soft Delete et les écritures
  imbriquées [ADR].

## 5. Typage encore faible

5.1 **Un `default` laisse le champ nullable.** [ADR]

- Le `done: f.boolean({ default: false })` du starter est typé `boolean | null`.
- Prisma le rend non nul.
- Proposition : un `default` rend le champ non nul, sauf `nullable: true` ; un seul mot
  (`required` ou `nullable`) pour les champs stockés et virtuels.
- Mon avis : c'est la première chose qu'un nouveau voit.

5.2 **Les champs virtuels reçoivent `unknown`.** [ADR]

- On écrit `String(item.firstName)`, ce qui donne `'null'` pour une valeur nulle.
- L'exemple `minimal` contient un utilitaire de 24 lignes pour contourner ça.
- Proposition : déclarer les champs virtuels là où les types complets existent déjà, par exemple
  `.with({ virtuals })`.

5.3 **Chaque plugin nomme différemment les entrées de ses fonctions de règle.** [ADR]

- `principal` est au premier niveau dans Access, mais dans `context` pour Hooks, et absent des
  vérifications de schéma de Validation.
- `resolveInput` existe dans ACL et dans Hooks, avec des entrées différentes.
- Un validateur de champ reçoit la valeur en argument direct, un Hook de champ un objet.

5.4 **Une sélection réutilisable exige `as const satisfies Select<…>`.**

- Proposition : un utilitaire `defineSelect`.

## 6. Parcours authentification et rôles

6.1 **Connexion et inscription échouent en `NOT_FOUND`.** [ADR léger]

- Elles échouent tant que le User n'a pas une règle « lire sa propre ligne » écrite à la main.
- Le premier essai d'une application authentifiée tombe donc sur « not found ».
- Proposition :
  - un prédicat `isSelf` ;
  - un diagnostic au démarrage ;
  - un code d'erreur dédié.

6.2 **« Ligne possédée par son auteur » trop verbeuse.** [ADR]

- Il faut environ 12 lignes de règles Access par schéma, et le client doit envoyer son propre id.
- La règle « auteur ou rôle » est impossible à composer.
- Proposition :
  - une valeur par défaut tirée du principal ;
  - un utilitaire `owner(field)` ;
  - `anyOf` qui accepte des filtres.

6.3 **Ajouter un membre à un rôle est réécrit dans quatre exemples.** [ADR]

- La hiérarchie des rôles ne peut pas être déclarée.
- Proposition : commandes de façade `addMembers` et `ensure: { includes }`. Les rôles restent sans
  méthode de persistance.

6.4 **Une seule fonction d'envoi d'e-mail.** [ADR]

- Il y a aujourd'hui quatre fonctions d'envoi et des URL construites à la main.
- Proposition : un seul adaptateur `email.send` avec `kind`.

6.5 **API de session mixte.** [ADR]

- Certaines méthodes prennent le jeton, d'autres exigent `runWithSession`.
- `{ sessions }` d'un côté, un tableau de l'autre.

6.6 **Six façons d'observer un événement.** [ADR]

- Roles et ACL obligent à écrire un plugin brut avec `peers` et `permissions`.
- Proposition : `rolesPlugin({ events })` et `aclPlugin({ events })`, comme auth et hooks.

## 7. Frontière entre application et auteur de plugin

7.1 **Entrée principale de `@ultimabase/core` encombrée.** [ADR]

- Elle exporte 164 valeurs, en majorité de la mécanique d'adaptateur.
- À l'inverse, les tâches courantes d'une application (exécuter un job, agir au nom de quelqu'un)
  passent par `@ultimabase/core/plugin`.
- La frontière est inversée.

7.2 **Agir au nom d'un utilisateur ou de Master.** [ADR]

- Les tests disposent de `t.as` et `t.asMaster`, mais il n'existe pas d'équivalent en production.
- `transaction()` ne prend aucune option, et une transaction imbriquée échoue.
- Proposition : `ultimabase.as()`, `asMaster()` et `transaction(fn, { useMasterKey, retry })`.

7.3 **Deux `defineOperation` sous le même nom.** [ADR]

- L'un vient de `plugin-kit`, pour les applications ; l'autre de `core/plugin`.
- Leurs clés diffèrent : `output` face à `result`, `handler` face à `execute`.
- L'opération d'application ne reçoit pas le `principal`, n'a pas de règle d'accès, et devient
  toujours une mutation GraphQL.

7.4 **Falaise entre `definePlugin` et `plugin()`.** [ADR]

- Dès qu'il faut une règle typée, une entrée de commande, un peer ou des permissions, on passe de
  28 lignes à 116, avec des slots HKT.
- Les validateurs sont écrits à la main, alors que les applications ont Standard Schema.
- Proposition : `definePlugin` plus complet, et Standard Schema partout.

7.5 **Identité des plugins dispersée.** [ADR]

- Trois noms de clé : `id`, `name`, `pluginId`.
- Trois formes de recherche : par fabrique, par chaîne, par constante.
- Des constantes éparses : `postgresPluginName`, `aclPluginId`…

## 8. Tests

8.1 **Pas d'aide JSON ou GraphQL sur `t`.** [ADR léger]

- Chaque exemple réécrit `postJson`, `graphql()`, etc.
- Proposition : `t.json()` et `t.graphql()`.

8.2 **`testApplication` refuse les applications configurées avec `url` ou `pool`.**

8.3 **Configuration Vitest écrite de trois façons.**

- Proposition : `ultimabaseTesting({ env })`.

## 9. Déploiement

9.1 **Aucun chemin supporté pour créer les tables en production.**

- Il n'y a ni première mise en production ni changement de schéma possible sur PostgreSQL, à part
  `override` posé à la main.
- C'est déjà prévu : le plugin de migrations est la suite du plan.

9.2 **Variables d'environnement lues à des moments différents.**

- `DATABASE_URL` est lue au démarrage, `NODE_ENV`, `PORT` et `HOST` à la création.
- Un `dotenv` chargé tard donne ainsi des valeurs de développement avec des identifiants de
  production.

## Recommandation de plan

1. **Corrections immédiates (§0)** : un agent, sans ADR.
2. **ADR « ce que chaque application paie »** : clé Master facultative en interne (1.1), attente de
   l'arrêt (1.2), `use()` qui accepte les presets (1.5), `principal` déduit (1.3), `default` non nul
   (5.1). Ce sont de petits changements, visibles partout.
3. **ADR « résultats et refus »** : `{ id }` par défaut (3.1), auth non exposée deux fois (2.2),
   règle `isSelf` et son diagnostic (6.1), session expirée identifiable (3.4).
4. **ADR « vocabulaire et exposition »** : un seul vocabulaire d'opérations (2.1), `expose` commun
   (2.3), commandes alignées (4.1, 4.2, 4.5), corbeille (4.4). C'est le chantier le plus lourd ;
   je propose un spike avant l'ADR.
5. **Ensuite, selon tes priorités** :
   - typage des champs virtuels (5.2) ;
   - frontière entre application et plugin (7.x) ;
   - parcours auth et rôles (6.x) ;
   - tests (8.x) ;
   - migrations (9.1, déjà prévues).

Les points 2 et 3 donnent le plus de gain visible pour un coût raisonnable. Le point 4 change
beaucoup de surface : à faire avant la publication, mais en connaissance de cause.
