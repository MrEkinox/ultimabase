# Migration, sous-étape 6.3 : ACL et Roles (ADR-0321, ADR-0322)

Branche `migration/acl-roles` (worktree `../ub-step6-3`), basée sur `main`
local a0d7ff3c (fusion de 6.2). En parallèle : 6.6a (socle HTTP et Hono) dans
`../ub-step6-6a` ; ce travail ne touche `packages/http-plugin` et
`packages/server-hono-plugin` qu'au niveau des imports si nécessaire.

## Portée

ADR-0321 (décisions 1 à 9) et ADR-0322 (décisions 1 à 5), conséquences
comprises : `.acl()` par l'emplacement `SchemaFieldsHKT`, règles
`.with({ acl })` (`default` obligatoire, `existingRows`, `clientSharing`),
`new ACL(principal)` et groupe `'write'`, ACL explicite de Master sans
`resolveInput`, `grant`/`revoke` atomiques, `select: { acl }`, `entries()`,
rattrapage à l'activation dans la synchronisation PostgreSQL ;
`App.RoleSchema.define` en forme D, plusieurs schémas de rôles, fin du
contournement `Register` de l'étape 4, `includedRoles`, `has`/`current`,
`ensure`. Exemples, gabarits create-app et documentation.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Implémentation terminée (16 commits `wip(acl-roles)` depuis a0d7ff3c). Tests
ciblés, `yarn lint` (0 erreur), `yarn format:check` et `yarn constraints`
passent. Reste : porte complète, audit DX, banc forme D, rapport.

## Décisions prises (non fixées par les ADR, à confirmer)

- Core gagne des points d'extension génériques : `SchemaFactoriesHKT`,
  `provideSchemaFactories`, `SchemaFactoryShape` (les statiques d'une fabrique
  restent visibles sur les classes nommées par Typegen), la phase de cycle de
  vie `ready` (après `started`, requêtes permises, son échec fait échouer
  `start()`), `FieldUpdateInputCarrier` et les métadonnées neutres de champ de
  plugin (`snapshotUpdateInput`, `existingRows`, `storageDefault`), la `reason`
  d'un refus de politique protégée, `shape` dans `SchemaRulesHKT`, et
  `ConfiguredApplicationFactory` (garde le nom d'interface
  `ConfiguredUltimaBaseFactory` dans les survols quand aucune fabrique).
- `acl.default` est aussi exigé à l'exécution ; l'ancienne forme
  `define({ acl })` reste acceptée à l'exécution mais n'est plus typée.
- `grant`/`revoke` : transformation côté serveur de la ligne verrouillée
  `FOR UPDATE` dans la transaction de mise à jour ; principal uniquement ;
  `revoke` sans `permissions` retire tous les droits ; refusés en
  `updateMany` ensembliste et `upsert`.
- `resolveInput` recalcule à la création et à chaque mise à jour singulière
  sans ACL explicite (`inputAcl` retiré de son entrée) ; un schéma avec
  `resolveInput` refuse `updateMany` ensembliste ; l'ACL explicite de Master
  contourne `resolveInput`.
- `clientSharing` remplace le droit `update` pour une mise à jour qui ne fait
  que partager ; l'appelant doit pouvoir lire la ligne et ne donne jamais un
  droit qu'il n'a pas.
- `select: { acl: true }` par un client : refus si pas de `clientSharing`
  (politique avec `reason`), échec de toute la lecture si une ligne n'est pas
  partageable.
- `entries()` : principaux depuis les Pointers retenus ou un registre des
  schémas de l'application initialisée ; noms de rôles par
  `resolveRoleReference(entry.role)` (registre de Roles).
- `current(schema)` renvoie des noms triés ; `has(role)` sans `principal` exige
  une requête (`MISSING_EXECUTION_CONTEXT` sinon).
- `ensure` passe par la phase `ready` avec l'autorité Master de
  l'application ; un `ensure` concurrent tolère `UNIQUE_VIOLATION`.
- Champs réservés d'un schéma de rôles : `name`, `members`, `includedRoles` ;
  `resolveCurrent` devient une option de premier niveau.
- La colonne `acl` garde l'ACL vide comme valeur par défaut de stockage ; les
  champs de plugin requis différés sont `NOT NULL` dans PostgreSQL.
- Contournement `Register` conservé dans `examples/minimal` (callback `where`
  de relation `ExampleArticle.reviewers`), le harnais de la page d'accueil du
  site et les sondes Typegen (règles Access de l'ancienne forme) ; note
  ajoutée à la section étape 4 de l'ADR-0297.
- create-app : une application qui mélange des `define(...)` non terminés
  (sans `.with`) et des déclarations terminées ne peut pas nommer
  `typeof ultimabase` dans `Register` dès qu'un plugin est installé (TS7022,
  déjà vrai sur a0d7ff3c avec ACL). Avec Roles ou ACL, `Task` et `Member`
  se terminent donc par `.with(...)`, qui reçoit leurs règles (`access`,
  `acl`, `rest`, `graphql`). Trouvé par `create-app-packed` (projet Roles
  seul : `npm run build` échouait), corrigé et vérifié en construisant sept
  combinaisons générées.
- `ensure` retiré des exemples minimal et todo-backend (il cassait le test
  e2e vertical REST qui suppose une table vide).

## Approches rejetées

- Recalcul de l'ACL dans `preparedOperation` : impossible d'ajouter une
  opération (« must preserve the normalized update shape ») ; déplacé dans le
  comportement `transformPreparedInput`.
- Faire confiance à une instance ACL déjà acceptée : trou de sécurité
  (réutilisation) ; seules des copies fraîches (`ACL.fromJSON`) sont marquées.
- Retirer `acl` d'un résultat sélectionné : cassait la validation de
  projection ; on refuse `PERMISSION_DENIED`.
- `Readonly<TCustomFields> & Readonly<{…}>` puis un type mappé seul pour les
  champs de rôle : TS7022 dans les paquets construits ; `extends infer`
  résout (TS6/TS7, sources et construit).

## Preuves

(remplies par la porte finale ci-dessous)

## Prochaine action vérifiable

Porte finale : `yarn validate:full`, `yarn test:e2e:built`,
`yarn website:test`, audit DX contre a0d7ff3c, banc forme D.
