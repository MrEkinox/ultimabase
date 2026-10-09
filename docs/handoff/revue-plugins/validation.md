# Revue du plugin Validation (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/validation-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : validation de champ par n'importe quel validateur Standard Schema
(Zod, Valibot, ArkType…), sans dépendance de fournisseur, exécutée en
dernière étape avant l'enregistrement ; Master ne la contourne pas ;
`validationPlugin()` sans option. Core garde ses contrôles structurels
(`required`, types, valeurs d'enum, unicité par index) sans plugin ; la
validation sur mesure reste un plugin (micro-noyau).

## Décisions

1. **Transformations acceptées** : la valeur enregistrée est la sortie du
   validateur (`z.string().trim().max(200)` rogne puis vérifie) ; le typage
   vérifie que la sortie reste compatible avec le champ ; la validation reste
   la dernière étape avant l'enregistrement. Chaque plugin se suffit à
   lui-même. Frontière documentée : mettre une valeur en forme dans le
   validateur ; logique métier (dériver, croiser) dans `resolveInput` de
   Hooks. ADR (ordre d'exécution documenté).
2. **Fonctions comme validateurs** : `validation: (value) => cond || 'message'`
   à côté des validateurs standard, sans bibliothèque.
3. **Validation de schéma** dans `.with({ validation })` : fonction sur
   l'élément final complet (`({ item }) => true | message | { path, message }`)
   ou validateur standard d'objet.
4. **Validateurs asynchrones acceptés**, avec dans la doc : exécution dans la
   transaction (un appel lent garde les verrous) ; l'unicité passe par un
   index unique, pas par un validateur.
5. **Mise à jour : seuls les champs modifiés sont validés** ; création : tous ;
   la validation de schéma voit toujours l'élément complet.
6. **`null` accepté dans le type d'entrée** d'un validateur
   (`z.string().nullable()` réutilisé d'un formulaire).
7. **Erreurs et infobulles lisibles** : validateur incompatible signalé
   `validation must accept string, got number` ; type nommé
   (`FieldValidator<string>`) au lieu de 1 065 caractères de structure.
8. **Gardé** : format `VALIDATION_ERROR` avec `{ path, message }` (400 en REST) ;
   aucune option de plugin ; pas de déduction des types de champ depuis le
   validateur (`field.zod()` rejeté).
9. **`check()`** : valider sans écrire (formulaires, imports, tests),
   mêmes validations de champ et de schéma, sans transaction :
   `ultimabase.plugin(validationPlugin).check(Todo, { data })` →
   `{ valid: true }` ou `{ valid: false, issues }`.
10. **Toutes les erreurs en une réponse** : à vérifier dans le code ; correctif
    si le plugin s'arrête à la première.
11. **Code stable par erreur** : un validateur-fonction peut renvoyer
    `{ message, code }`, transmis au client (traduction, réaction ciblée).
12. **Plus tard** : contraintes sur le nombre d'éléments d'une relation
    (« 10 tags maximum »), si le besoin se présente.
13. **Revue des transports** : partager les contraintes avec les clients
    (export OpenAPI pour REST, équivalent GraphQL).

Revue validée par l'utilisateur le 2026-10-09.
