# n-this-methods/fixture

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (this.where) | 1179 | `(property) AccessFilterContext<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"bo` |
| this in a rule method | 860 | `this: AccessFilterContext<RulesSchema<"Todo", {` |
| cross-schema builder | 913 | `(parameter) user: WhereBuilder<Schema<"TodoUser", {` |
| hook item (this.item) | 697 | `(property) WriteHookArgs<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean"` |
| schema constant | 860 | `const Todo: Schema<"Todo", {` |
| rules entry (`access` key in define) | 1140 | `(property) access: {` |
| rules entry (`define(`) | 1197 | `(method) SchemaNamespace<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOption` |
| findMany result | 373 | `const pending: {` |
| field option value (this.value) | 24 | `(property) value: string` |
| factory schema constant (TodoUser) | 897 | `const TodoUser: Schema<"TodoUser", {` |
| role where (this.where) | 1234 | `(property) AccessFilterContext<RulesSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() ` |

### where (this.where) — src/todo.ts `where.eq('archived'` (1179 chars)

```
(property) AccessFilterContext<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>.where: WhereBuilder<RulesSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>>
```

### this in a rule method — src/todo.ts `this.where.eq('archived'` (860 chars)

```
this: AccessFilterContext<RulesSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>>
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (913 chars)

```
(parameter) user: WhereBuilder<Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>, DeclaredRules<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>
```

### hook item (this.item) — src/todo.ts `item.isDeleted` (697 chars)

```
(property) WriteHookArgs<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>.item: Readonly<{
    acl: ACL;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    assignee: PointerRef | null;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    isDeleted: boolean;
    parent: PointerRef | null;
    title: string;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "done" | "open" | "doing";
}>
```

### schema constant — src/todo.ts `Todo = App` (860 chars)

```
const Todo: Schema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>, DeclaredRules<...>>
```

### rules entry (`access` key in define) — src/todo.ts `access: {
		read()` (1140 chars)

```
(property) access: {
    readonly read: (this: AccessFilterContext<RulesSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
        readonly assignee: PointerField<() => Schema<"TodoUser", {
            readonly displayName: ScalarField<"string", string, true>;
            readonly assignedTodos: RelationField<...>;
        } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
            ...;
        }>, false>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>>) => WhereExpression<...>;
    readonly update: (this: AccessFilterContext<...>) => WhereExpression<...>;
    readonly delete: () => {
        ...;
    };
} & {
    ...;
}
```

### rules entry (`define(`) — src/todo.ts `define({` (1197 chars)

```
(method) SchemaNamespace<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>>.define<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
    readonly assignee: PointerField<() => Schema<"TodoUser", {
        readonly displayName: ScalarField<"string", string, true>;
        readonly assignedTodos: RelationField<...>;
    } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
        ...;
    }>, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, {
    ...;
}, {
    ...;
}>(declaration: SchemaDeclaration<...> & ... 3 more ... & {
    ...;
}): Schema<...>
```

### findMany result — src/usage.ts `pending = await` (373 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly email: string;
    } | null;
    readonly priority: "low" | "normal" | "high" | null;
    readonly title: string;
    readonly status: "done" | "open" | "doing";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### field option value (this.value) — src/todo-user.ts `value.trim()` (24 chars)

```
(property) value: string
```

### factory schema constant (TodoUser) — src/todo-user.ts `TodoUser = App` (897 chars)

```
const TodoUser: Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "done" | "open" | "doing", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>, DeclaredRules<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

### role where (this.where) — src/todo-role.ts `where.some('members'` (1234 chars)

```
(property) AccessFilterContext<RulesSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...> & AppTypes<...>>>.where: WhereBuilder<RulesSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => Schema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => Schema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>, DeclaredRules<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...> & AppTypes<...>>>
```

### completions rules entry (empty spot in define) src/discover.ts `"field.string() }),  "` (5)

access, acl, hooks, postgres, softDelete

### completions inside access: { } src/todo.ts `"access: {\n\t\t"` (2)

create, read

### completions App. src/todo.ts `"= App."` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 relation target typo | yes | yes | 3 | TS2552 (52) |
| 2 | 2 local where typo | yes | yes | 1 | TS2345 (375) |
| 3 | 3 cross-schema field typo (object filter) | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (1137) |
| 4 | 4 plugin field typo in hook | yes | yes | 1 | TS2551 (392) |
| 5 | 5 mappedBy typo | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (1158) |
| 6 | 6 rules key typo | yes | yes | 27 | TS2322 (142) |
| 7 | 7 wrong filter return | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (1154) |
| 8 | 8 query select typo | yes | yes | 1 | TS2561 (434) |
| 9 | extra cross-schema builder typo | yes | yes | 1 | TS2345 (389) |
| 10 | extra cross callback returns the wrong schema | yes | yes | 1 | TS2322 (143) |
| 11 | extra field option returns a number | yes | no (src/todo-user.ts:9) | 1 | TS2322 (179) |
| 12 | extra index on unknown field | yes | yes | 22 | TS2322 (2377) |
| 13 | extra hook item is readonly | yes | yes | 1 | TS2540 (60) |
| 14 | extra hook written as an arrow (no this) | yes | yes | 1 | TS2532 (31) |
| 15 | extra wrong return in a crossing rule (Todo.update returns a number) | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (1137) |
| 16 | extra acl default returns a string | yes | no (src/ultimabase.ts:9) | 1 | TS2322 (1134) |
| 17 | extra second role schema registered | yes | yes | 2 | TS2322 (1165) |
| 18 | extra role schema missing | yes | yes | 1 | TS2345 (1198) |
| 19 | extra shape option key typo (sofDelete) | yes | yes | 27 | TS2322 (46) |
| 20 | extra shape option wrong value | yes | yes | 27 | TS2322 (50) |
| 21 | extra field option wrong value (required: 'yes') | yes | yes | 3 | TS2322 (62) |
| 22 | extra className not a string | yes | yes | 27 | TS2322 (49) |

### 1. 1 relation target typo (src/todo.ts:16: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 3 diagnostic(s)

Primary: TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

- src/todo.ts:16:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:19:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.

### 2. 2 local where typo (src/todo.ts:23: `this.where.eq('archived', false)` -> `this.where.eq('archivd', false)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'.

- src/todo.ts:23:25 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'.

### 3. 3 cross-schema field typo (object filter) (src/todo.ts:29: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

Primary: TS2322 Type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...> &...'. /   Property ''~error'' is missing in type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...>' but required in type 'SchemaRegistrationError<"Todo: a rule method returns a value of the wrong type (access)">'.

- src/ultimabase.ts:9:67 TS2322: Type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...> &...'. /   Property ''~error'' is missing 

### 4. 4 plugin field typo in hook (src/todo.ts:39: `this.item.isDeleted` -> `this.item.isDeletd`): 1 diagnostic(s)

Primary: TS2551 Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; assignee: PointerRef | null; archived: boolean; priority: "low" | "normal" | "high" | null; isDeleted: boolean; parent: PointerRef | null; title: string; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "done" | ... 1 m...'. Did you mean 'isDeleted'?

- src/todo.ts:39:18 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; assignee: PointerRef | null; archived: boolean; priority: "low" | "normal" | "high" | null; isDeleted: boolean; parent: PointerRef | null; title: string; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "done" | ... 1 m...'. Did you mean 'isDeleted'?

### 5. 5 mappedBy typo (src/todo-user.ts:13: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

Primary: TS2322 Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "asignee">; } & Passwo...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "asignee">; } &...'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "asignee">; } &...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

- src/ultimabase.ts:9:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "asignee">; } & Passwo...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "asignee">; } &...'. /   Property ''~error'

### 6. 6 rules key typo (src/todo.ts:21: `access: {` -> `acess: {`): 27 diagnostic(s)

Primary: TS2322 Type '{ read(): any; update(): any; delete(): { assignee: { is: { email: { endsWith: string; }; }; }; }; }' is not assignable to type 'never'.

- src/tag.ts:13:54 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]...'.
- src/tag.ts:13:84 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:21:2 TS2322: Type '{ read(): any; update(): any; delete(): { assignee: { is: { email: { endsWith: string; }; }; }; }; }' is not assignable to type 'never'.
- src/todo.ts:23:16 TS2339: Property 'where' does not exist on type 'never'.
- src/todo.ts:26:16 TS2339: Property 'where' does not exist on type 'never'.
- src/todo.ts:26:38 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo.ts:26:66 TS2339: Property 'userId' does not exist on type 'never'.
- src/ultimabase.ts:9:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFi...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUser...'. /   Property ''~error'
- src/ultimabase.ts:9:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>, DeclaredRules...' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>> & Decl...'. /   Property ''~error'
- src/usage.ts:11:36 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Dec...'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, De...'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, D...'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:23:87 TS2353: Object literal may only specify known properties, and 'tags' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, D...'.
- src/usage.ts:25:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:27:33 TS2339: Property 'username' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]...'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Dec...'.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priority: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, De...'.

### 7. 7 wrong filter return (src/tag.ts:13: `return this.where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', this.userId)))` -> `return 42`): 1 diagnostic(s)

Primary: TS2322 Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "tags...' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppType...'. /   Property ''~error'' is missing in type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppType...' but required in type 'SchemaRegistrationError<"Tag: a rule method returns a value of the wrong type (access)">'.

- src/ultimabase.ts:9:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "tags...' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppType...'. /   Property ''~error'

### 8. 8 query select typo (src/usage.ts:57: `select: { title: true } })` -> `select: { titel: true } })`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>>'. Did you mean to write 'title'?

- src/usage.ts:57:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>>'. Did you mean to write 'title'?

### 9. extra cross-schema builder typo (src/todo.ts:26: `user.eq('id', this.userId)` -> `user.eq('emial', this.userId)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "assignee">...'.

- src/todo.ts:26:55 TS2345: Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "assignee">...'.

### 10. extra cross callback returns the wrong schema (src/todo.ts:26: `(user) => user.eq('id', this.userId)` -> `(user) => this.where.eq('archived', false)`): 1 diagnostic(s)

Primary: TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

- src/todo.ts:26:47 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

### 11. extra field option returns a number (src/todo-user.ts:10: `return this.value.trim()` -> `return this.value.length`): 1 diagnostic(s)

Primary: TS2322 Type '(this: { readonly value: string; }) => number' is not assignable to type '(this: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

- src/todo-user.ts:9:4 TS2322: Type '(this: { readonly value: string; }) => number' is not assignable to type '(this: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

### 12. extra index on unknown field (src/todo.ts:42: `fields: ['archived', 'priority']` -> `fields: ['archived', 'priorty']`): 22 diagnostic(s)

Primary: TS2322 Type '[{ fields: ["archived", "priorty"]; }]' is not assignable to type 'readonly [{ readonly fields: readonly ["archived", "priorty"]; }] & readonly [{ readonly fields: readonly ["archived", "priorty"]; }] & readonly IndexDefinition<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>[]'. /   Type '[{ fields: ["archived", "priorty"]; }]' is not assignable to type 'readonly IndexDefinition<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>...'. /     Type '{ fields: ["archived", "priorty"]; }' is not assignable to type 'IndexDefinition<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. /       Types of property 'fields' are incompatible. /         Type '["archived", "priorty"]' is not assignable to type 'readonly ScalarKeys<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>[]'. /           Type '"archived" | "priorty"' is not assignable to type 'ScalarKeys<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. /             Type '"priorty"' is not assignable to type 'ScalarKeys<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. Did you mean '"priority"'?

- src/tag.ts:13:54 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>...'.
- src/tag.ts:13:84 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:42:30 TS2322: Type '[{ fields: ["archived", "priorty"]; }]' is not assignable to type 'readonly [{ readonly fields: readonly ["archived", "priorty"]; }] & readonly [{ readonly fields: readonly ["archived", "priorty"]; }] & readonly IndexDefinition<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>[]'. /   Type '[{ fields: ["archived", "priorty"]; }]' is not assignable to type 'readonly IndexDefinition<RulesSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high",
- src/ultimabase.ts:9:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFie...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserO...'. /   Property ''~error'
- src/ultimabase.ts:9:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>, DeclaredRules<...' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>> & Decla...'. /   Property ''~error'
- src/usage.ts:11:36 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Decl...'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Dec...'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, De...'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:23:87 TS2353: Object literal may only specify known properties, and 'tags' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, De...'.
- src/usage.ts:25:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:27:33 TS2339: Property 'username' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>...'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Decl...'.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priorty: any; } & { readonly isDeleted: ScalarField<"boolean", boolean, true>; }, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Dec...'.

### 13. extra hook item is readonly (src/todo.ts:39: `if (this.item.isDeleted) throw new TypeError('Deleted todos are read-only')` -> `this.item.title = ''`): 1 diagnostic(s)

Primary: TS2540 Cannot assign to 'title' because it is a read-only property.

- src/todo.ts:39:14 TS2540: Cannot assign to 'title' because it is a read-only property.

### 14. extra hook written as an arrow (no this) (src/todo.ts:39: `beforeUpdate() {
			if (this.item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},` -> `beforeUpdate: () => {
			if (this.item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},`): 1 diagnostic(s)

Primary: TS2532 Object is possibly 'undefined'.

- src/todo.ts:39:8 TS2532: Object is possibly 'undefined'.

### 15. extra wrong return in a crossing rule (Todo.update returns a number) (src/todo.ts:26: `return this.where.is('assignee', (user) => user.eq('id', this.userId))` -> `return 7`): 1 diagnostic(s)

Primary: TS2322 Type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...> &...'. /   Property ''~error'' is missing in type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...>' but required in type 'SchemaRegistrationError<"Todo: a rule method returns a value of the wrong type (access)">'.

- src/ultimabase.ts:9:67 TS2322: Type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...> &...'. /   Property ''~error'' is missing 

### 16. extra acl default returns a string (src/todo.ts:34: `return ACL.none().grantRole('TodoRole', 'read', 'update')` -> `return 'everyone'`): 1 diagnostic(s)

Primary: TS2322 Type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...> &...'. /   Property ''~error'' is missing in type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...>' but required in type 'SchemaRegistrationError<"Todo: a rule method returns a value of the wrong type (acl)">'.

- src/ultimabase.ts:9:67 TS2322: Type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>> & DeclaredRules<...> &...'. /   Property ''~error'' is missing 

### 17. extra second role schema registered (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, TodoRole, Todo, Tag, AdminRole]`): 2 diagnostic(s)

Primary: TS2322 Type 'Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<....' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, App...'. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, App...' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.

- src/ultimabase.ts:9:57 TS2322: Type 'Schema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<....' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, App...'. /   Property ''~error'
- src/ultimabase.ts:9:78 TS2322: Type 'Schema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>, RoleModel & { ...; }>' is not assignable to type 'DefinedSchema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...; }>>, AppTypes<...>> & RoleModel & { ...;...'. /   Property ''~error'' is miss

### 18. extra role schema missing (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, Todo, Tag]`): 1 diagnostic(s)

Primary: TS2345 Argument of type '{ schemas: [Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "assignee"...' is not assignable to parameter of type 'ApplicationOptions<readonly [Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...'. /   Property ''~missing'' is missing in type '{ schemas: [Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "assignee"...' but required in type '{ readonly '~missing': SchemaRegistrationError<"no registered schema created by factory 'RoleSchema'">; }'.

- src/ultimabase.ts:9:35 TS2345: Argument of type '{ schemas: [Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...>>, "assignee"...' is not assignable to parameter of type 'ApplicationOptions<readonly [Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, DeclaredRules<...

### 19. extra shape option key typo (sofDelete) (src/todo.ts:9: `softDelete: true,` -> `sofDelete: true,`): 27 diagnostic(s)

Primary: TS2322 Type 'true' is not assignable to type 'never'.

- src/tag.ts:13:54 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Declared...'.
- src/tag.ts:13:84 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:9:2 TS2322: Type 'true' is not assignable to type 'never'.
- src/todo.ts:26:25 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<RulesSchema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>>>'.
- src/todo.ts:26:55 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:39:18 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/ultimabase.ts:9:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUse...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & Pa...'. /   Property ''~error'
- src/ultimabase.ts:9:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>> & DeclaredRules<...> & SchemaRegistrat...'. /   Property ''~error'' is missing in type 'Defined
- src/usage.ts:11:36 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules<...'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules...'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRule...'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:23:87 TS2353: Object literal may only specify known properties, and 'tags' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRule...'.
- src/usage.ts:25:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:27:33 TS2339: Property 'username' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Declared...'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules<...'.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules...'.

### 20. extra shape option wrong value (src/todo.ts:9: `softDelete: true,` -> `softDelete: 'yes',`): 27 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean'.

- src/tag.ts:13:54 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Declared...'.
- src/tag.ts:13:84 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:9:2 TS2322: Type 'string' is not assignable to type 'boolean'.
- src/todo.ts:26:25 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<RulesSchema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>>>'.
- src/todo.ts:26:55 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:39:18 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/ultimabase.ts:9:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUse...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & Pa...'. /   Property ''~error'
- src/ultimabase.ts:9:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>> & DeclaredRules<...> & SchemaRegistrat...'. /   Property ''~error'' is missing in type 'Defined
- src/usage.ts:11:36 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules<...'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules...'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRule...'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:23:87 TS2353: Object literal may only specify known properties, and 'tags' does not exist in type 'Include<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRule...'.
- src/usage.ts:25:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:27:33 TS2339: Property 'username' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Declared...'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules<...'.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<"Todo", { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules...'.

### 21. extra field option wrong value (required: 'yes') (src/todo.ts:11: `title: field.string({ required: true,` -> `title: field.string({ required: 'yes',`): 3 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean | undefined'.

- src/todo.ts:11:25 TS2322: Type 'string' is not assignable to type 'boolean | undefined'.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 22. extra className not a string (src/todo.ts:8: `className: 'Todo',` -> `className: 42,`): 27 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'string'.

- src/tag.ts:13:54 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Declared...'.
- src/tag.ts:13:84 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:8:2 TS2322: Type 'number' is not assignable to type 'string'.
- src/todo.ts:26:25 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'PointerKeys<RulesSchema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>>>'.
- src/todo.ts:26:55 TS2345: Argument of type '"id"' is not assignable to parameter of type 'never'.
- src/todo.ts:39:18 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/ultimabase.ts:9:47 TS2322: Type 'Schema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUse...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "assignee">; } & PasswordUserOwnedFields, AppTypes<...>> & Pa...'. /   Property ''~error'
- src/ultimabase.ts:9:73 TS2322: Type 'Schema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>, DeclaredRules<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<...>, DeclaredRules<...>>, "tags">; } & Readonly<...>, AppTypes<...>> & DeclaredRules<...> & SchemaRegistrat...'. /   Property ''~error'' is missing in type 'Defined
- src/usage.ts:11:36 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules<...'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules...'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Include<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRule...'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:23:87 TS2353: Object literal may only specify known properties, and 'tags' does not exist in type 'Include<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRule...'.
- src/usage.ts:25:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:33 TS2339: Property 'assignedTodos' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:27:33 TS2339: Property 'username' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, Declared...'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules<...'.
- src/usage.ts:45:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:53:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<Schema<string, { archived: any; } & { priority: any; } & Readonly<Record<never, never>>, AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, ... 4 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes, readonly [...]>, DeclaredRules...'.
