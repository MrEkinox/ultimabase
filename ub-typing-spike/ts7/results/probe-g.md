# g

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| (todo) => todo.eq('archived' | 38 | 38 | yes |
| (user) => user.eq('id' | 42 | 42 | yes |
| (user) => user.eq('displayName' | 42 | 42 | yes |
| ({ item }) => | 22 | 22 | yes |
| (value) => value.trim() | 25 | 25 | yes |
| class Todo extends | 10 | 10 | yes |
| static access = this.rules.access( | 49 | 49 | yes |
| static access = this.rules.access( | 955 | 955 | NO |
| static access = this.rules.access( | 80 | 80 | yes |
| App.Schema( | 1606 | 978 | NO |
| pending = await | 364 | 364 | NO |
| one: Todo \| null = await Todo.findOne( | 305 | 305 | yes |
| signedUp = await | 24 | 24 | yes |

### static access = this.rules.access(

TS6:
```
(property) SchemaStatics<"Todo", Readonly<{ readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, false>; readonly priority: ScalarField<...>; ... 6 more ...; readonly tags: RelationField<...>; } & SystemFields & Readonly<...> & { ...; } & { ...; }>, RuleMethods<...>>.rules: RuleMethods<readonly [NoRules, AccessRules, HooksRules, AclRules, NoRules, NoRules, NoRules], SchemaHeader<"Todo", Readonly<{
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, false>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enum", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "inProgress" | "done", false>;
    ... 4 more ...;
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
| 1 relation target typo | 3/3 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| 2 local where field typo (builder) | 1/1 | yes/yes | 2345/2345 | 89/89 | yes | yes |
| 3 cross-schema field typo (object, Todo -> TodoUser) | 1/1 | yes/yes | 2561/2561 | 136/136 | yes | yes |
| 4 plugin-added field typo in a hook | 1/1 | yes/yes | 2551/2551 | 76/76 | yes | yes |
| 5 mappedBy typo | 1/1 | no/no | 2322/2322 | 338/338 | yes | yes |
| 6a rule method typo | 6/6 | yes/yes | 2551/2551 | 334/334 | yes | yes |
| 6b rule static member typo | 1/1 | no/no | 2322/2322 | 320/320 | yes | yes |
| 6c shape option typo | 4/4 | yes/yes | 2322/2322 | 159/159 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 68/68 | yes | yes |
| 8 query select typo | 2/2 | yes/yes | 2561/2561 | 138/138 | yes | yes |
| x1 cross-schema builder field typo (two hops) | 1/1 | yes/yes | 2345/2345 | 96/96 | yes | yes |
| x2 custom static method in the body | 1/1 | no/no | 2322/2322 | 326/326 | yes | yes |
| x3 instance method in the body | 1/1 | no/no | 2322/2322 | 340/340 | yes | yes |
| x4 rule stored under another rule's name | 1/1 | no/no | 2322/2322 | 315/315 | yes | yes |
| x5 second role schema registered | 2/2 | no/no | 2322/2322 | 338/338 | yes | yes |
| x6 role schema missing | 1/1 | yes/yes | 2345/2345 | 509/509 | yes | yes |
| x7 index field typo | 4/4 | yes/yes | 2820/2820 | 195/195 | NO | yes |
| x8 unknown members on role factory | 1/1 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| x9 select typo next to valid keys | 1/1 | no/no | 2344/2344 | 52/52 | yes | yes |

### x7 index field typo

TS6 (todo.ts:21):
```
Type '"archivd"' is not assignable to type '"assignee" | "parent" | "dueAt" | "title" | "archived" | "priority" | "allowedPriorities" | "status" | "subtasks" | "tags"'. Did you mean '"archived"'?
```
TS7 (todo.ts:21):
```
Type '"archivd"' is not assignable to type '"allowedPriorities" | "archived" | "assignee" | "dueAt" | "parent" | "priority" | "status" | "subtasks" | "tags" | "title"'. Did you mean '"archived"'?
```
