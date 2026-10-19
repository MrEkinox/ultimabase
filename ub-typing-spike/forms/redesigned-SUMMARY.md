# Famille « classes repensées » (en-tête = données, corps = règles) — synthèse

Formes : [G](g-class/RESULTS.md), [G′ `Self`](g-self/RESULTS.md), [G + getters](g-class-getters/RESULTS.md).
Aucune mesure de temps (indicatif unique à 10 schémas : 40–42 k instanciations, check 0,36–0,37 s).

## Écart commun avec la spécification

`static access = this.access({...})` **ne compile pas** (`g-class/micro/m1.ts`) : TS4114 (`override`),
TS7022 et TS2729 (`this.access` désigne le membre statique en cours d'initialisation) ; avec
`super.access` : TS2417 (la déclaration n'est pas la méthode de base). Les trois formes utilisent donc
`static access = this.rules.access({...})` : `this.rules.` liste exactement les règles des plugins
installés. Dans un initialiseur statique, `this` est le type de base, jamais `typeof Todo` (`micro/m2.ts`).

## Comparaison

| Critère | G | G′ (`App.Schema<Todo>()(…)`) | G + getters |
| --- | --- | --- | --- |
| Compilation fixture | 0 erreur (avec et sans `Register`) | 0 erreur, sans registre, **pas de TS2506/TS7022** | 0 erreur (avec et sans `Register`) |
| 8 fautes sur la ligne | 7/8 (`mappedBy` à l'enregistrement) | 7/8 | 7/8 |
| Message le plus long des 7 « ligne » | 334 (6a) avec registre ; 391 sans | **165** | comme G |
| `where` / croisé / `item` | 38 / 42 / 22 avec registre ; **750 / 47 / 440 sans** | **36 / 40 / 22** (`WhereBuilder<Todo>`, `item: Todo`) | comme G |
| `this.rules.access(` | 80 avec registre ; 787 sans | **78** | comme G |
| Lignes de configuration | `field` + `Register` (5 lignes, facultatif) | `field` seulement | comme G |
| Nom écrit par déclaration | 2 | 3 (`class Todo`, `<Todo>`, `'Todo'`) | 2 |
| Erreurs propres | — | oubli de `<Todo>` signalé sur l'en-tête ; mauvaise classe : erreurs trompeuses dans les règles, vraie cause à l'enregistrement | faute dans un getter nu : TS2506 trompeur (11 diag.) ; `ReferenceError` à l'import si un runtime décompose les champs |
| JavaScript vérifié | oui (règles typées, fautes sur la ligne) | **non** (pas d'argument de type explicite en JS) | non mesuré |
| `isolatedDeclarations` | Core/plugins OK ; fixture : TS9021 ×14, TS9012 ×7, TS9010 ×8, TS9019 ×1 | idem | TS9021 ×12, reste idem |
| Fabrique (auteur de plugin) | 45 lignes | 50 (niveau `Self` + contrôle d'oubli) | 45 + obligation de getters |
| Générateur 10/50 | 0 erreur (± registre) | 0 erreur | 0 erreur (± registre) |

Points communs : modèle = type d'instance (`findOne` → `Todo | null`, `signUp` → `TodoUser`), règles
inertes lues sur les membres statiques à l'enregistrement (exécution prouvée en chargeant la fixture TS
dans Node 24), méthodes statiques et d'instance du corps refusées à l'enregistrement (type et exécution),
cardinalité « exactement un » des fabriques vérifiée à l'enregistrement, options d'en-tête typées
(`softDelete` ajoute `isDeleted`, index `postgres` typés par les champs).

## Lecture

- **G′ donne les meilleures infobulles et messages de la famille sans aucune déclaration de module**,
  au prix d'une syntaxe curryfiée, du nom écrit trois fois, de l'abandon de `checkJs` et d'un diagnostic
  de mauvais `Self` tardif.
- **G** égale G′ seulement avec le `Register` d'application, dont l'oubli est silencieux ; sans lui, les
  infobulles locales sont les plus longues mesurées (750 / 440). Le registre impose un invariant de Core
  (méthodes de règle construites par Core, paramètre paresseux) : un plugin qui écrit sa propre méthode
  rend le registre cyclique (TS2502/TS2456/TS2506 mesurés).
- **Getters** : aucun gain de typage sur les thunks ici, +3 lignes par relation, un piège d'exécution et
  un cas d'erreur trompeur : à écarter.
- Dans les trois formes, la convention « nom du membre statique = nom de la règle » n'est pas vérifiable
  sur la ligne : une faute dans le nom du statique (`static acess`) n'est vue qu'à `new App(...)`.
