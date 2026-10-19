# fixture

Baseline diagnostics: 0

## Hovers

### src/ultimabase.ts `where }) => where.eq('archived'` (824 chars)

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

### src/ultimabase.ts `'assignee', (user)` (787 chars)

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

### src/ultimabase.ts `item }) =>` (414 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    parent: PointerRef | null;
    isDeleted: boolean;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "todo" | "doing" | "done";
    dueAt: Date | null;
    assignee: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
}>
```

### src/todo.ts `Todo = App` (890 chars)

```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"list", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "todo" | "doing" | "done", true>;
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

### src/ultimabase.ts `rules: {` (1342 chars)

```
(property) ApplicationOptions<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ... 1 more ... & { ...; }, DefinedSchema<...>, DefinedSchema<...>]>.rules?: ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", {
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

### src/ultimabase.ts `Todo: {` (893 chars)

```
(property) Todo?: PostgresRuleTypes<DefinedSchema<"Todo", {
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
} & SoftDeleteFields, AppTypes<...>>> & AccessRuleTypes<...> & HooksRuleTypes<...> & AclRuleTypes<...>
```

### src/ultimabase.ts `ultimabase = new` (889 chars)

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

### src/usage.ts `pending = await` (364 chars)

```
const pending: {
    readonly id: string;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly dueAt: Date | null;
    readonly assignee: {
        readonly id: string;
        readonly displayName: string;
    } | null;
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### src/ultimabase.ts `(todo) => todo.is` (823 chars)

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

### completions src/completion-probe.ts `rules: {` (1)

Todo

### completions src/completion-probe.ts `Tag: {` (4)

access, acl, hooks, postgres

### completions src/todo.ts `Todo = App.` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions src/tag.ts `Tag = App.Schema.define({` (1)

softDelete

### completions src/usage.ts `await TodoRole.` (4)

addMember, className, createOne, findMany

## Error cases

### 1. relation target typo (src/todo.ts:17: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 2 diagnostic(s)

- src/todo.ts:17:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### 2. local where field typo (src/ultimabase.ts:29: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

- src/ultimabase.ts:29:44 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'.

### 3. cross-schema field typo (Todo -> TodoUser) (src/ultimabase.ts:33: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

- src/ultimabase.ts:33:49 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee">; }...'. Did you mean to write 'email'?

### 4. plugin-added field typo in a hook (src/ultimabase.ts:38: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

- src/ultimabase.ts:38:15 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; parent: PointerRef | null; isDeleted: boolean; title: string; archived: boolean; priority: "low" | "normal" | "high" | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; ... 4 more ...; updatedAt: Date; }>'. Did you mean 'isDeleted'?

### 5. mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

- src/ultimabase.ts:11:12 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: R

### 6. rules key typo (src/ultimabase.ts:28: `Todo: {
			access: {` -> `Todo: {
			acess: {`): 5 diagnostic(s)

- src/ultimabase.ts:28:4 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<.....'. Did you mean to write 'access'?
- src/ultimabase.ts:29:23 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/ultimabase.ts:31:16 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/ultimabase.ts:31:23 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/ultimabase.ts:31:58 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. wrong filter return (src/ultimabase.ts:46: `where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `42`): 1 diagnostic(s)

- src/ultimabase.ts:46:43 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 7 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, ...'.

### 8. query select typo (src/usage.ts:38: `select: { title: true } })` -> `select: { titel: true } })`): 2 diagnostic(s)

- src/usage.ts:38:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'?
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 8b. query select typo next to valid keys (Core query typing, all forms) (src/usage.ts:11: `select: { title: true, dueAt: true, priority: true }` -> `select: { titel: true, dueAt: true, priority: true }`): 2 diagnostic(s)

- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; readonly priority: "low" | "normal" | "high" | null; readonly dueAt: Date | null; readonly assignee: { readonly id: string; readonly displayName: string; } | null; readonly subtasks: { ...; }[]; readonly titel: never; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### L1. class name typo as rules key (src/ultimabase.ts:27: `		Todo: {
` -> `		Todoo: {
`): 5 diagnostic(s)

- src/ultimabase.ts:27:3 TS2561: Object literal may only specify known properties, but 'Todoo' does not exist in type 'ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ....'. Did you mean to write 'Todo'?
- src/ultimabase.ts:29:44 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'never'.
- src/ultimabase.ts:31:45 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/ultimabase.ts:31:72 TS2339: Property 'eq' does not exist on type 'never'.
- src/ultimabase.ts:38:15 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{}>'.

### L2. rules for a schema missing from schemas (src/ultimabase.ts:11: `schemas: [TodoUser, TodoRole, Todo, Tag]` -> `schemas: [TodoUser, TodoRole, Todo]`): 4 diagnostic(s)

- src/ultimabase.ts:43:3 TS2353: Object literal may only specify known properties, and 'Tag' does not exist in type 'ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ....'.
- src/ultimabase.ts:46:54 TS2345: Argument of type '"todos"' is not assignable to parameter of type 'never'.
- src/ultimabase.ts:46:78 TS2339: Property 'is' does not exist on type 'never'.
- src/ultimabase.ts:46:94 TS7006: Parameter 'user' implicitly has an 'any' type.

### L3. rules entry of a schema forgotten (Tag entry deleted) (src/ultimabase.ts:43: `		Tag: {
			access: {
				// Two hops: Tag -> Todo -> TodoUser.
				read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId))) },
			},
		},
` -> ``): 0 diagnostic(s)


### L4. second schema from the RoleSchema factory (src/ultimabase.ts:11: `schemas: [TodoUser, TodoRole, Todo, Tag]` -> `schemas: [TodoUser, TodoRole, Todo, Tag, StaffRole]`): 2 diagnostic(s)

- src/ultimabase.ts:12:22 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() =
- src/ultimabase.ts:12:43 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"StaffRole", Readonly<Record<never, never>> & import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/plugins", { with: { "resolution-mode": "import" } }).RoleOwnedField...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"StaffRole", Readonly<Record<never, never>> & import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/plugins", { with: { "resolution-mode": "import" } }).RoleOwnedField...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"StaffRole", Readonly<Record<never, never>> & RoleOwnedFields<() => DefinedSchema<"TodoUser", { re

### L5. shape option typo in define (src/todo.ts:9: `softDelete: true,` -> `sofDelete: true,`): 30 diagnostic(s)

- src/completion-probe.ts:6:66 TS2322: Type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>> & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<
- src/todo.ts:9:2 TS2561: Object literal may only specify known properties, but 'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; }> & { ...; }'. Did you mean to write 'softDelete'?
- src/ultimabase.ts:11:12 TS2719: Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...'. Two different types with this name exist, but they are unrelated. /   Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: R
- src/ultimabase.ts:11:38 TS2322: Type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>> & SchemaRegistrationError<...>'. /   Property ''~error'' is missing in type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<
- src/ultimabase.ts:16:81 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/ultimabase.ts:29:44 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/ultimabase.ts:31:45 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/ultimabase.ts:31:72 TS2339: Property 'eq' does not exist on type 'never'.
- src/ultimabase.ts:33:28 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/ultimabase.ts:38:15 TS2339: Property 'isDeleted' does not exist on type 'Readonly<{ acl: ACL; id: string; createdAt: Date; updatedAt: Date; }>'.
- src/ultimabase.ts:41:53 TS2322: Type '"status"' is not assignable to type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/ultimabase.ts:41:63 TS2322: Type '"dueAt"' is not assignable to type 'ScalarKeys<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/ultimabase.ts:46:81 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/ultimabase.ts:46:108 TS2339: Property 'eq' does not exist on type 'never'.
- src/usage.ts:10:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:11:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:13:13 TS2353: Object literal may only specify known properties, and 'dueAt' does not exist in type 'OrderBy<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:17:39 TS2339: Property 'dueAt' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:18:51 TS2339: Property 'assignee' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:19:39 TS2339: Property 'subtasks' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:21:39 TS2339: Property 'priority' does not exist on type '{ readonly id: string; }'.
- src/usage.ts:26:58 TS2339: Property 'status' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:27:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:31:49 TS2339: Property 'isDeleted' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; }'.
- src/usage.ts:38:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<Record<never, never>> & AclFields, readonly [...]>>>'.
- src/usage.ts:39:26 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.

### L6. cross callback returns the wrong schema expression (src/ultimabase.ts:31: `(user) => user.eq('id', userId)),
				},` -> `(user) => where.eq('archived', false)),
				},`): 1 diagnostic(s)

- src/ultimabase.ts:31:67 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

## Summary

| Case | Detected | On the edited line | Diagnostics | First message (first line) | Length (first line / full) |
| --- | --- | --- | --- | --- | --- |
| 1. relation target typo | oui | oui | 2 | TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'? | 52 / 52 |
| 2. local where field typo | oui | oui | 1 | TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. | 385 / 385 |
| 3. cross-schema field typo (Todo -> TodoUser) | oui | oui | 1 | TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 8 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>, "assignee">; }...'. Did you mean to write 'email'? | 439 / 439 |
| 4. plugin-added field typo in a hook | oui | oui | 1 | TS2551 Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; parent: PointerRef \| null; isDeleted: boolean; title: string; archived: boolean; priority: "low" \| "normal" \| "high" \| null; allowedPriorities: readonly ("low" \| ... 1 more ... \| "high")[] \| null; ... 4 more ...; updatedAt: Date; }>'. Did you mean 'isDeleted'? | 337 / 337 |
| 5. mappedBy typo | oui | non (src/ultimabase.ts:11) | 1 | TS2719 Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoUser", { readonly displayName: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...'. Two different types with this name exist, but they are unrelated. | 743 / 1224 |
| 6. rules key typo | oui | oui | 5 | TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<.....'. Did you mean to write 'access'? | 440 / 440 |
| 7. wrong filter return | oui | oui | 1 | TS2322 Type 'number' is not assignable to type 'AccessFilterResult<DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<...>; ... 7 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, ...'. | 363 / 363 |
| 8. query select typo | oui | oui | 2 | TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" \| ... 1 more ... \| "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SoftDeleteFields, AppTypes<...>>>'. Did you mean to write 'title'? | 429 / 429 |
| 8b. query select typo next to valid keys (Core query typing, all forms) | oui | non (src/usage.ts:16) | 2 | TS2339 Property 'title' does not exist on type '{ readonly id: string; readonly priority: "low" \| "normal" \| "high" \| null; readonly dueAt: Date \| null; readonly assignee: { readonly id: string; readonly displayName: string; } \| null; readonly subtasks: { ...; }[]; readonly titel: never; }'. | 285 / 285 |
| L1. class name typo as rules key | oui | oui | 5 | TS2561 Object literal may only specify known properties, but 'Todoo' does not exist in type 'ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ....'. Did you mean to write 'Todo'? | 438 / 438 |
| L2. rules for a schema missing from schemas | oui | non (src/ultimabase.ts:43) | 4 | TS2353 Object literal may only specify known properties, and 'Tag' does not exist in type 'ApplicationRules<readonly [PostgresRules, AccessRules, HooksRules, AclRules], readonly [DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>> & PasswordUserModel & { ...; }, DefinedSchema<...> & ....'. | 406 / 406 |
| L3. rules entry of a schema forgotten (Tag entry deleted) | NON | - | 0 | - | 0 |
| L4. second schema from the RoleSchema factory | oui | non (src/ultimabase.ts:12) | 2 | TS2719 Type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...' is not assignable to type 'import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/core", { with: { "resolution-mode": "import" } }).DefinedSchema<"TodoRole", { readonly description: import("/Users/mrekinox/Desktop/ub-typing-spike/forms/l-app-rules/lib/types", { with: { "resolution-mode": "import" } }).ScalarField<"string", stri...'. Two different types with this name exist, but they are unrelated. | 743 / 1231 |
| L5. shape option typo in define | oui | oui | 30 | TS2322 Type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>>' is not assignable to type 'DefinedSchema<"Tag", { readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<() => DefinedSchema<"Todo", unknown, AppTypes<readonly [PostgresRules, AccessRules, HooksRules, AclRules], Readonly<...> & AclFields, readonly [...]>>, "tags">; }, AppTypes<...>> & SchemaRegistrationError<...>'. | 634 / 1062 |
| L6. cross callback returns the wrong schema expression | oui | oui | 1 | TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. | 87 / 143 |
