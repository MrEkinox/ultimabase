# k TS6-stableTypeOrdering vs TS7

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where }) => where.eq('archived' | 824 | 824 | yes |
| (user) => user.eq | 787 | 787 | yes |
| item }) => | 414 | 414 | yes |
| Todo = App | 803 | 890 | NO |
| rules({ | 1222 | 1222 | yes |
| todoRules = Todo | 36 | 36 | yes |
| rules: [ | 638 | 638 | yes |
| ultimabase = new | 889 | 889 | yes |
| pending = await | 364 | 364 | yes |
| (todo) => todo.is | 823 | 823 | yes |

### Todo = App

TS6:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "doing" | "done" | "todo", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DefinedSchema<"TodoUser", {
        ...;
    } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
        ...;
    }, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>
```
TS7:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "doing" | "done" | "todo", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DefinedSchema<"TodoUser", {
        readonly displayName: ScalarField<...>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
        ...;
    }, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>
```

## Completions

- StaffRole.rules({: TS6 4, TS7 4, DIFF (only TS6: access, acl, hooks, postgres; only TS7: access?, acl?, hooks?, postgres?)
- StaffRole.: TS6 5, TS7 7, DIFF (only TS6: -; only TS7: ~factory, ~fields)
- Todo = App.: TS6 13, TS7 14, DIFF (only TS6: -; only TS7: Symbol)
- Tag = App.Schema.define({: TS6 1, TS7 1, DIFF (only TS6: softDelete; only TS7: softDelete?)
- await TodoRole.: TS6 5, TS7 7, DIFF (only TS6: -; only TS7: ~factory, ~fields)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| 1. relation target typo | 2/2 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| 2. local where field typo | 1/1 | yes/yes | 2345/2345 | 388/388 | yes | yes |
| 3. cross-schema field typo (Todo -> TodoUser) | 1/1 | yes/yes | 2561/2561 | 439/439 | yes | yes |
| 4. plugin-added field typo in a hook | 1/1 | yes/yes | 2551/2551 | 279/279 | yes | yes |
| 5. mappedBy typo | 1/1 | no/no | 2719/2719 | 1224/1224 | NO | yes |
| 6. rules key typo | 5/5 | yes/yes | 2561/2561 | 440/440 | yes | yes |
| 7. wrong filter return | 1/1 | yes/yes | 2322/2322 | 363/363 | yes | yes |
| 8. query select typo | 2/2 | yes/yes | 2561/2561 | 432/432 | yes | yes |
| 8b. query select typo next to valid keys (Core query typing, all forms) | 2/2 | no/no | 2339/2339 | 285/285 | yes | yes |
| K1. rules forgotten in rules: [...] | 1/1 | yes/yes | 2322/2322 | 574/574 | yes | yes |
| K2. rules listed twice | 2/2 | yes/yes | 2322/2322 | 274/274 | yes | yes |
| K3. rules registered without their schema | 1/1 | no/no | 2322/2322 | 273/273 | yes | yes |
| K4. second schema from the RoleSchema factory | 4/4 | yes/yes | 2719/2719 | 1239/1239 | NO | yes |
| K5. shape option typo in define | 29/29 | yes/yes | 2561/2561 | 414/414 | yes | yes |
| K6. cross callback returns the wrong schema expression | 1/1 | yes/yes | 2322/2322 | 143/143 | yes | yes |
| K7. softDelete removed: hook reads isDeleted | 10/10 | no/no | 2339/2339 | 254/254 | yes | yes |
| K8. rules declared for a schema of another file passed as a different schema's rules (wrong value) | 5/5 | yes/yes | 2322/2322 | 296/296 | yes | yes |

### 5. mappedBy typo

TS6 (src/ultimabase.ts:8):
```
Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "asignee">; } & Pass...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
```
TS7 (src/ultimabase.ts:8):
```
Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core").DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types").ScalarField<"string", string, true>; readonly assignedTodos: import("/Users/mrekinox/Desktop/ub-typing-spike/f...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core").DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types").ScalarField<"string", string, true>; readonly assignedTodos: import("/Users/mrekinox/Desktop/ub-typing-spike/f...'. Two different types with this name exist, but they are unrelated.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "asignee">; } & Pass...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
```

### K4. second schema from the RoleSchema factory

TS6 (src/ultimabase.ts:8):
```
Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", st...'. Two different types with this name exist, but they are unrelated.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee">; } & Pas...' but required in type 'SchemaRegistrationError<"TodoUser: factory 'PasswordUserSchema' already created another registered schema">'.
```
TS7 (src/ultimabase.ts:8):
```
Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core").DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types").ScalarField<"string", string, true>; readonly assignedTodos: import("/Users/mrekinox/Desktop/ub-typing-spike/f...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/core").DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/k-rules-list/lib/types").ScalarField<"string", string, true>; readonly assignedTodos: import("/Users/mrekinox/Desktop/ub-typing-spike/f...'. Two different types with this name exist, but they are unrelated.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee">; } & Pas...' but required in type 'SchemaRegistrationError<"TodoUser: factory 'PasswordUserSchema' already created another registered schema">'.
```
