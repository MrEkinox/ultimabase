# js

Baseline diagnostics: 0

## Hovers

### ultimabase.js `where, userId }) => where.some` (871 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        ... 5 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}>, AppTypes<...>> & RoleModel & {
    ...;
}>
```

### ultimabase.js `(user) => user.eq` (708 chars)

```
(parameter) user: WhereBuilder<DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        ... 5 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}>
```

## Error cases

### JS: cross-schema field typo (ultimabase.js:13: `user.eq('id', userId)` -> `user.eq('idd', userId)`): 1 diagnostic(s)

- ultimabase.js:13:83 TS2345: Argument of type '"idd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee...'.

### JS: rules key typo (ultimabase.js:12: `access: {` -> `acess: {`): 4 diagnostic(s)

- ultimabase.js:12:4 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & Password...'. Did you mean to write 'access'?
- ultimabase.js:13:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- ultimabase.js:13:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- ultimabase.js:13:66 TS7006: Parameter 'user' implicitly has an 'any' type.

### JS: class name key typo (ultimabase.js:11: `TodoRole: {` -> `TodoRol: {`): 4 diagnostic(s)

- ultimabase.js:11:3 TS2561: Object literal may only specify known properties, but 'TodoRol' does not exist in type 'ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ....'. Did you mean to write 'TodoRole'?
- ultimabase.js:13:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- ultimabase.js:13:30 TS7031: Binding element 'userId' implicitly has an 'any' type.
- ultimabase.js:13:66 TS7006: Parameter 'user' implicitly has an 'any' type.

## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| JS: cross-schema field typo | oui | oui | 1 | TS2345 Argument of type '"idd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee...'. | 387 / 387 |
| JS: rules key typo | oui | oui | 4 | TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & Password...'. Did you mean to write 'access'? | 440 / 440 |
| JS: class name key typo | oui | oui | 4 | TS2561 Object literal may only specify known properties, but 'TodoRol' does not exist in type 'ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ....'. Did you mean to write 'TodoRole'? | 444 / 444 |
