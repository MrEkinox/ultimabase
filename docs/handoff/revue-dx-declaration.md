# Revue DX : préparer un projet et parler aux plugins (2026-10-16)

Cette revue complète `revue-dx.md`. Deux audits en lecture seule ont été menés sur `main` 41cae632,
avec des expériences de typage faites dans un dossier à part, sous TypeScript 6.0.3 et 7.0.2 :

- la préparation d'un projet UltimaBase ;
- l'endroit où l'on configure un plugin dans un schéma.

Les affirmations marquées « vérifié » ont été contrôlées dans le code ou par une expérience.

## Partie 1 : où parler à un plugin dans un schéma

### Le constat de départ

On configure aujourd'hui un plugin à quatre endroits :

- dans `define` ;
- sur un champ ;
- par une méthode chaînée comme `.softDelete()` ou `.acl()` ;
- dans `.with({ … })`.

La question est de savoir ce qui est imposé par TypeScript et ce qui est arbitraire.

### Ce qui impose un emplacement (vérifié)

1. **Changer les types oblige à passer par un appel générique placé avant `.with`**, c'est-à-dire
   `define` ou une méthode comme `.softDelete()`. `.with` n'est pas générique, donc il ne peut pas
   ajouter de champs ni de commandes (ADR-0297).
2. **Lire le schéma complet oblige à passer par `.with`, en dernier.** C'est le cas dès qu'un
   réglage lit le registre, les commandes ajoutées par un plugin, d'autres schémas ou les cibles de
   relation. Même un réglage purement statique comme `rest: { softDeleteOne: true }`, une fois typé
   contre le schéma dans un appel générique, provoque un cycle (TS7022) sous TS 6 comme sous TS 7.
3. **Un réglage qui ne lit que ses propres données n'est contraint nulle part.** Ce sont les
   valeurs statiques, ou un callback qui ne lit que la ligne du schéma lui-même.

### Ta remarque sur `rest`

Elle est à moitié juste :

- les clés natives (`createOne: false`), `typeName` et `postgres.table` sont statiques et
  **pourraient** aller dans `define` ;
- les clés de commandes de plugin (`softDeleteOne: true`) dépendent de ce que `.softDelete()`
  ajoute **après** `define`, et ne peuvent donc pas y aller.

Déplacer seulement les clés natives couperait la configuration REST en deux endroits, ce qui serait
pire.

### Les vraies incohérences

1. **Les options de fonctionnalité sont réparties sans logique.** `.softDelete({ mode })` prend
   son option dans la méthode. `.acl()` n'en prend aucune : tout passe par `.with({ acl })`, y
   compris des réglages purement statiques (`limits`, `existingRows`, `clientSharing`). Cette
   différence s'explique seulement par l'historique : Soft Delete a été le premier plugin de
   l'ADR-0316, et ACL est arrivé ensuite.
2. **`.acl()` sans `.with({ acl: { default } })` compile**, puis échoue au démarrage. Un réglage
   obligatoire est séparé de l'interrupteur qui l'exige.
3. **`indexes` existe à deux endroits, avec deux pouvoirs différents.**
   - Dans `define` : sur les champs déclarés, et un index unique devient une cible d'`updateOne`.
   - Dans `.with` : sur les champs ajoutés par un plugin, index partiels permis, stockage seulement.
   - Un index unique ordinaire écrit dans `.with` compile sans rien dire, et n'est pas une cible.
     C'est le piège le plus probable.
4. **Les fabriques Roles et Auth font exception.**
   - `RoleSchema.define` porte des options de plugin (`ensure`, `deletion`, `resolveCurrent`), seul
     cas de ce genre.
   - `UserSchema.define` et `RoleSchema.define` n'acceptent pas `indexes`, probablement un oubli.
5. **Un même plugin intervient à deux niveaux.** Au niveau du champ dans `define` (`access`,
   `hooks`, `validation`, `postgres`) et au niveau du schéma dans `.with`. C'est permis parce que
   l'option de champ ne lit que la valeur du champ. C'est cohérent, mais jamais énoncé comme règle.
6. **`.with` mélange des clés de Core (`indexes`, `relations`) et des clés de plugins.**
7. **Les noms ne se répondent pas entre défaut global et réglage par schéma.** On a
   `restPlugin({ default })` face à `.with({ rest })`, et `accessPlugin({ allowWithoutRule })` face
   à `.with({ access })`.

### Les modèles comparés

| Modèle | Règle                                                                                                                                                                     | Faisable ?                                    | Coût                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | « `define` décrit tes données ; une méthode comme `.softDelete()` ou `.acl()` active une fonctionnalité ; tout réglage va dans `.with({…})`, sous le nom de son plugin. » | Oui, et trivial : `mode` ne change aucun type | ~20 fichiers pour `.softDelete({ mode })` ; plugin-kit ; un ADR qui remplace la §7 de l'ADR-0316                                                                        |
| B      | Tout dans `.with`, y compris les fonctionnalités qui changent la forme                                                                                                    | **Non** : provoque des cycles de typage       | —                                                                                                                                                                       |
| C      | La configuration des plugins dans `define`, et `.with` seulement pour ce qui référence d'autres schémas                                                                   | Partiellement                                 | La configuration REST et GraphQL serait coupée en deux ; réintroduit les options de plugin dans `define`, que l'ADR-0316 avait retirées pour des raisons de performance |
| A3     | Une méthode prend toute sa configuration (`.acl({ default, limits })`)                                                                                                    | Faisable pour ACL                             | Les callbacks verraient le schéma dans une méthode, ce qui casse un invariant, et l'exception revient dès qu'un réglage a besoin des commandes                          |

### Recommandation : le modèle A

C'est le seul modèle où l'emplacement ne dépend jamais d'une subtilité de types invisible pour le
développeur. La règle à retenir :

> **`define` décrit les données, une méthode active une fonctionnalité, et tout réglage va dans
> `.with({ … })` sous le nom de son plugin.**

Deux sous-règles subsistent, toutes deux imposées par les types et faciles à énoncer :

- une option qui concerne un seul champ se met sur ce champ ;
- un index destiné à servir de cible se met dans `define` ; un index partiel ou portant sur un
  champ de plugin se met dans `.with`.

Changements nécessaires :

1. `.softDelete({ mode })` devient `.softDelete().with({ softDelete: { mode } })`, et plugin-kit
   gagne des règles conditionnées par une méthode. Il faut un ADR et le banc de la forme D, car la
   marge de TS 6 est faible.
2. **Fermer le piège des index** : refuser un index unique ordinaire dans `.with`, au démarrage au
   minimum, dans les types si possible, avec un message qui renvoie vers `define`.
3. **Faire échouer `.acl()` sans `default` avant l'exécution**, ce qui demande une expérience
   (risque de cycle avec `Register`) ; ou au minimum un message clair.
4. **Uniformiser Roles et Auth** :
   - `UserSchema.define` et `RoleSchema.define` acceptent `indexes` ;
   - `ensure`, `deletion` et `resolveCurrent` passent dans `.with({ roles: … })`, ou sont documentés
     comme l'exception de la fabrique.
5. **Une table « Où ça va ? »** sur la page Schemas et dans le guide de création de plugin.

## Partie 2 : préparer un projet

### Le parcours aujourd'hui

| Étape                                             | Concepts | Lignes | Paquets `@ultimabase` |
| ------------------------------------------------- | -------- | ------ | --------------------- |
| Installation manuelle, premier schéma qui compile | 4        | ~10    | 1                     |
| Installation manuelle, première écriture en base  | +6       | ~38    | 2                     |
| `create-app`, première requête HTTP servie        | ~12      | ~57    | 7 + testing           |

Pour comparer :

- avec Parse Server, un seul `new ParseServer({…})` ; ici, trois phases dans trois fichiers ;
- avec Prisma, on gagne l'absence d'étape de génération, mais on ajoute la séparation entre la
  fabrique et l'instance, et le bloc `Register`.

### Constats

1. **Quatre structures de projet sont enseignées**, et la vraie raison de découper n'est jamais
   donnée. Vérifié :
   - un seul fichier fonctionne pour les types ;
   - mais dès que des schémas cycliques sont répartis dans plusieurs fichiers, la fabrique doit
     vivre dans un module qui n'importe aucun schéma. Sinon l'ordre d'évaluation ESM donne
     « Cannot access 'SchemaApplication' before initialization ».
   - `create-app` met la fabrique dans `schema.ts`, ce qui crée ce piège dès qu'on sépare les
     schémas.
2. **Trois phases, et une quatrième cachée.**
   - Les trois phases sont imposées : les plugins, puis les schémas, puis l'instance.
   - La quatrième, `new (App.use(pluginLocal))({…})` pour un plugin qui référence un schéma,
     n'est expliquée nulle part.
   - Les noms changent d'un endroit à l'autre : `App`, `SchemaApplication`, `Application`,
     `MinimalSchemaApplication` pour la fabrique ; `ultimabase`, `application`, `app` pour
     l'instance. `App` (la fabrique) et `app` (l'instance) se confondent.
3. **Un oubli dans `schemas: [...]` ne donne aucune erreur de type.** Vérifié :
   - la cible d'une relation absente de la liste n'est détectée qu'à l'exécution ;
   - un User de plugin déclaré mais non enregistré non plus ;
   - un schéma déclaré sur une fabrique avec Hooks, mais enregistré dans une application sans
     Hooks, non plus. La doc affirme pourtant le contraire (`overview.mdx`).
   - Une faute dans `mappedBy` est signalée sur la ligne `new App`, par un TS2719 de
     400 caractères.
   - Proposition : étendre les vérifications d'enregistrement [ADR], à mesurer au banc.
4. **`Register`** est imposé (ADR-0297). On le garde. En revanche :
   - la clé `principal` n'est documentée nulle part ;
   - avec l'auth, le principal reste non typé ;
   - le message d'erreur en cas d'oubli est noyé dans un TS2345.
5. **Paquets.**
   - **Core est une dépendance normale des plugins, pas une `peerDependency`.** Après
     publication, des versions différentes installeraient deux copies de Core : deux classes
     `UltimaBase`, deux verrous « une application par realm », un `Register` partagé à moitié. Ça
     contredit aussi la décision 3 de l'ADR-0338. **À corriger avant toute publication.**
   - `api-server` installe toute la pile GraphQL même pour un projet REST seulement : il faudrait
     des peers optionnels.
   - `auth-plugin` dépend de `http-plugin` même sans HTTP.
   - Deux règles d'installation coexistent : `create-app` ajoute http, rest et hono à côté
     d'`api-server`, les exemples non.
   - L'ordre des plugins dans `use()` n'a pas d'importance, puisque Core trie selon les
     dépendances. La doc ne le dit jamais clairement.
6. **Options globales et options par schéma.**
   - REST et GraphQL demandent chacun les mêmes `default`, `publicWrites` et `hide`.
   - Ajouter l'auth oblige à modifier la configuration d'autres plugins : `hide` en REST et en
     GraphQL, `rest: false` et `graphql: false` sur le User.
   - Master se configure à deux endroits : `httpPlugin({ master: true })` et
     `new App({ masterAuthority })`.
   - Les commandes Soft Delete s'activent trois fois : dans access, rest et graphql.
7. **Variables d'environnement lues à trois moments différents** : `NODE_ENV`, `PORT` et `HOST` à
   l'import, `DATABASE_URL` au démarrage, la clé Master à l'import dans le code utilisateur. Un
   `PORT` invalide fait même échouer l'import.
8. **Démarrage et arrêt.**
   - `await using` au niveau du module ferme l'application tout de suite, d'où la boucle sur les
     signaux recopiée 15 fois.
   - Sans plugin de base de données, `start()` réussit en silence, puis chaque opération répond
     « must be started » (lu dans le code, pas exécuté).
   - L'option racine `access` est acceptée mais ignorée : une option morte, alors que la doc promet
     un `TypeError` pour toute option inconnue.
9. **Ajouter un plugin après coup** demande peu de modifications pour Hooks (un fichier). Pour
   l'auth avec REST, il faut 2 fichiers et 4 imports. Pour ACL ou Roles, il faut toucher
   `.env`, la configuration Vitest et `main.ts`.

### Structure de projet recommandée

```
src/app.ts            export const App = UltimaBase.use(...plugins)   // n'importe aucun schéma
src/schemas/task.ts   export const Task = App.Schema.define({…}).with({…})
src/schemas/user.ts   export const User = App.UserSchema.define({…})
src/ultimabase.ts     export const ultimabase = new App({ schemas: [Task, User] })
                      // les plugins locaux qui référencent un schéma : new (App.use(pluginLocal))({…})
                      declare module '@ultimabase/core' { interface Register { readonly app: typeof ultimabase } }
src/main.ts           démarrage et maintien en vie
```

La règle à énoncer une fois dans la doc :

> **Les plugins, puis les schémas, puis l'instance ; `app.ts` n'importe aucun schéma.**

Deux alternatives sont écartées :

- la collecte automatique des schémas, interdite par l'ADR-0279 ;
- un objet de configuration unique, impossible puisque les schémas ont besoin de la fabrique déjà
  typée par les plugins.

Une option reste possible, `schemas` qui accepte un objet de module (`import * as schemas`). Elle
demanderait un ADR, pour un petit gain.

## Synthèse des décisions à prendre

| Sujet                                                               | Type                                                    | Priorité              |
| ------------------------------------------------------------------- | ------------------------------------------------------- | --------------------- |
| Core en `peerDependency` (et peers optionnels d'`api-server`)       | correction d'empaquetage, déjà impliquée par l'ADR-0338 | **avant publication** |
| Modèle A pour la configuration des plugins                          | ADR                                                     | haute                 |
| Piège des index dans `.with`                                        | ADR                                                     | haute                 |
| Structure de projet unique et noms uniques (`App`, `ultimabase`)    | doc, `create-app`, exemples                             | haute, sans ADR       |
| Vérifications d'enregistrement (cibles, plugins, `principal`)       | ADR, avec banc                                          | moyenne               |
| Option racine `access` morte                                        | correction de bug, à confirmer                          | facile                |
| Erreur claire sans base de données                                  | petit ADR                                               | facile                |
| Roles et Auth : `indexes`, `ensure` et autres options               | ADR                                                     | moyenne               |
| Les éléments communs avec `revue-dx.md` (Master, arrêt, exposition) | voir cette revue                                        | —                     |
