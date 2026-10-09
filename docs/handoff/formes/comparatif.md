# Comparatif des formes de déclaration de schéma (2026-10-09)

Synthèse des quatre familles ([objet](famille-object.md),
[classes actuelles](famille-class.md), [classes repensées](famille-redesigned.md),
[règles séparées](famille-separate.md)) et du [banc commun](banc.md), selon
le protocole `ub-typing-spike/PROTOCOL.md` et les formes de
[formes-a-tester.md](../formes-a-tester.md). Même fixture (4 schémas en cycle,
auto-relation, plusieurs-à-plusieurs, filtres croisés dans les deux sens et à
deux sauts, `softDelete`, fabriques, enums), mêmes 8 fautes, même banc
(densité vérifiée identique, 3 processus par point, médiane, même session).

Rappel : modèle simplifié de Core ; seules la croissance, l'absence de cycle et
la qualité éditeur sont prouvées. Typegen réel, même session : 42,7 s à froid
et 49,0 s par édition à 200 schémas.

## Tableau

| Forme                  | Compile à 200            | Fautes sur la ligne            | Hover `where` sans / avec registre | Hover `item` | Où mettre les règles se découvre        | Règles contrôlées par                           | Immuable         | JS typé                          | Nom écrit          | Check 200 (s)         | Édition 200 (s)  |
| ---------------------- | ------------------------ | ------------------------------ | ---------------------------------- | ------------ | --------------------------------------- | ----------------------------------------------- | ---------------- | -------------------------------- | ------------------ | --------------------- | ---------------- |
| D hybride              | oui                      | 7/8                            | 878 / 39                           | 390          | bien (chaîne, `.with({})`)              | typage                                          | oui              | oui                              | 2                  | 1,58 (1,42 sans reg.) | 0,75 (0,63)      |
| A′                     | oui                      | 7/8 (cascade ~28)              | 878 / 39                           | 390          | moyen                                   | typage                                          | oui              | oui                              | 2                  | 1,62                  | 0,79             |
| N                      | **non** (TS2589 dès ~25) | 5/8                            | 1 179                              | 697          | —                                       | partiel                                         | oui              | partiel                          | 2                  | erreurs               | —                |
| E1 annotée             | oui                      | 7/8                            | 44 natif                           | 22           | faible (`options` et alias à connaître) | typage                                          | oui              | JSDoc requis                     | 3                  | 1,71                  | 0,73             |
| E2 `this.with`         | oui                      | 7/8                            | 44 natif                           | 22           | bien                                    | typage (2 comportements TS peu documentés)      | oui              | oui                              | 2                  | 1,81                  | 0,75             |
| E3 bloc statique       | oui                      | 7/8                            | 44 natif                           | 22           | très bien (`this.`)                     | **exécution seulement**                         | non (scellement) | oui                              | 2                  | 1,66                  | 0,75             |
| G repensée             | oui                      | 7/8                            | 750 / 38                           | 440 / 22     | bien (`this.rules.`)                    | typage + convention vérifiée à l'enregistrement | oui              | oui                              | 2                  | 1,90 (1,89 reg.)      | 0,80 (1,07 reg.) |
| G′ `Self`              | oui                      | 7/8 (messages les plus courts) | 36 natif                           | 22           | bien                                    | typage                                          | oui              | **non** (`checkJs` inutilisable) | 3                  | 2,00                  | 1,09             |
| K liste de règles      | oui                      | 7/8 (oubli détecté au typage)  | 824 / 39                           | 414          | bien (`Todo.rules(`)                    | typage complet                                  | oui              | oui                              | 2 (+ constante ×3) | 1,54                  | 0,61             |
| K′ instructions        | oui                      | 7/8                            | 903 / 39                           | 414          | très bien (`Todo.`)                     | **exécution seulement**                         | non (scellement) | oui                              | 2                  | 1,49                  | 0,65             |
| L règles d'application | oui                      | 7/8 (oubli non détecté)        | 824 / 39                           | 414          | faible                                  | typage partiel                                  | oui              | oui                              | 14 réf.            | 1,59 (règle : 1,33)   | 0,61             |

Écartées en cours de route : getters (D et G : rien gagné, oubli silencieux ou
`ReferenceError`), M chaînes typées (cible fautive illisible, registre oublié
= contrôle coupé), F chaîne de méthodes (cycle).

## Lecture

1. **La performance ne départage pas.** Toutes les formes valides vérifient
   200 schémas entre 1,4 et 2,0 s (×20 à ×30 plus vite que Typegen) avec la
   même croissance. Seule N casse.
2. **Éliminées par un critère dur** : N (casse à ~25 schémas reliés), L
   (colocalisation cassée, `application.ts` de 3 010 lignes à 200, oubli non
   détecté), E3 et K′ (règles hors du typage : doublon ou oubli vus seulement à
   l'exécution, et schéma modifiable jusqu'à l'enregistrement, contraire à
   l'invariant d'immutabilité), G′ (JavaScript typé impossible, nom ×3,
   syntaxe `()(` inhabituelle, la plus lente).
3. **Dominées** : A′ par D (mêmes chiffres, cascades et fabriques sans options
   de forme) ; G par E2 (G a besoin du registre pour des infobulles courtes,
   d'une convention de nom de statique et paie la plus forte pénalité
   d'édition avec registre).
4. **Finalistes** : D, E1, E2, K.

| Finaliste | Pour                                                                                                           | Contre                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D         | La plus proche de l'actuel (migration et doc mécaniques), tout au typage, immuable, JS, parmi les plus rapides | Infobulles courtes seulement avec la ligne `Register` ; `item` (390) et constante (857) restent longs ; `.with` doit rester dernier (sinon cycle de 25 erreurs) ; repose sur la paresse du dernier appel non générique |
| E1        | Le typage le plus robuste (annotations seulement), infobulles courtes natives                                  | `options` et l'alias à connaître (découvrabilité faible), nom ×3, JSDoc en JS                                                                                                                                          |
| E2        | Infobulles courtes natives, `this.with` découvrable, JS, pas de registre                                       | Repose sur deux comportements peu documentés du vérificateur ; forme de classe éloignée de l'actuel                                                                                                                    |
| K         | Le contrôle le plus complet au typage (oubli, doublon, règles sans schéma), rapide                             | `X.rules({})` exigé pour chaque schéma, constante écrite 3 fois, liste parallèle à `schemas`                                                                                                                           |

## Inconnue décisive avant de trancher

D et E2 reposent sur des comportements internes du vérificateur
(paresse du dernier appel non générique ; `this: TSelf` dans un initialiseur
statique). TypeScript 7 (portage natif) est publié : un comportement non
documenté peut y changer. E1 et K ne reposent que sur des annotations et des
constantes séparées. **Prochaine action proposée** : compiler les fixtures et
générateurs des quatre finalistes avec TypeScript 7, comparer diagnostics,
infobulles et temps, puis décider.
