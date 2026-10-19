# g-noreg

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| (todo) => todo.eq('archived' | 750 | 750 | NO |
| (user) => user.eq('id' | 47 | 47 | yes |
| (user) => user.eq('displayName' | 47 | 47 | yes |
| ({ item }) => | 440 | 440 | NO |
| (value) => value.trim() | 25 | 25 | yes |
| class Todo extends | 10 | 10 | yes |
| static access = this.rules.access( | 49 | 49 | yes |
| static access = this.rules.access( | 1139 | 955 | NO |
| static access = this.rules.access( | 787 | 787 | NO |
| App.Schema( | 1606 | 978 | NO |
| pending = await | 364 | 364 | NO |
| one: Todo \| null = await Todo.findOne( | 305 | 305 | yes |
| signedUp = await | 24 | 24 | yes |

### (todo) => todo.eq('archived'

TS6:
```
(parameter) todo: WhereBuilder<SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```
TS7:
```
(parameter) todo: WhereBuilder<SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "done" | "inProgress" | "open", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```

### ({ item }) =>

TS6:
```
(parameter) item: Readonly<{
    acl: ACL | null;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    archived: boolean | null;
    dueAt: Date | null;
    title: string;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "inProgress" | "done" | null;
    isDeleted: boolean;
}>
```
TS7:
```
(parameter) item: Readonly<{
    acl: ACL | null;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean | null;
    assignee: PointerRef | null;
    createdAt: Date;
    dueAt: Date | null;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "done" | "inProgress" | "open" | null;
    title: string;
    updatedAt: Date;
}>
```

### static access = this.rules.access(

TS6:
```
(property) SchemaStatics<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>, RuleMethods<...>>.rules: RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```
TS7:
```
(property) SchemaStatics<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>, RuleMethods<...>>.rules: RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "done" | "inProgress" | "open", false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>
```

### static access = this.rules.access(

TS6:
```
(property) access: (options: AccessOptions<SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>) => RuleDeclaration<...>
```
TS7:
```
(property) access: (options: AccessOptions<SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "done" | "inProgress" | "open", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
} & SystemFields & Readonly<...> & {
    ...;
} & {
    ...;
}>>>) => RuleDeclaration<...>
```

### App.Schema(

TS6:
```
(property) ConfiguredFactory<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], readonly [PostgresShape, ... 5 more ..., NoShape], Readonly<...> & { ...; }, readonly [...]>.Schema: SchemaFunction
<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
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
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, shape?: ({
    ...;
} & ExactShape<...>) | undefined) => SchemaStatics<...>
```
TS7:
```
(property) ConfiguredFactory<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], readonly [PostgresShape, ... 5 more ..., NoShape], Readonly<...> & { ...; }, readonly [...]>.Schema: <"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "done" | "inProgress" | "open", false>;
    readonly dueAt: ScalarField<"date", Date, false>;
    readonly assignee: PointerField<() => typeof TodoUser, false>;
    readonly parent: PointerField<...>;
    readonly subtasks: RelationField<...>;
    readonly tags: RelationField<...>;
}, {
    ...;
}>(className: "Todo", fields: {
    ...;
}, shape?: ({
    ...;
} & ExactShape<...>) | undefined) => SchemaStatics<...>
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
    readonly dueAt: Date | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
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

## Completions

- static acl = this.rules.: TS6 3, TS7 3, same
- static acl = this.: TS6 17, TS7 19, DIFF (only TS6: -; only TS7: Symbol, ~fields)
- extends App.: TS6 14, TS7 15, DIFF (only TS6: -; only TS7: Symbol)
- { softDelete: true, : TS6 1, TS7 1, DIFF (only TS6: softDelete; only TS7: softDelete?)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| 2 local where field typo (builder) | 1/1 | yes/yes | 2345/2345 | 391/391 | NO | yes |
| 3 cross-schema field typo (object, Todo -> TodoUser) | 1/1 | yes/yes | 2561/2561 | 141/141 | yes | yes |
| 4 plugin-added field typo in a hook | 1/1 | yes/yes | 2551/2551 | 266/293 | NO | yes |
| 6a rule method typo | 6/6 | yes/yes | 2551/2551 | 334/334 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 249/249 | yes | yes |

### 2 local where field typo (builder)

TS6 (todo.ts:24):
```
Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<......'.
```
TS7 (todo.ts:24):
```
Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<SchemaHeader<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...'.
```

### 4 plugin-added field typo in a hook

TS6 (todo.ts:37):
```
Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL | null; id: string; createdAt: Date; updatedAt: Date; assignee: PointerRef | null; parent: PointerRef | null; archived: boolean | null; ... 5 more ...; isDeleted: boolean; }>'. Did you mean 'isDeleted'?
```
TS7 (todo.ts:37):
```
Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL | null; allowedPriorities: readonly ("high" | "low" | "normal")[] | null; archived: boolean | null; assignee: PointerRef | null; createdAt: Date; dueAt: Date | null; ... 6 more ...; updatedAt: Date; }>'. Did you mean 'isDeleted'?
```
