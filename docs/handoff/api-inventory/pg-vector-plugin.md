# Fiche : `@ultimabase/pg-vector-plugin`

Sources : `packages/pg-vector-plugin/README.md`, `src/index.ts` (249 lignes,
un seul fichier). Sonde : `probe/vector.ts` contre PostgreSQL 17 (Docker).

## 1. Rôle et installation

Ajoute la méthode de champ `field.vector({ dimensions })` (valeur
`readonly number[]` de longueur fixe, nombres finis), son plan de validation
et un codec GraphQL JSON. Aucune option de plugin.

```ts
const Application = UltimaBase.use(pgVectorPlugin())
const Doc = Application.Schema.define({
	className: 'Doc',
	fields: (field) => ({ embedding: field.vector({ dimensions: 1536 }) }),
})
```

Le nom (« pg-vector ») promet le stockage pgvector ; le README précise
pourtant : « No PostgreSQL column compiler is shipped… cannot persist vector
fields yet ». Pas de codec REST, pas d'opérateur de similarité, pas d'index.

## 2. Ce qu'il apporte

- Méthode `field.vector` typée depuis la source (sans Typegen).
- Validation structurelle (dimension, nombres finis) ; validateur Standard
  Schema possible via `validation`.
- Codec GraphQL (`ultimabase.graphql.field@1.0.0`, JSON).
- Champs stockés uniquement (pas d'objet imbriqué ni de sortie virtuelle).

## 3. API pour le développeur

Seulement la déclaration ci-dessus. Aucune requête vectorielle
(`orderBy: { embedding: { nearest: [...] } }` ou équivalent) n'existe.

## 4. Frictions mesurées

| Mesure (`probe/vector.ts`)                         | Résultat                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pgVectorPlugin()` + `postgresPlugin()`, `start()` | `No PostgreSQL field compiler is registered for kind: pg-vector.vector`            |
| + `restPlugin()` + `httpPlugin()`                  | `Doc.fields.embedding requires an exact REST v1 field codec before route exposure` |

Le plugin ne peut donc être utilisé dans **aucune** application persistée
aujourd'hui. `create-app` le propose quand même dans sa liste de plugins
(le README de `create-app` précise que le starter « does not persist
vectors »).

## 5. Dépendances à Typegen

Aucune pour la déclaration (projection depuis la fabrique). Les filtres
générés sur un champ de plugin se limitent à `eq`/`ne`/`in`/`notIn`/null
(README Typegen) : une recherche par similarité ne pourrait pas être typée par
le mécanisme actuel sans travail supplémentaire.

## 6. Propositions

1. **Livrer le stockage** (colonne `vector(n)`, extension `CREATE EXTENSION
vector` vérifiée au démarrage) et le codec REST, ou **retirer le plugin du
   catalogue `create-app` et de la liste officielle** jusqu'à ce qu'il soit
   utilisable. Le volet « champs apportés par un plugin » du plan peut s'en
   servir comme cas d'étude, mais pas comme fonctionnalité annoncée.
2. **Opérateur de requête fourni par le plugin** (distance cosinus/L2,
   `nearest` avec `limit`) : c'est le cas réel qui teste la forme cible des
   « opérateurs `where` des champs personnalisés » mentionnés en phase 4 du
   plan.
3. **Codecs de transport fournis par le plugin** pour REST et GraphQL, comme
   ACL le fait déjà, sans dépendre des packages de transport.
4. **Nommage** : si le plugin reste purement logique, `vector-field-plugin` ;
   s'il stocke, garder `pg-vector-plugin` et dépendre de `postgres-plugin`
   par capacité.

## 7. Note sur la grille

| Critère                | Note actuelle                                                            |
| ---------------------- | ------------------------------------------------------------------------ |
| Sans génération        | Conforme pour la déclaration.                                            |
| Colocalisation         | Bonne (champ dans le schéma).                                            |
| Concision              | Bonne (1 ligne).                                                         |
| Une forme par concept  | Conforme.                                                                |
| Révélation progressive | Sans objet : inutilisable avec PostgreSQL ou REST.                       |
| Erreurs                | Claires (nom du kind, nom du champ), mais au démarrage seulement.        |
| Hovers                 | Non mesuré (le README renvoie à un test de language service Typegen).    |
| Performance TypeScript | Non mesuré.                                                              |
| JavaScript             | Conforme.                                                                |
| Coût de migration      | Faible (1 package) ; le stockage est un travail neuf, pas une migration. |
