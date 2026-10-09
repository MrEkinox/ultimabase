# Contrat des adaptateurs de base de données (2026-10-09)

Décisions tirées de [l'audit des adaptateurs](../audit-adaptateurs-base.md)
(MongoDB comme cas d'épreuve), validées par l'utilisateur le 2026-10-09. Core
et les plugins officiels ne contiennent pas de code PostgreSQL ; le problème
est un contrat sémantique que seul PostgreSQL fournit aujourd'hui et que rien
n'écrit ni ne teste.

## À faire avant la migration de Core (un ADR par point)

1. **Intégrité des pointeurs** : Core écrit le contrat de `onDelete`
   (`restrict`, `cascade`, `setNull`, références du stockage privé), y compris
   sous écritures concurrentes ; chaque adaptateur l'applique (clés
   étrangères pour PostgreSQL, logique transactionnelle pour MongoDB) ; tests
   de conformance, concurrence comprise. Documenter qu'une cascade est
   physique (ni hooks, ni Access, ni Soft Delete sur les enfants).
2. **Rejeu des transactions automatiques** : quelques nouvelles tentatives
   bornées sur erreur temporaire (conflits MongoDB, interblocages et conflits
   de sérialisation PostgreSQL). Règle : un hook transactionnel n'a pas
   d'effet extérieur (il peut être rejoué) ; les effets extérieurs vont dans
   `afterCommit`.
3. **Opérateurs** : retrait de `jsonPathExists`, `jsonPathMatches` et
   `containedBy` de l'API publique (ADR-0288) ; chaque adaptateur déclare les
   opérateurs qu'il exécute ; un opérateur non supporté est signalé au
   démarrage quand c'est possible, sinon par une erreur publique claire (plus
   d'erreur interne en cours de requête).
4. **Erreurs et règles écrites** : erreur neutre « valeur unique déjà
   utilisée » produite par chaque adaptateur (Password Auth ne s'appuie plus
   sur la classe d'erreur PostgreSQL) ; plusieurs `null` autorisés dans un
   index unique ; ordre des `null` en tri, dialecte des expressions
   régulières, égalité sur les listes, isolation minimale, précision des
   décimaux.
5. **Index partiels dans Core** (`indexes: [{ …, where }]`, sous-ensemble
   d'opérateurs portable) et **`ultimabase.health()` neutre** interrogeant
   l'adaptateur. Corrige la décision 5 (index partiels) et la décision 10
   (`ping()`) de la revue PostgreSQL, et la décision 7 de la revue Soft
   Delete.

Confirmé dans le plugin PostgreSQL : `snake_case`, `schemaPolicy`,
`DATABASE_URL`, réglages de connexion et de débogage ; remplissage de l'ACL
des lignes existantes à condition que la valeur arrive par une métadonnée
neutre du champ ; sémantique `RETURNING` d'Access implémentée de façon neutre
par Core (vérification dans la transaction).

## Peut attendre le début du chantier MongoDB

Suite de conformance paramétrée par une fabrique d'adaptateur (extraite des
tests e2e PostgreSQL ; deux adaptateurs la justifieront), kit pour auteurs
d'adaptateurs, inclusion de repli dans Core, séparation de pg-vector en un
plugin `vector` neutre et une implémentation par adaptateur (point
d'extension d'adaptateur, ADR ; tranche la décision 4 de la revue pg-vector),
`renamedFrom` neutre.
