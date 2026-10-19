# d-hybrid TS6-stableTypeOrdering vs TS7

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 39 | 39 | yes |
| cross-schema builder | 42 | 42 | yes |
| hook item | 390 | 390 | yes |
| schema constant | 857 | 857 | yes |
| rules entry `.with(` | 898 | 898 | yes |
| findMany result | 373 | 373 | yes |
| field hook value | 25 | 25 | yes |
| factory schema constant (TodoUser) | 894 | 894 | yes |
| role where (two factories) | 43 | 43 | yes |

## Hovers — WITHOUT the Register line (diag TS6 0, TS7 0)

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 878 | 878 | yes |
| cross-schema builder | 910 | 910 | yes |
| hook item | 390 | 390 | yes |
| schema constant | 857 | 857 | yes |
| rules entry `.with(` | 1304 | 1304 | yes |
| findMany result | 373 | 373 | yes |
| field hook value | 25 | 25 | yes |
| factory schema constant (TodoUser) | 894 | 894 | yes |
| role where (two factories) | 854 | 854 | yes |

## Completions

- rules entry (empty .with({})): TS6 4, TS7 4, DIFF (only TS6: access, acl, hooks, postgres; only TS7: access?, acl?, hooks?, postgres?)
- define declaration keys: TS6 1, TS7 1, same
- after define(...). (discover): TS6 5, TS7 6, DIFF (only TS6: -; only TS7: ~fields)
- App.: TS6 13, TS7 14, DIFF (only TS6: -; only TS7: Symbol)
- after define(...).: TS6 5, TS7 6, DIFF (only TS6: -; only TS7: ~fields)
- after .softDelete().: TS6 4, TS7 5, DIFF (only TS6: -; only TS7: ~fields)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| 1 relation target typo | 3/3 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| 2 local where typo | 1/1 | yes/yes | 2345/2345 | 89/89 | yes | yes |
| 3 cross-schema field typo (object filter) | 1/1 | yes/yes | 2561/2561 | 136/136 | yes | yes |
| 4 plugin field typo in hook | 1/1 | yes/yes | 2551/2551 | 291/291 | yes | yes |
| 5 mappedBy typo | 1/1 | no/no | 2322/2322 | 1158/1612 | NO | yes |
| 6 rules key typo | 5/5 | yes/yes | 2561/2561 | 261/261 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 68/68 | yes | yes |
| 8 query select typo | 1/1 | yes/yes | 2561/2561 | 424/424 | yes | yes |
| extra cross-schema builder typo | 1/1 | yes/yes | 2345/2345 | 91/91 | yes | yes |
| extra cross callback returns the wrong schema | 1/1 | yes/yes | 2322/2322 | 143/143 | yes | yes |
| extra field hook returns a number | 1/1 | yes/yes | 2322/2322 | 184/184 | yes | yes |
| extra field hook key typo | 2/2 | yes/yes | 2561/2561 | 152/152 | yes | yes |
| extra index on unknown field | 1/1 | yes/yes | 2820/2820 | 91/91 | yes | yes |
| extra hook item is readonly | 1/1 | yes/yes | 2540/2540 | 60/60 | yes | yes |
| extra softDelete called twice | 16/16 | no/no | 2339/2339 | 361/361 | yes | yes |
| extra shape method after .with | 25/25 | yes/yes | 2339/2339 | 368/368 | yes | yes |
| extra second role schema registered | 2/2 | yes/yes | 2322/2322 | 1165/1626 | NO | yes |
| extra role schema missing | 1/1 | yes/yes | 2345/2345 | 1198/1198 | yes | yes |
| extra Register removed (plain D) | 0/0 | no/no | -/- | -/- | yes | yes |
| extra field option wrong value (required: 'yes') | 3/3 | yes/yes | 2322/2322 | 62/62 | yes | yes |
| extra className not a string | 26/26 | yes/yes | 2322/2322 | 49/49 | yes | yes |

### 5 mappedBy typo

TS6 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...'.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
```
TS7 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...'.
  Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
    Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
```

### extra second role schema registered

TS6 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......'.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
```
TS7 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......'.
  Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
    Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
```
