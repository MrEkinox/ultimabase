# k

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where }) => where.eq('archived' | 824 | 824 | NO |
| (user) => user.eq | 787 | 787 | NO |
| item }) => | 414 | 414 | NO |
| Todo = App | 803 | 890 | NO |
| rules({ | 1219 | 1222 | NO |
| todoRules = Todo | 36 | 36 | yes |
| rules: [ | 638 | 638 | yes |
| ultimabase = new | 889 | 889 | NO |
| pending = await | 364 | 364 | NO |
| (todo) => todo.is | 823 | 823 | NO |

### where }) => where.eq('archived'

TS6:
```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DefinedSchema<"TodoUser", {
        ...;
    } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
        ...;
    }, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>>
```
TS7:
```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
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
} & SoftDeleteFields, AppTypes<...>>>
```

### (user) => user.eq

TS6:
```
(parameter) user: WhereBuilder<DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}>
```
TS7:
```
(parameter) user: WhereBuilder<DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("high" | "low" | "normal")[], false>;
        readonly status: ScalarField<"enum", "doing" | "done" | "todo", true>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}>
```

### item }) =>

TS6:
```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
    parent: PointerRef | null;
    isDeleted: boolean;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "todo" | "doing" | "done";
    dueAt: Date | null;
}>
```
TS7:
```
(parameter) item: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    dueAt: Date | null;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "todo";
    title: string;
    updatedAt: Date;
}>
```

### Todo = App

TS6:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
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

### rules({

TS6:
```
(method) DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>.rules(rules: PostgresRuleTypes<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DefinedSchema<"TodoUser", {
        ...;
    } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
        ...;
    }, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>> & AccessRuleTypes<...> & HooksRuleTypes<...> & AclRuleTypes<...>): SchemaRules<...>
```
TS7:
```
(method) DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>.rules(rules: PostgresRuleTypes<DefinedSchema<"Todo", {
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
} & SoftDeleteFields, AppTypes<...>>> & AccessRuleTypes<...> & HooksRuleTypes<...> & AclRuleTypes<...>): SchemaRules<...>
```

### ultimabase = new

TS6:
```
const ultimabase: Application<readonly [DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}, DefinedSchema<...> & ... 1 more ... & {
    ...;
}, DefinedSchema<...>, DefinedSchema<...>]>
```
TS7:
```
const ultimabase: Application<readonly [DefinedSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
        readonly allowedPriorities: ScalarField<"list", readonly ("high" | "low" | "normal")[], false>;
        readonly status: ScalarField<"enum", "doing" | "done" | "todo", true>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & SoftDeleteFields, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
    ...;
}, DefinedSchema<...> & ... 1 more ... & {
    ...;
}, DefinedSchema<...>, DefinedSchema<...>]>
```

### pending = await

TS6:
```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly displayName: string;
    } | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly dueAt: Date | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```
TS7:
```
const pending: {
    readonly assignee: {
        readonly displayName: string;
        readonly id: string;
    } | null;
    readonly dueAt: Date | null;
    readonly id: string;
    readonly priority: "high" | "low" | "normal" | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
    readonly title: string;
}[]
```

### (todo) => todo.is

TS6:
```
(parameter) todo: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => DefinedSchema<"TodoUser", {
        ...;
    } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & {
        ...;
    }, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SoftDeleteFields, AppTypes<...>>>
```
TS7:
```
(parameter) todo: WhereBuilder<DefinedSchema<"Todo", {
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
} & SoftDeleteFields, AppTypes<...>>>
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
| 2. local where field typo | 1/1 | yes/yes | 2345/2345 | 385/388 | NO | yes |
| 3. cross-schema field typo (Todo -> TodoUser) | 1/1 | yes/yes | 2561/2561 | 439/439 | yes | yes |
| 4. plugin-added field typo in a hook | 1/1 | yes/yes | 2551/2551 | 268/279 | NO | yes |
| 5. mappedBy typo | 1/1 | no/no | 2719/2719 | 1224/1224 | NO | yes |
| 6. rules key typo | 5/5 | yes/yes | 2561/2561 | 440/440 | NO | yes |
| 7. wrong filter return | 1/1 | yes/yes | 2322/2322 | 363/363 | yes | yes |
| 8. query select typo | 2/2 | yes/yes | 2561/2561 | 429/432 | NO | yes |
| 8b. query select typo next to valid keys (Core query typing, all forms) | 2/2 | no/no | 2339/2339 | 285/285 | NO | yes |
| K1. rules forgotten in rules: [...] | 1/1 | yes/yes | 2322/2322 | 574/574 | yes | yes |
| K2. rules listed twice | 2/2 | yes/yes | 2322/2322 | 274/274 | yes | yes |
| K3. rules registered without their schema | 1/1 | no/no | 2322/2322 | 273/273 | yes | yes |
| K4. second schema from the RoleSchema factory | 4/4 | yes/yes | 2719/2719 | 1239/1239 | NO | yes |
| K5. shape option typo in define | 29/29 | yes/yes | 2561/2561 | 411/414 | NO | yes |
| K6. cross callback returns the wrong schema expression | 1/1 | yes/yes | 2322/2322 | 143/143 | yes | yes |
| K7. softDelete removed: hook reads isDeleted | 10/10 | no/no | 2339/2339 | 367/254 | NO | yes |
| K8. rules declared for a schema of another file passed as a different schema's rules (wrong value) | 5/5 | yes/yes | 2322/2322 | 296/296 | yes | yes |

### 2. local where field typo

TS6 (src/todo.ts:28):
```
Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'.
```
TS7 (src/todo.ts:28):
```
Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'.
```

### 4. plugin-added field typo in a hook

TS6 (src/todo.ts:37):
```
Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; createdAt: Date; updatedAt: Date; parent: PointerRef | null; isDeleted: boolean; title: string; ... 4 more ...; dueAt: Date | null; }>'. Did you mean 'isDeleted'?
```
TS7 (src/todo.ts:37):
```
Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; allowedPriorities: readonly ("high" | "low" | "normal")[] | null; archived: boolean; assignee: PointerRef | null; createdAt: Date; dueAt: Date | null; ... 6 more ...; updatedAt: Date; }>'. Did you mean 'isDeleted'?
```

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

### 6. rules key typo

TS6 (src/todo.ts:27):
```
Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<.....'. Did you mean to write 'access'?
```
TS7 (src/todo.ts:27):
```
Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes...'. Did you mean to write 'access'?
```

### 8. query select typo

TS6 (src/usage.ts:38):
```
Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'?
```
TS7 (src/usage.ts:38):
```
Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'?
```

### 8b. query select typo next to valid keys (Core query typing, all forms)

TS6 (src/usage.ts:16):
```
Property 'title' does not exist on type '{ readonly id: string; readonly assignee: { readonly id: string; readonly displayName: string; } | null; readonly priority: "low" | "normal" | "high" | null; readonly dueAt: Date | null; readonly subtasks: { ...; }[]; readonly titel: never; }'.
```
TS7 (src/usage.ts:16):
```
Property 'title' does not exist on type '{ readonly assignee: { readonly displayName: string; readonly id: string; } | null; readonly dueAt: Date | null; readonly id: string; readonly priority: "high" | "low" | "normal" | null; readonly subtasks: { ...; }[]; readonly titel: never; }'.
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

### K5. shape option typo in define

TS6 (src/todo.ts:11):
```
Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; }> & { ...; }'. Did you mean to write 'softDelete'?
```
TS7 (src/todo.ts:11):
```
Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 6 more ...; readonly tags: RelationField<...>; }> & { ...; }'. Did you mean to write 'softDelete'?
```

### K7. softDelete removed: hook reads isDeleted

TS6 (src/todo.ts:37):
```
Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; createdAt: Date; updatedAt: Date; parent: PointerRef | null; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "todo" | ... 1 more ... | "done"; dueAt...'.
```
TS7 (src/todo.ts:37):
```
Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; allowedPriorities: readonly ("high" | "low" | "normal")[] | null; archived: boolean; assignee: PointerRef | null; createdAt: Date; dueAt: Date | null; ... 5 more ...; updatedAt: Date; }>'.
```
