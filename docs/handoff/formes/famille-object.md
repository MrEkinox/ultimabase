# Famille « objet `define` » — synthèse (2026-10-09)

Formes : `d-hybrid` (D), `d-hybrid-getters` (D + getters), `a-prime` (A′), `n-this-methods` (N).
Détails, commandes et preuves dans chaque `RESULTS.md`. Aucun benchmark de temps (autre agent) ;
chiffres d'instanciations indicatifs (un seul `--extendedDiagnostics` à 10 schémas, machine chargée).

| Critère                                         | D                                                                       | D + getters                                       | A′                                               | N                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture compile                                 | **0 erreur**                                                            | **0 erreur**                                      | **0 erreur**                                     | 0 erreur seulement avec règles à retour `void` + contrôle à l'enregistrement, sans `Register`, hook de champ déplacé en option de champ ; forme spécifiée : cycle (TS7022) |
| 8 fautes sur la ligne                           | **7/8** (`mappedBy` à l'enregistrement)                                 | 7/8                                               | 7/8                                              | **5/8** (+ `emial` objet et `return 42` à l'enregistrement)                                                                                                                |
| Cascades notables                               | `.softDelete()` ×2 : 16 ; méthode de forme après `.with` : TS7022 (25)  | oubli de getter fermant un cycle : TS7022 (21–26) | faute sur `softDelete`/clé de `define` : 28      | `acess`, index, `sofDelete`, `className` : 22–27                                                                                                                           |
| Hover `where` / croisé (avec `Register`)        | **39 / 42**                                                             | 39 / 42                                           | 39 / 42                                          | — (`Register` impossible)                                                                                                                                                  |
| idem sans `Register`                            | 878 / 910                                                               | 872 / 904                                         | 878 / 910                                        | 1 179 / 913                                                                                                                                                                |
| Hover `item` / `const Todo` / entrée des règles | 390 / 857 / 892 (`.with(`)                                              | 390 / 851 / 892                                   | 390 / 857 / 892                                  | 697 / 860 / 1 140 (clé `access`)                                                                                                                                           |
| Complétion des règles                           | `.with({ })` : access, acl, hooks, postgres ; chaîne : softDelete, with | idem                                              | `define` : fields, softDelete ; `.with` : idem D | `define` : access, acl, hooks, postgres, softDelete                                                                                                                        |
| `isolatedDeclarations` (fixture)                | TS9010 ×16, TS9007 ×8                                                   | TS9010 ×16, TS9009 ×6, TS9007 ×2                  | comme D                                          | + TS9008 ×6, TS9011 ×3, TS7056                                                                                                                                             |
| Générateur 10 / 50                              | 0 / 0                                                                   | 0 / 0                                             | 0 / 0                                            | 0 / **échec TS2589** (dès 25)                                                                                                                                              |
| Instanciations à 10 (indicatif)                 | 31 295                                                                  | 31 533                                            | 31 601                                           | 57 138                                                                                                                                                                     |
| Lignes développeur (fixture)                    | 106                                                                     | 118                                               | 105                                              | 114                                                                                                                                                                        |

## Lecture

- **D et A′ sont équivalents sur tout ce qui est mesuré** (même Core, mêmes messages, mêmes
  infobulles) ; ils ne diffèrent que par l'emplacement de `softDelete`. D garde l'objet de `define`
  minimal (moins de cascades, fabriques qui héritent des méthodes de forme sans effort) mais impose
  un ordre implicite (`.with` en dernier, sinon TS7022). A′ supprime la chaîne mais infère un type
  depuis tout l'objet (`NoExtraKeys`) et chaque faute de premier niveau coûte ~28 diagnostics ; les
  fabriques devraient recopier le mécanisme des options de forme.
- **Getters** : aucun gain mesurable sur D, plus verbeux, et l'oubli d'un getter n'est signalé que
  s'il ferme un cycle (TS7022 loin de la cause). À écarter tant que les thunks suffisent.
- **N** ne tient pas : les retours de règles ne peuvent pas être vérifiés dans l'appel générique
  quand deux schémas se croisent (repro minimale), le registre est incompatible (cycle, puis plantage
  de tsc 6.0.3), les hooks indexés par champ ne sont pas typables, et la variante qui compile
  dépasse la profondeur d'instanciation dès 25 schémas chaînés. Cause unique : le corps d'une
  méthode qui utilise `this` est typé pendant l'appel générique.

## Recommandation de la famille

Si l'objet `define` est retenu : **D** (ou A′ si l'on préfère `softDelete: true` à `.softDelete()`,
au prix des cascades), avec la ligne `Register` du gabarit `create-app`. Écarter N et les getters.
Risques communs à D/A′ : dépendance au chemin rapide « dernier appel non générique », erreur
`mappedBy` seulement à l'enregistrement, `const Todo`/`.with(` longs (≈ 860–890 caractères).
