# fixture-noreg

Baseline diagnostics: 0

## Hovers

### ../fixture/todo.ts `(todo) => todo.eq('archived'` (744 chars)

```
(parameter) todo: WhereBuilder<SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```

### ../fixture/todo.ts `(user) => user.eq('id'` (47 chars)

```
(parameter) user: WhereBuilder<typeof TodoUser>
```

### ../fixture/tag.ts `(user) => user.eq('displayName'` (47 chars)

```
(parameter) user: WhereBuilder<typeof TodoUser>
```

### ../fixture/todo.ts `({ item }) =>` (440 chars)

```
(parameter) item: Readonly<{
    acl: ACL | null;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    archived: boolean | null;
    dueAt: Date | null;
    title: string;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "inProgress" | "done" | null;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    isDeleted: boolean;
}>
```

### ../fixture/todo-user.ts `(value) => value.trim()` (25 chars)

```
(parameter) value: string
```

### ../fixture/todo.ts `class Todo extends` (10 chars)

```
class Todo
```

### ../fixture/todo.ts `static access = this.rules.access(` (49 chars)

```
(property) Todo.access: RuleDeclaration<"access">
```

### ../fixture/todo.ts `static access = this.rules.access(` (1133 chars)

```
(property) SchemaStatics<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>, RuleMethods<...>>.rules: RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```

### ../fixture/todo.ts `static access = this.rules.access(` (781 chars)

```
(property) access: (options: AccessOptions<SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>) => RuleDeclaration<...>
```

### ../fixture/todo.ts `App.Schema(` (1594 chars)

```
(property) ConfiguredFactory<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], readonly [PostgresShape, ... 5 more ..., NoShape], Readonly<...> & { ...; }, readonly [...]>.Schema: SchemaFunction
<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, {
    ...;
}>(className: "Todo", fields: {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, shape?: ({
    ...;
} & ExactShape<...>) | undefined) => SchemaStatics<...>
```

### ../fixture/usage.ts `pending = await` (364 chars)

```
const pending: {
    readonly id: string;
    readonly dueAt: Date | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
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

### ../fixture/usage.ts `one: Todo | null = await Todo.findOne(` (305 chars)

```
(method) SchemaQueries.findOne<typeof Todo, {
    readonly where: {
        readonly title: {
            readonly eq: "x";
        };
    };
}>(this: typeof Todo, args?: {
    readonly where: {
        readonly title: {
            readonly eq: "x";
        };
    };
} | undefined): Promise<Todo | null>
```

### ../fixture/usage.ts `signedUp = await` (24 chars)

```
const signedUp: TodoUser
```

### ../fixture/todo.ts `get assignee()` (55 chars)

```
(getter) assignee: PointerField<typeof TodoUser, false>
```

### completions ../fixture/todo.ts `static acl = this.rules.` (3)

access, acl, hooks

### completions ../fixture/todo.ts `static acl = this.` (17)

access, acl, hooks, apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, rules, toString

### completions ../fixture/todo.ts `extends App.` (14)

apply, arguments, bind, call, caller, field, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions ../fixture/todo.ts `{ softDelete: true, ` (1)

softDelete

## Error cases

### 2 local where field typo (builder) (../fixture/todo.ts: `todo.eq('archived', false)` -> `todo.eq('archivd', false)`): 1 diagnostic(s), on edited line ../fixture/todo.ts:32: yes

- ../fixture/todo.ts:32:36 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<......'.

First message (391 chars): `Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<......'.`

### 3 cross-schema field typo (object, Todo -> TodoUser) (../fixture/todo.ts: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s), on edited line ../fixture/todo.ts:35: yes

- ../fixture/todo.ts:35:47 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<typeof TodoUser>'. Did you mean to write 'email'?

First message (141 chars): `Object literal may only specify known properties, but 'emial' does not exist in type 'Where<typeof TodoUser>'. Did you mean to write 'email'?`

### 4 plugin-added field typo in a hook (../fixture/todo.ts: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s), on edited line ../fixture/todo.ts:45: yes

- ../fixture/todo.ts:45:13 TS2551: Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL | null; id: string; createdAt: Date; updatedAt: Date; archived: boolean | null; dueAt: Date | null; title: string; priority: "low" | "normal" | "high" | null; ... 4 more ...; isDeleted: boolean; }>'. Did you mean 'isDeleted'?

First message (289 chars): `Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL | null; id: string; createdAt: Date; updatedAt: Date; archived: boolean | null; dueAt: Date | null; title: string; priority: "low" | "normal" | "high" | null; ... 4 more ...; isDeleted: boolean; }>'. Did you mean 'isDeleted'?`

### 6a rule method typo (../fixture/todo.ts: `static access = this.rules.access(` -> `static access = this.rules.acess(`): 6 diagnostic(s), on edited line ../fixture/todo.ts:31: yes

- ../fixture/todo.ts:31:29 TS2551: Property 'acess' does not exist on type 'RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<...>; ... 8 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>>>'. Did you mean 'access'?
- ../fixture/todo.ts:32:19 TS7006: Parameter 'todo' implicitly has an 'any' type.
- ../fixture/todo.ts:34:21 TS7006: Parameter 'todo' implicitly has an 'any' type.
- ../fixture/todo.ts:34:29 TS7031: Binding element 'userId' implicitly has an 'any' type.
- ../fixture/todo.ts:34:63 TS7006: Parameter 'user' implicitly has an 'any' type.
- ../fixture/ultimabase.ts:7:67 TS2322: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<any>'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<any>'.

First message (334 chars): `Property 'acess' does not exist on type 'RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<...>; ... 8 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>>>'. Did you mean 'access'?`

### 7 wrong filter return (../fixture/tag.ts: `delete: { where: () => false }` -> `delete: { where: () => 42 }`): 1 diagnostic(s), on edited line ../fixture/tag.ts:13: yes

- ../fixture/tag.ts:13:26 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<SchemaHeader<"Tag", Readonly<{ readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<typeof Todo, "tags">; } & SystemFields & Readonly<...> & { ...; }>>>'.

First message (243 chars): `Type 'number' is not assignable to type 'AccessFilterResult<SchemaHeader<"Tag", Readonly<{ readonly name: ScalarField<"string", string, true>; readonly todos: RelationField<typeof Todo, "tags">; } & SystemFields & Readonly<...> & { ...; }>>>'.`
