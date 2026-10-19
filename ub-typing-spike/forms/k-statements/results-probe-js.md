# js

Baseline diagnostics: 0

## Hovers

### todo-role.js `where, userId }) => where.some` (838 chars)

```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        ... 5 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>>>
```

### todo-role.js `(user) => user.eq` (702 chars)

```
(parameter) user: WhereBuilder<Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        ... 5 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>
```

## Error cases

### JS: cross-schema field typo (todo-role.js:12: `user.eq('id', userId)` -> `user.eq('idd', userId)`): 1 diagnostic(s)

- todo-role.js:12:80 TS2345: Argument of type '"idd"' is not assignable to parameter of type 'ScalarKeys<Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">; }...'.

### JS: statement typo (todo-role.js:11: `TodoRole.access({` -> `TodoRole.acess({`): 4 diagnostic(s)

- todo-role.js:11:10 TS2551: Property 'acess' does not exist on type 'Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<....'. Did you mean 'access'?
- todo-role.js:12:20 TS7031: Binding element 'where' implicitly has an 'any' type.
- todo-role.js:12:27 TS7031: Binding element 'userId' implicitly has an 'any' type.
- todo-role.js:12:63 TS7006: Parameter 'user' implicitly has an 'any' type.

### JS: members target typo (todo-role.js:7: `members: () => TodoUser` -> `members: () => TodoUsr`): 1 diagnostic(s)

- todo-role.js:7:17 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| JS: cross-schema field typo | oui | oui | 1 | TS2345 Argument of type '"idd"' is not assignable to parameter of type 'ScalarKeys<Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>, unknown>, "assignee">; }...'. | 387 / 387 |
| JS: statement typo | oui | oui | 4 | TS2551 Property 'acess' does not exist on type 'Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<....'. Did you mean 'access'? | 386 / 386 |
| JS: members target typo | oui | oui | 1 | TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'? | 52 / 52 |
