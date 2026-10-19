# N — un seul `define`, règles en méthodes qui utilisent `this` (2026-10-09)

Code : `lib/` (copie de `forms/a-prime/lib`, règles déplacées dans `define`), `fixture/`,
`tools/probe.mjs`, `probe-results.md`, preuves des tentatives dans `attempts/`.

**Verdict : la forme rêvée (retours exacts vérifiés sur la ligne) est impossible avec des filtres
croisés dans les deux sens ; la meilleure variante compile le fixture mais perd la vérification des
retours sur la ligne, les infobulles courtes, et échoue à partir de ~25 schémas chaînés (TS2589).**

## 1. Forme (variante finale, celle mesurée ci-dessous)

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({ /* identique à A′ */ assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }) }),
	access: {
		read() { return this.where.eq('archived', false) },
		update() { return this.where.is('assignee', (user) => user.eq('id', this.userId)) },
		delete() { return { assignee: { is: { email: { endsWith: '@admin.test' } } } } },
	},
	acl: { default() { return ACL.none().grantRole('TodoRole', 'read', 'update') } },
	hooks: { beforeUpdate() { if (this.item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
	postgres: { table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] },
})
```

Écarts imposés : (1) **pas de ligne `Register`** (voir §2) ; (2) le hook de champ devient une option
de champ : `displayName: field.string({ required: true, resolveInput() { return this.value.trim() } })`
(slot générique `FieldOptionsHKT` ajouté à Core) ; (3) les plugins déclarent `this` dans leurs types
(`read?: (this: AccessFilterContext<S>) => AccessFilterResult<S>`).

## 2. Compilation : tentatives (toutes dans `attempts/`)

| Tentative | Résultat |
| --- | --- |
| Spec, retours exacts, avec `Register` | 62 erreurs : **TS2456** dans Core (`RegisteredList`, `RegisteredNames` « circularly references itself »), TS7022 ×4, TS2502 (`n2-exact-with-register.txt`) : le type des règles est instancié pendant le typage de la constante, donc lit le registre (E10) |
| Retours exacts, sans `Register` | Repro minimale `repro-exact-both-directions/` : `B1.update → B2` et `B2.read → B1` → TS7022 sur `B1`/`B2`, TS7023 ×4, TS7024, TS2615 ; un seul sens : 0 erreur. Sur le fixture final (`n5-exact-final-fixture.txt`) : 23 erreurs, `Todo` réduit à `{ assignee: unknown } & { isDeleted }` (inférence effondrée, cascade) |
| Options de forme en `& TShape` nu | les règles ne voient pas `isDeleted` : `TShape` figé à sa valeur par défaut avant le typage des méthodes (`micro/m2.ts` F/G) ; corrigé par un type mappé homomorphe `ShapeParams<TShape>` (`micro/m3.ts` F6, `m4.ts`) |
| Hooks de champ `hooks: { fields: { displayName: { resolveInput() {…} } } }` | **aucun type contextuel** : `Property 'value' does not exist on type '{ resolveInput(): any; }'` (TS2339) ; un type mappé dont les clés viennent des champs en cours d'inférence ne type pas `this` (`micro/m5.ts` C ; A ne marche que sur le paramètre de type nu, inaccessible aux plugins) |
| **Méthodes à retour `void` dans `define` (`Loosen`) + contrôle exact à l'enregistrement, sans `Register`** | **fixture : 0 erreur** (`./tsc -p forms/n-this-methods/fixture`), 11 assertions, 8 `@ts-expect-error` effectifs |
| Même chose avec `Register` | **plantage de tsc 6.0.3** : `Error: Debug Failure. … Parameter symbol already has a cached type which differs from newly assigned type` dans `assignContextualParameterTypes` (`n4-loose-with-register.txt`) |
| Variante finale, anneau généré (`gen.mjs`) | 10, 15, 20 : 0 erreur ; **25, 30, 40, 50 : TS2589** (`Type instantiation is excessively deep`) ×17 + 1 TS2322 par schéma (`ring50/`) ; sans le filtre croisé : 0 erreur à 50 |

Explication commune : une méthode qui utilise `this` est sensible au contexte ; pendant l'appel
générique, TypeScript infère son type de retour **depuis le corps** (même si la cible est `void`),
donc typer `S0` type `S1`, puis `S2`… le long des filtres croisés. Un cycle à deux donne TS7022
(retours exacts) ; une longue chaîne dépasse la profondeur d'instanciation (TS2589).

## 3. Les 8 fautes (variante finale)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) |
| 2 | `this.where.eq('archivd')` | oui | oui | 1 | `…parameter of type 'ScalarKeys<RulesSchema<"Todo", { readonly title: … }>>'` (375) |
| 3 | `emial` (objet retourné) | oui | **non** (`ultimabase.ts:9`) | 1 | TS2322 (1 137) ; texte `Todo: a rule method returns a value of the wrong type (access)` dans l'élaboration |
| 4 | `this.item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?` (392) |
| 5 | `mappedBy: 'asignee'` | oui | non (`ultimabase.ts:9`) | 1 | TS2322 (1 158) |
| 6 | `acess:` | oui | oui | **27** | `Type '{ read(): any; update(): any; delete(): … }' is not assignable to type 'never'.` (142) ; pas de « Did you mean » |
| 7 | `read() { return 42 }` (Tag) | oui | **non** (`ultimabase.ts:9`) | 1 | TS2322 (1 154), `Tag: a rule method returns a value of the wrong type (access)` |
| 8 | `select: { titel: true }` | oui | oui | 1 | `'titel' does not exist in type 'Select<Schema<"Todo", …>>'…` (434) |

**5/8 sur la ligne.** En plus : typo croisée en builder (389) et mauvais schéma retourné dans `is`
(143) sur la ligne ; `resolveInput` qui retourne un nombre (179, ligne de la méthode) ; `this.item.title = ''`
TS2540 ; hook écrit en flèche → `Object is possibly 'undefined'.` (TS2532, 31 : `this` du module) ;
retour faux dans un filtre croisé, `acl.default` qui retourne une chaîne → enregistrement seulement ;
index `priorty` → **22** diagnostics ; `sofDelete`, `softDelete: 'yes'`, `className: 42` → **27** chacun.
Toute erreur dans l'objet de `define` fait perdre les champs du schéma (cascade), car toutes les
règles sont maintenant dans l'appel générique.

## 4. Infobulles (aucun `Register` possible)

| Point | Longueur |
| --- | --- |
| `this.where` | 1 179 (`(property) AccessFilterContext<RulesSchema<"Todo", { … }>>.where: WhereBuilder<…>`) |
| `this` dans une règle | 860 (`this: AccessFilterContext<RulesSchema<"Todo", { … }>>`) |
| builder croisé `(user) =>` | 913 (`WhereBuilder<Schema<"TodoUser", { … }>>`) |
| `this.item` | 697 (le type `Readonly<{ … isDeleted: boolean }>` précédé du conteneur) |
| `const Todo` | 860 ; clé `access` 1 140 ; `define(` 1 197 |
| `findMany` + `include` | 373 ; `this.value` (option de champ) 24 |

## 5. Complétion et découvrabilité

`define({ className: 'Note', fields, | })` propose `access, acl, hooks, postgres, softDelete` (règles
et options de forme des plugins installés) ; dans `access: { | }` : `create, read` (clés restantes).
`App.` : `PasswordUserSchema, RoleSchema, Schema, use`. Découvrable sans documentation : oui pour les
clés ; non pour l'obligation d'écrire des **méthodes** (une flèche compile mal avec un message trompeur).

## 6. `isolatedDeclarations` et JavaScript

`lib/` : 0 erreur. Fixture : 16 × TS9010, 11 × TS9007, **6 × TS9008** (chaque méthode de règle),
3 × TS9011 (`field`), **TS7056** sur `ultimabase` (« inferred type … exceeds the maximum length the
compiler will serialize ») : le type de chaque schéma garde toute sa déclaration pour le contrôle à
l'enregistrement. JavaScript : `checkJs` 0 erreur, `this` typé en JS ; `return 42` non détecté dans la
copie JS (schéma non enregistré : le contrôle n'existe qu'à l'enregistrement).

## 7. Coûts

Auteur de plugin : (a) `access` 22 lignes, mais le type doit déclarer `this` ; Core ajoute `Loosen`,
la rétention de la déclaration et `RuleIssues` (contrôle des retours à l'enregistrement) ;
(b) `softDelete` 7 lignes (option de forme) ; (c) `RoleSchema` 50 lignes : la fabrique doit accepter
les règles dans son `define` (`& LooseRulesOf<TApp, TName, …>`) et les transmettre au runtime ;
hooks de champ : +7 lignes et un slot Core de plus (`FieldOptionsHKT`).
Développeur : `todo.ts` 42, total **114** lignes (D 106, A′ 105) ; un seul appel, mais chaque règle
est une méthode à 3 lignes et il faut savoir que `this` porte le contexte.

## 8. Exécution (`node runtime-check.mjs`)

Collecte identique à A′ (champs, option de forme, règles `access/acl/hooks/postgres`, option de champ
`hooks:resolveInput` sur `displayName`). Les méthodes sont appelées avec `this = { where, userId }` :
mêmes filtres que D (`Tag.read` à deux sauts), `beforeUpdate` lève, `resolveInput` → `"Ada"`. Refusés au
runtime : 2e rôle, aucun rôle, `sofDelete`, `acess`.

## 9. Générateur

`node forms/n-this-methods/gen.mjs <N> [--register]` → `forms/n-this-methods/gen/n-this-methods-<N>/`
(règles en méthodes, pas de `Register` ; `--register` reproduit le plantage). **10 : 0 erreur ;
50 : échec** (TS2589 ×17 dans `s20`–`s23`, + 50 TS2322 à l'enregistrement). Seuil : entre 20 et 25
schémas chaînés. Indicatif à 10 (un run) : 57 138 instanciations (D : 31 295), check 0,42 s.

## 10. Risques

- Impossible de vérifier les retours sur la ligne avec des filtres croisés dans les deux sens.
- Ne passe pas l'échelle : profondeur proportionnelle à la longueur des chaînes de relations.
- Pas d'infobulles courtes (`Register` : cycle en exact, plantage du compilateur en `void`).
- Cascades de 22 à 27 diagnostics pour une faute de règle, de clé ou d'option.
- Règles indexées par champ (hooks de champ, champs protégés…) non typables dans `define`.
- Repose sur des comportements internes fragiles (inférence partielle, `void` des méthodes, rétention).
