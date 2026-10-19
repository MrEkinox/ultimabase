# js

Baseline diagnostics: 0

## Hovers

### todo-role.js `where, userId }) => where.some` (871 chars)

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

### todo-role.js `(user) => user.eq` (708 chars)

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

### JS: cross-schema field typo (todo-role.js:13: `user.eq('id', userId)` -> `user.eq('idd', userId)`): 1 diagnostic(s)

- todo-role.js:13:81 TS2345: Argument of type '"idd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee...'.

### JS: rules key typo (todo-role.js:12: `access: {` -> `acess: {`): 4 diagnostic(s)

- todo-role.js:12:2 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & Password...'. Did you mean to write 'access'?
- todo-role.js:13:21 TS7031: Binding element 'where' implicitly has an 'any' type.
- todo-role.js:13:28 TS7031: Binding element 'userId' implicitly has an 'any' type.
- todo-role.js:13:64 TS7006: Parameter 'user' implicitly has an 'any' type.

### JS: members target typo (todo-role.js:7: `members: () => TodoUser` -> `members: () => TodoUsr`): 1 diagnostic(s)

- todo-role.js:7:17 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| JS: cross-schema field typo | oui | oui | 1 | TS2345 Argument of type '"idd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee...'. | 387 / 387 |
| JS: rules key typo | oui | oui | 4 | TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & Password...'. Did you mean to write 'access'? | 440 / 440 |
| JS: members target typo | oui | oui | 1 | TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'? | 52 / 52 |
