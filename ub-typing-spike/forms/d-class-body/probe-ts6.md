# d-class-body/fixture

Baseline diagnostics: 0

## Hovers

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 39 | `(parameter) where: WhereBuilder<"Todo">` |
| cross-schema builder | 42 | `(parameter) user: WhereBuilder<"TodoUser">` |
| hook item | 31 | `(parameter) item: Model<"Todo">` |
| schema class (declaration) | 10 | `class Todo` |
| schema class (usage `Todo.findMany`) | 30 | `(alias) class Todo` |
| `Todo.findMany` method (usage) | 2136 | `(method) SchemaQueries.findMany<typeof Todo, {` |
| `static rules` property | 47 | `(property) Todo.rules: SchemaRules<typeof Todo>` |
| static helper `findOpen` (declaration) | 50 | `(method) Todo.findOpen(): Promise<Model<"Todo">[]>` |
| static helper result `Todo.findOpen()` | 31 | `const openList: Model<"Todo">[]` |
| rules entry `this.with(` | 483 | `(method) RulesEntry<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, No` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema class (TodoUser) | 14 | `class TodoUser` |
| role where (two factories) | 43 | `(parameter) where: WhereBuilder<"TodoRole">` |
| hook originalItem | 46 | `(parameter) originalItem: Model<"Todo"> \| null` |
| findMany() no args | 31 | `const allTodos: Model<"Todo">[]` |
| findMany({ where }) no select | 32 | `const openTodos: Model<"Todo">[]` |
| findOne({ where }) | 35 | `const oneTodo: Model<"Todo"> \| null` |
| createOne({ data }) | 29 | `const madeTodo: Model<"Todo">` |
| findOne + select (partial) | 79 | `const oneTitle: {` |
| findMany + include (partial) | 725 | `const withAssignee: {` |
| Model<typeof Todo> | 26 | `const model: Model<"Todo">` |
| CreateInput<typeof Todo> | 38 | `const createInput: CreateInput<"Todo">` |
| UpdateInput<typeof Todo> | 38 | `const updateInput: UpdateInput<"Todo">` |

### where (builder) — src/todo.ts `where }) => where.eq('archived'` (39 chars)

```
(parameter) where: WhereBuilder<"Todo">
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (42 chars)

```
(parameter) user: WhereBuilder<"TodoUser">
```

### hook item — src/todo.ts `item }) => {` (31 chars)

```
(parameter) item: Model<"Todo">
```

### schema class (declaration) — src/todo.ts `class Todo extends` (10 chars)

```
class Todo
```

### schema class (usage `Todo.findMany`) — src/usage.ts `await Todo.findMany` (30 chars)

```
(alias) class Todo
import Todo
```

### `Todo.findMany` method (usage) — src/usage.ts `await Todo.findMany` (2136 chars)

```
(method) SchemaQueries.findMany<typeof Todo, {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
}>(this: typeof Todo, args?: {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
} | undefined, options?: QueryOptions): Promise<...>
```

### `static rules` property — src/todo.ts `static rules` (47 chars)

```
(property) Todo.rules: SchemaRules<typeof Todo>
```

### static helper `findOpen` (declaration) — src/todo.ts `static findOpen` (50 chars)

```
(method) Todo.findOpen(): Promise<Model<"Todo">[]>
```

### static helper result `Todo.findOpen()` — src/named.ts `openList = await` (31 chars)

```
const openList: Model<"Todo">[]
```

### rules entry `this.with(` — src/todo.ts `this.with({` (483 chars)

```
(method) RulesEntry<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>.with<typeof Todo>(this: typeof Todo, rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): SchemaRules<typeof Todo>
```

### findMany result — src/usage.ts `pending = await` (373 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly email: string;
    } | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly status: "open" | "doing" | "done";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### field hook value — src/todo-user.ts `value }) => value.trim()` (25 chars)

```
(parameter) value: string
```

### factory schema class (TodoUser) — src/todo-user.ts `class TodoUser extends` (14 chars)

```
class TodoUser
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (43 chars)

```
(parameter) where: WhereBuilder<"TodoRole">
```

### hook originalItem — src/todo.ts `originalItem }) =>` (46 chars)

```
(parameter) originalItem: Model<"Todo"> | null
```

### findMany() no args — src/named.ts `allTodos = await` (31 chars)

```
const allTodos: Model<"Todo">[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (32 chars)

```
const openTodos: Model<"Todo">[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (35 chars)

```
const oneTodo: Model<"Todo"> | null
```

### createOne({ data }) — src/named.ts `madeTodo = await` (29 chars)

```
const madeTodo: Model<"Todo">
```

### findOne + select (partial) — src/named.ts `oneTitle = await` (79 chars)

```
const oneTitle: {
    readonly id: string;
    readonly title: string;
} | null
```

### findMany + include (partial) — src/named.ts `withAssignee = await` (725 chars)

```
const withAssignee: {
    readonly acl: ACL;
    readonly id: string;
    readonly assignee: {
        readonly acl: ACL;
        readonly id: string;
        readonly displayName: string;
        readonly username: string;
        readonly email: string;
        readonly createdAt: Date;
        readonly updatedAt: Date;
    } | null;
    readonly parent: PointerRef | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly title: string;
    readonly archived: boolean;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | ... 1 more ... | "done";
    readonly isDeleted: boolean;
}[]
```

### Model<typeof Todo> — src/named.ts `model: Model` (26 chars)

```
const model: Model<"Todo">
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (38 chars)

```
const createInput: CreateInput<"Todo">
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (38 chars)

```
const updateInput: UpdateInput<"Todo">
```

## Hovers — WITHOUT the Register line (0 diagnostic(s))

| Point | Length | Text (first line) |
| --- | --- | --- |
| where (builder) | 44 | `(parameter) where: WhereBuilder<typeof Todo>` |
| cross-schema builder | 47 | `(parameter) user: WhereBuilder<typeof TodoUser>` |
| hook item | 390 | `(parameter) item: Readonly<{` |
| schema class (declaration) | 10 | `class Todo` |
| schema class (usage `Todo.findMany`) | 30 | `(alias) class Todo` |
| `Todo.findMany` method (usage) | 2136 | `(method) SchemaQueries.findMany<typeof Todo, {` |
| `static rules` property | 47 | `(property) Todo.rules: SchemaRules<typeof Todo>` |
| static helper `findOpen` (declaration) | 409 | `(method) Todo.findOpen(): Promise<Readonly<{` |
| static helper result `Todo.findOpen()` | 390 | `const openList: Readonly<{` |
| rules entry `this.with(` | 503 | `(method) RulesEntry<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, No` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema class (TodoUser) | 14 | `class TodoUser` |
| role where (two factories) | 48 | `(parameter) where: WhereBuilder<typeof TodoRole>` |
| hook originalItem | 405 | `(parameter) originalItem: Readonly<{` |
| findMany() no args | 390 | `const allTodos: Readonly<{` |
| findMany({ where }) no select | 391 | `const openTodos: Readonly<{` |
| findOne({ where }) | 394 | `const oneTodo: Readonly<{` |
| createOne({ data }) | 388 | `const madeTodo: Readonly<{` |
| findOne + select (partial) | 79 | `const oneTitle: {` |
| findMany + include (partial) | 718 | `const withAssignee: {` |
| Model<typeof Todo> | 385 | `const model: Readonly<{` |
| CreateInput<typeof Todo> | 43 | `const createInput: CreateInput<typeof Todo>` |
| UpdateInput<typeof Todo> | 43 | `const updateInput: UpdateInput<typeof Todo>` |

### where (builder) — src/todo.ts `where }) => where.eq('archived'` (44 chars)

```
(parameter) where: WhereBuilder<typeof Todo>
```

### cross-schema builder — src/todo.ts `(user) => user.eq` (47 chars)

```
(parameter) user: WhereBuilder<typeof TodoUser>
```

### hook item — src/todo.ts `item }) => {` (390 chars)

```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>
```

### schema class (declaration) — src/todo.ts `class Todo extends` (10 chars)

```
class Todo
```

### schema class (usage `Todo.findMany`) — src/usage.ts `await Todo.findMany` (30 chars)

```
(alias) class Todo
import Todo
```

### `Todo.findMany` method (usage) — src/usage.ts `await Todo.findMany` (2136 chars)

```
(method) SchemaQueries.findMany<typeof Todo, {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
}>(this: typeof Todo, args?: {
    readonly where: {
        readonly archived: {
            readonly eq: false;
        };
        readonly assignee: {
            readonly is: {
                readonly displayName: {
                    readonly startsWith: "A";
                };
            };
        };
        readonly tags: {
            readonly some: {
                readonly name: {
                    readonly eq: "x";
                };
            };
        };
    };
    readonly select: {
        readonly title: true;
        readonly priority: true;
        readonly status: true;
    };
    readonly include: {
        readonly assignee: {
            readonly select: {
                readonly email: true;
            };
        };
        readonly subtasks: {
            readonly select: {
                readonly title: true;
            };
            readonly where: {
                readonly isDeleted: {
                    readonly eq: false;
                };
            };
        };
    };
} | undefined, options?: QueryOptions): Promise<...>
```

### `static rules` property — src/todo.ts `static rules` (47 chars)

```
(property) Todo.rules: SchemaRules<typeof Todo>
```

### static helper `findOpen` (declaration) — src/todo.ts `static findOpen` (409 chars)

```
(method) Todo.findOpen(): Promise<Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>[]>
```

### static helper result `Todo.findOpen()` — src/named.ts `openList = await` (390 chars)

```
const openList: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>[]
```

### rules entry `this.with(` — src/todo.ts `this.with({` (503 chars)

```
(method) RulesEntry<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, NoSchemaOptions, NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>>.with<typeof Todo>(this: typeof Todo, rules: PostgresSchemaOption<typeof Todo> & AccessSchemaOption<typeof Todo> & HooksSchemaOption<typeof Todo> & Readonly<Record<never, never>> & AclSchemaOption<typeof Todo>): SchemaRules<typeof Todo>
```

### findMany result — src/usage.ts `pending = await` (373 chars)

```
const pending: {
    readonly id: string;
    readonly assignee: {
        readonly id: string;
        readonly email: string;
    } | null;
    readonly title: string;
    readonly priority: "low" | "normal" | "high" | null;
    readonly status: "open" | "doing" | "done";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
}[]
```

### field hook value — src/todo-user.ts `value }) => value.trim()` (25 chars)

```
(parameter) value: string
```

### factory schema class (TodoUser) — src/todo-user.ts `class TodoUser extends` (14 chars)

```
class TodoUser
```

### role where (two factories) — src/todo-role.ts `where, userId }) => where.some('members'` (48 chars)

```
(parameter) where: WhereBuilder<typeof TodoRole>
```

### hook originalItem — src/todo.ts `originalItem }) =>` (405 chars)

```
(parameter) originalItem: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}> | null
```

### findMany() no args — src/named.ts `allTodos = await` (390 chars)

```
const allTodos: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (391 chars)

```
const openTodos: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (394 chars)

```
const oneTodo: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}> | null
```

### createOne({ data }) — src/named.ts `madeTodo = await` (388 chars)

```
const madeTodo: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>
```

### findOne + select (partial) — src/named.ts `oneTitle = await` (79 chars)

```
const oneTitle: {
    readonly id: string;
    readonly title: string;
} | null
```

### findMany + include (partial) — src/named.ts `withAssignee = await` (718 chars)

```
const withAssignee: {
    readonly acl: ACL;
    readonly id: string;
    readonly assignee: {
        readonly acl: ACL;
        readonly id: string;
        readonly createdAt: Date;
        readonly updatedAt: Date;
        readonly displayName: string;
        readonly username: string;
        readonly email: string;
    } | null;
    readonly parent: PointerRef | null;
    readonly title: string;
    readonly archived: boolean;
    readonly priority: "low" | "normal" | "high" | null;
    readonly allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    readonly status: "open" | "doing" | "done";
    readonly isDeleted: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}[]
```

### Model<typeof Todo> — src/named.ts `model: Model` (385 chars)

```
const model: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}>
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (43 chars)

```
const createInput: CreateInput<typeof Todo>
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (43 chars)

```
const updateInput: UpdateInput<typeof Todo>
```

### completions rules entry (empty this.with({})) src/discover.ts `"this.with({ "` (4)

access, acl, hooks, postgres

### completions define declaration keys src/discover.ts `"className: 'Note', "` (1)

fields

### completions this. in static initializer src/discover.ts `"this.with({  })"` (16)

rules, apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, softDelete, toString, with

### completions App. src/todo.ts `"extends App."` (13)

apply, arguments, bind, call, caller, length, name, PasswordUserSchema, prototype, RoleSchema, Schema, toString, use

### completions after define(...). src/todo.ts `"}).softDelete"` (15)

apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, softDelete, toString, with

### completions item. (hook) src/todo.ts `"item.isDeleted"` (12)

acl, allowedPriorities, archived, assignee, createdAt, id, isDeleted, parent, priority, status, title, updatedAt

### completions Todo. (usage) src/usage.ts `"await Todo.findMany"` (16)

findOpen, rules, apply, arguments, bind, call, caller, className, createOne, findMany, findOne, length, name, prototype, toString, with

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 relation target typo | yes | yes | 3 | TS2552 (52) |
| 2 | 2 local where typo | yes | yes | 1 | TS2345 (89) |
| 3 | 3 cross-schema field typo (object filter) | yes | yes | 1 | TS2561 (136) |
| 4 | 4 plugin field typo in hook | yes | yes | 1 | TS2551 (85) |
| 5 | 5 mappedBy typo | yes | no (src/ultimabase.ts:9) | 1 | TS2375 (447) |
| 6 | 6 rules key typo | yes | yes | 5 | TS2561 (261) |
| 7 | 7 wrong filter return | yes | yes | 1 | TS2322 (68) |
| 8 | 8 query select typo | yes | yes | 1 | TS2561 (133) |
| 9 | extra cross-schema builder typo | yes | yes | 1 | TS2345 (91) |
| 10 | extra cross callback returns the wrong schema | yes | yes | 1 | TS2322 (143) |
| 11 | extra field hook returns a number | yes | yes | 1 | TS2322 (184) |
| 12 | extra field hook key typo | yes | yes | 2 | TS2561 (152) |
| 13 | extra index on unknown field | yes | yes | 1 | TS2820 (91) |
| 14 | extra hook item is readonly | yes | yes | 1 | TS2540 (60) |
| 15 | extra softDelete called twice | yes | yes | 29 | TS2339 (358) |
| 16 | extra second role schema registered | yes | yes | 2 | TS2375 (461) |
| 17 | extra role schema missing | yes | yes | 1 | TS2345 (435) |
| 18 | extra Register removed (plain D) | NO | — | 0 | — |
| 19 | extra field option wrong value (required: 'yes') | yes | yes | 4 | TS2322 (62) |
| 20 | extra className not a string | yes | yes | 34 | TS2322 (49) |
| 21 | extra findMany() element typo | yes | yes | 1 | TS2551 (78) |
| 22 | extra Model<typeof Todo> typo | yes | yes | 1 | TS2551 (78) |
| 23 | extra originalItem typo | yes | yes | 1 | TS2551 (85) |
| 24 | extra instance method in the class body | yes | no (src/ultimabase.ts:9) | 1 | TS2375 (485) |
| 25 | extra instance field in the class body | yes | no (src/ultimabase.ts:9) | 1 | TS2375 (485) |
| 26 | extra compatible override of findMany | yes | no (src/named.ts:9) | 20 | TS2554 (32) |
| 27 | extra override without the override keyword | yes | yes | 21 | TS4114 (110) |
| 28 | extra static helper with a cross typo | yes | yes | 1 | TS2561 (137) |
| 29 | extra rules borrowed from another class | yes | no (src/tag.ts:14) | 3 | TS2345 (89) |
| 30 | extra rules static name typo | NO | — | 0 | — |
| 31 | extra rules without this.with | yes | no (src/tag.ts:14) | 4 | TS7031 (53) |

### 1. 1 relation target typo (src/todo.ts:15: `target: () => TodoUser,` -> `target: () => TodoUsr,`): 3 diagnostic(s)

Primary: TS2552 Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?

- src/todo.ts:15:43 TS2552: Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?
- src/usage.ts:19:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.

### 2. 2 local where typo (src/todo.ts:23: `where.eq('archived', false)` -> `where.eq('archivd', false)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

- src/todo.ts:23:43 TS2345: Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.

### 3. 3 cross-schema field typo (object filter) (src/todo.ts:27: `email: { endsWith` -> `emial: { endsWith`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

- src/todo.ts:27:48 TS2561: Object literal may only specify known properties, but 'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?

### 4. 4 plugin field typo in hook (src/todo.ts:32: `item.isDeleted` -> `item.isDeletd`): 1 diagnostic(s)

Primary: TS2551 Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

- src/todo.ts:32:14 TS2551: Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

### 5. 5 mappedBy typo (src/todo-user.ts:8: `mappedBy: 'assignee'` -> `mappedBy: 'asignee'`): 1 diagnostic(s)

Primary: TS2375 Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof TodoUser' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

- src/ultimabase.ts:9:47 TS2375: Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof TodoUser' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.

### 6. 6 rules key typo (src/todo.ts:22: `access: {` -> `acess: {`): 5 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?

- src/todo.ts:22:3 TS2561: Object literal may only specify known properties, but 'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<...>'. Did you mean to write 'access'?
- src/todo.ts:23:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:25:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:25:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:25:57 TS7006: Parameter 'user' implicitly has an 'any' type.

### 7. 7 wrong filter return (src/tag.ts:14: `({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId)))` -> `() => 42`): 1 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

- src/tag.ts:14:25 TS2322: Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.

### 8. 8 query select typo (src/usage.ts:57: `select: { title: true } })` -> `select: { titel: true } })`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'titel' does not exist in type 'Select<"Todo">'. Did you mean to write 'title'?

- src/usage.ts:57:55 TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Select<"Todo">'. Did you mean to write 'title'?

### 9. extra cross-schema builder typo (src/todo.ts:25: `user.eq('id', userId)` -> `user.eq('emial', userId)`): 1 diagnostic(s)

Primary: TS2345 Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

- src/todo.ts:25:74 TS2345: Argument of type '"emial"' is not assignable to parameter of type 'ScalarKeys<"TodoUser">'.

### 10. extra cross callback returns the wrong schema (src/todo.ts:25: `(user) => user.eq('id', userId)` -> `(user) => where.eq('archived', false)`): 1 diagnostic(s)

Primary: TS2322 Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

- src/todo.ts:25:66 TS2322: Type 'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'. /   Type '"Todo"' is not assignable to type '"TodoUser"'.

### 11. extra field hook returns a number (src/todo-user.ts:18: `value.trim()` -> `value.length`): 1 diagnostic(s)

Primary: TS2322 Type '({ value }: { readonly value: string; }) => number' is not assignable to type '(args: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

- src/todo-user.ts:18:29 TS2322: Type '({ value }: { readonly value: string; }) => number' is not assignable to type '(args: { readonly value: string; }) => string'. /   Type 'number' is not assignable to type 'string'.

### 12. extra field hook key typo (src/todo-user.ts:18: `fields: { displayName:` -> `fields: { displayNme:`): 2 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'displayNme' does not exist in type 'FieldHooks<"TodoUser">'. Did you mean to write 'displayName'?

- src/todo-user.ts:18:14 TS2561: Object literal may only specify known properties, but 'displayNme' does not exist in type 'FieldHooks<"TodoUser">'. Did you mean to write 'displayName'?
- src/todo-user.ts:18:45 TS7031: Binding element 'value' implicitly has an 'any' type.

### 13. extra index on unknown field (src/todo.ts:36: `fields: ['archived', 'priority']` -> `fields: ['archived', 'priorty']`): 1 diagnostic(s)

Primary: TS2820 Type '"priorty"' is not assignable to type 'ScalarKeys<"Todo">'. Did you mean '"priority"'?

- src/todo.ts:36:64 TS2820: Type '"priorty"' is not assignable to type 'ScalarKeys<"Todo">'. Did you mean '"priority"'?

### 14. extra hook item is readonly (src/todo.ts:32: `if (item.isDeleted) throw new TypeError('Deleted todos are read-only')` -> `item.title = ''`): 1 diagnostic(s)

Primary: TS2540 Cannot assign to 'title' because it is a read-only property.

- src/todo.ts:32:10 TS2540: Cannot assign to 'title' because it is a read-only property.

### 15. extra softDelete called twice (src/todo.ts:20: `}).softDelete() {` -> `}).softDelete().softDelete() {`): 29 diagnostic(s)

Primary: TS2339 Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.

- src/named.ts:8:36 TS2339: Property 'findMany' does not exist on type 'typeof Todo'.
- src/named.ts:9:37 TS2339: Property 'findMany' does not exist on type 'typeof Todo'.
- src/named.ts:10:35 TS2339: Property 'findOne' does not exist on type 'typeof Todo'.
- src/named.ts:11:36 TS2339: Property 'createOne' does not exist on type 'typeof Todo'.
- src/named.ts:13:36 TS2339: Property 'findOne' does not exist on type 'typeof Todo'.
- src/named.ts:14:40 TS2339: Property 'findMany' does not exist on type 'typeof Todo'.
- src/named.ts:28:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:29:50 TS2339: Property 'priority' does not exist on type 'Model<never>'.
- src/named.ts:34:33 TS2339: Property 'title' does not exist on type 'Model<never>'.
- src/tag.ts:14:80 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:14:107 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:14:80 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'never'.
- src/todo.ts:20:17 TS2339: Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
- src/todo.ts:21:22 TS2339: Property 'with' does not exist on type 'typeof Todo'.
- src/todo.ts:23:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:25:15 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/todo.ts:25:22 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/todo.ts:25:57 TS7006: Parameter 'user' implicitly has an 'any' type.
- src/todo.ts:31:21 TS7031: Binding element 'item' implicitly has an 'any' type.
- src/todo.ts:34:18 TS7031: Binding element 'originalItem' implicitly has an 'any' type.
- src/todo.ts:41:15 TS2339: Property 'findMany' does not exist on type 'typeof Todo'.
- src/ultimabase.ts:9:67 TS2322: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<unknown>'. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<unknown>'.
- src/usage.ts:10:35 TS2339: Property 'findMany' does not exist on type 'typeof Todo'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:30:35 TS2339: Property 'createOne' does not exist on type 'typeof Todo'.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:34 TS2339: Property 'findMany' does not exist on type 'typeof Todo'.

### 16. extra second role schema registered (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, TodoRole, Todo, Tag, AdminRole]`): 2 diagnostic(s)

Primary: TS2375 Type 'typeof TodoRole' is not assignable to type 'typeof TodoRole & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof TodoRole' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.

- src/ultimabase.ts:9:57 TS2375: Type 'typeof TodoRole' is not assignable to type 'typeof TodoRole & SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof TodoRole' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
- src/ultimabase.ts:9:78 TS2375: Type 'Schema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => typeof TodoUser>, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>, never, RoleModel & { ...; }>' is not assignable to type 'DefinedSchema<"AdminRole", Readonly<Record<never, never>> & RoleOwnedFields<() => typeof TodoUser>, AppTypes<readonly [PostgresSchemaOptions, ... 5 more ..., NoSchemaOptions], Readonly<...> & ... 1 more ... & { ...; }, Readonly<...> & ... 1 more ... & SoftDeleteShapes>> & ... 5 more ... & SchemaRegistrationError<...>' with 'exactOptionalPropertyTypes: true'. Consider add

### 17. extra role schema missing (src/ultimabase.ts:9: `[TodoUser, TodoRole, Todo, Tag]` -> `[TodoUser, Todo, Tag]`): 1 diagnostic(s)

Primary: TS2345 Argument of type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [typeof TodoUser, typeof Todo, typeof Tag], "RoleSchema">'. /   Property ''~missing'' is missing in type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' but required in type '{ readonly '~missing': SchemaRegistrationError<"no registered schema created by factory 'RoleSchema'">; }'.

- src/ultimabase.ts:9:35 TS2345: Argument of type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' is not assignable to parameter of type 'ApplicationOptions<readonly [typeof TodoUser, typeof Todo, typeof Tag], "RoleSchema">'. /   Property ''~missing'' is missing in type '{ schemas: [typeof TodoUser, typeof Todo, typeof Tag]; }' but required in type '{ readonly '~missing': SchemaRegistrationError<"no registered schema created by factory 'RoleSchema'">; }'.

### 18. extra Register removed (plain D) (src/ultimabase.ts:14: `readonly app: typeof ultimabase` -> `readonly unrelated: true`): 0 diagnostic(s)

Primary: (none)



### 19. extra field option wrong value (required: 'yes') (src/todo.ts:10: `title: field.string({ required: true,` -> `title: field.string({ required: 'yes',`): 4 diagnostic(s)

Primary: TS2322 Type 'string' is not assignable to type 'boolean | undefined'.

- src/named.ts:27:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/todo.ts:10:25 TS2322: Type 'string' is not assignable to type 'boolean | undefined'.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.

### 20. extra className not a string (src/todo.ts:8: `className: 'Todo',` -> `className: 42,`): 34 diagnostic(s)

Primary: TS2322 Type 'number' is not assignable to type 'string'.

- src/named.ts:9:57 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<string>'.
- src/named.ts:13:85 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<string>'.
- src/named.ts:27:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:28:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:29:50 TS2339: Property 'priority' does not exist on type 'Model<string>'.
- src/named.ts:33:40 TS2339: Property 'title' does not exist on type 'Model<string>'.
- src/named.ts:34:33 TS2339: Property 'title' does not exist on type 'Model<string>'.
- src/tag.ts:14:80 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/tag.ts:14:107 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo-user.ts:14:80 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<string>'.
- src/todo.ts:8:2 TS2322: Type 'number' is not assignable to type 'string'.
- src/todo.ts:23:43 TS2345: Argument of type '"archived"' is not assignable to parameter of type 'ScalarKeys<string>'.
- src/todo.ts:25:44 TS2345: Argument of type '"assignee"' is not assignable to parameter of type 'never'.
- src/todo.ts:25:71 TS2339: Property 'eq' does not exist on type 'never'.
- src/todo.ts:27:27 TS2322: Type '{ assignee: { is: { email: { endsWith: string; }; }; }; }' is not assignable to type 'AccessFilterResult<string>'.
- src/todo.ts:36:52 TS2322: Type '"archived"' is not assignable to type 'ScalarKeys<string>'.
- src/todo.ts:36:64 TS2322: Type '"priority"' is not assignable to type 'ScalarKeys<string>'.
- src/todo.ts:41:35 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<string>'.
- src/ultimabase.ts:9:47 TS2375: Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<`TodoUser.assignedTodos: mappedBy 'assignee' is not a field of ${string}`>' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof TodoUser' but required in type 'SchemaRegistrationError<`TodoUser.assignedTodos: mappedBy 'assignee' is not a field of ${string}`>'.
- src/ultimabase.ts:9:73 TS2375: Type 'typeof Tag' is not assignable to type 'typeof Tag & SchemaRegistrationError<`Tag.todos: mappedBy 'tags' is not a field of ${string}`>' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Tag' but required in type 'SchemaRegistrationError<`Tag.todos: mappedBy 'tags' is not a field of ${string}`>'.
- src/usage.ts:11:11 TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'Where<string>'.
- src/usage.ts:12:12 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<string>'.
- src/usage.ts:16:39 TS2339: Property 'title' does not exist on type 'Model<string>'.
- src/usage.ts:17:39 TS2339: Property 'priority' does not exist on type 'Model<string>'.
- src/usage.ts:18:39 TS2339: Property 'status' does not exist on type 'Model<string>'.
- src/usage.ts:19:51 TS2339: Property 'assignee' does not exist on type 'Model<string>'.
- src/usage.ts:20:39 TS2339: Property 'subtasks' does not exist on type 'Model<string>'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:25:58 TS2339: Property 'tags' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/usage.ts:26:58 TS2339: Property 'allowedPriorities' does not exist on type '{ readonly acl: ACL; readonly id: string; readonly createdAt: Date; readonly updatedAt: Date; readonly isDeleted: boolean; }'.
- src/usage.ts:29:43 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'CreateInput<string>'.
- src/usage.ts:37:68 TS2353: Object literal may only specify known properties, and 'assignee' does not exist in type 'Where<string>'.
- src/usage.ts:41:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:55 TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'Select<string>'.

### 21. extra findMany() element typo (src/named.ts:33: `allTodos[0]?.title` -> `allTodos[0]?.titel`): 1 diagnostic(s)

Primary: TS2551 Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

- src/named.ts:33:40 TS2551: Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

### 22. extra Model<typeof Todo> typo (src/named.ts:34: `model.title` -> `model.titel`): 1 diagnostic(s)

Primary: TS2551 Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

- src/named.ts:34:33 TS2551: Property 'titel' does not exist on type 'Model<"Todo">'. Did you mean 'title'?

### 23. extra originalItem typo (src/todo.ts:34: `void originalItem,` -> `void originalItem?.isDeletd,`): 1 diagnostic(s)

Primary: TS2551 Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

- src/todo.ts:34:56 TS2551: Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?

### 24. extra instance method in the class body (src/todo.ts:39: `
	/** Static helper: open todos. */` -> `
	isLate(): boolean {
		return true
	}
	/** Static helper: open todos. */`): 1 diagnostic(s)

Primary: TS2375 Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: instance member 'isLate' is not allowed; models are immutable data without behaviour">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: instance member 'isLate' is not allowed; models are immutable data without behaviour">'.

- src/ultimabase.ts:9:67 TS2375: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: instance member 'isLate' is not allowed; models are immutable data without behaviour">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: instance member 'isLate' is not allowed; models are immutable data without behaviour">'.

### 25. extra instance field in the class body (src/todo.ts:39: `
	/** Static helper: open todos. */` -> `
	cached = 1
	/** Static helper: open todos. */`): 1 diagnostic(s)

Primary: TS2375 Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: instance member 'cached' is not allowed; models are immutable data without behaviour">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: instance member 'cached' is not allowed; models are immutable data without behaviour">'.

- src/ultimabase.ts:9:67 TS2375: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: instance member 'cached' is not allowed; models are immutable data without behaviour">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: instance member 'cached' is not allowed; models are immutable data without behaviour">'.

### 26. extra compatible override of findMany (src/todo.ts:39: `
	/** Static helper: open todos. */` -> `
	static override findMany() {
		return Promise.resolve([])
	}
	/** Static helper: open todos. */`): 20 diagnostic(s)

Primary: TS2554 Expected 0 arguments, but got 1.

- src/named.ts:9:46 TS2554: Expected 0 arguments, but got 1.
- src/named.ts:14:49 TS2554: Expected 0 arguments, but got 1.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:28:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:33:40 TS2339: Property 'title' does not exist on type 'never'.
- src/todo.ts:44:24 TS2554: Expected 0 arguments, but got 1.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:67 TS2375: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: static 'findMany' overrides a framework member; add a helper with another name">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: static 'findMany' overrides a framework member; add a helper with another name">'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:10:44 TS2554: Expected 0 arguments, but got 1.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:17:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:19:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:43 TS2554: Expected 0 arguments, but got 1.

### 27. extra override without the override keyword (src/todo.ts:39: `
	/** Static helper: open todos. */` -> `
	static findMany() {
		return Promise.resolve([])
	}
	/** Static helper: open todos. */`): 21 diagnostic(s)

Primary: TS4114 This member must have an 'override' modifier because it overrides a member in the base class 'SchemaInstance'.

- src/named.ts:9:46 TS2554: Expected 0 arguments, but got 1.
- src/named.ts:14:49 TS2554: Expected 0 arguments, but got 1.
- src/named.ts:26:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:28:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/named.ts:33:40 TS2339: Property 'title' does not exist on type 'never'.
- src/todo.ts:39:9 TS4114: This member must have an 'override' modifier because it overrides a member in the base class 'SchemaInstance'.
- src/todo.ts:44:24 TS2554: Expected 0 arguments, but got 1.
- src/ultimabase.ts:9:14 TS7022: 'ultimabase' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- src/ultimabase.ts:9:67 TS2375: Type 'typeof Todo' is not assignable to type 'typeof Todo & SchemaRegistrationError<"Todo: static 'findMany' overrides a framework member; add a helper with another name">' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties. /   Property ''~error'' is missing in type 'typeof Todo' but required in type 'SchemaRegistrationError<"Todo: static 'findMany' overrides a framework member; add a helper with another name">'.
- src/ultimabase.ts:14:12 TS2502: 'app' is referenced directly or indirectly in its own type annotation.
- src/usage.ts:10:44 TS2554: Expected 0 arguments, but got 1.
- src/usage.ts:16:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:17:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:18:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:19:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:20:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:21:25 TS2344: Type 'false' does not satisfy the constraint 'true'.
- src/usage.ts:43:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:47:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:51:1 TS2578: Unused '@ts-expect-error' directive.
- src/usage.ts:57:43 TS2554: Expected 0 arguments, but got 1.

### 28. extra static helper with a cross typo (src/todo.ts:41: `return this.findMany({ where: { archived: { eq: false } } })` -> `return this.findMany({ where: { archivd: { eq: false } } })`): 1 diagnostic(s)

Primary: TS2561 Object literal may only specify known properties, but 'archivd' does not exist in type 'Where<"Todo">'. Did you mean to write 'archived'?

- src/todo.ts:41:35 TS2561: Object literal may only specify known properties, but 'archivd' does not exist in type 'Where<"Todo">'. Did you mean to write 'archived'?

### 29. extra rules borrowed from another class (src/tag.ts:11: `static rules = this.with({` -> `static rules = Todo.with({`): 3 diagnostic(s)

Primary: TS2345 Argument of type '"todos"' is not assignable to parameter of type 'RelationKeys<"Todo">'.

- src/tag.ts:14:53 TS2345: Argument of type '"todos"' is not assignable to parameter of type 'RelationKeys<"Todo">'.
- src/tag.ts:14:77 TS2349: This expression is not callable. /   Each member of the union type '(<K extends PointerKeys<"Todo">>(field: K, target: (where: TargetBuilders<"Todo">[K]) => NoInfer<TargetExpressions<"Todo">[K]>) => WhereExpression<...>) | (<K extends never>(field: K, target: (where: TargetBuilders<...>[K]) => NoInfer<TargetExpressions<...>[K]>) => WhereExpression<...>)' has signatures, but none of those signatures are compatible with each other.
- src/tag.ts:14:93 TS7006: Parameter 'user' implicitly has an 'any' type.

### 30. extra rules static name typo (src/todo.ts:21: `static rules = this.with({` -> `static rule = this.with({`): 0 diagnostic(s)

Primary: (none)



### 31. extra rules without this.with (src/tag.ts:11: `static rules = this.with({` -> `static rules = ({`): 4 diagnostic(s)

Primary: TS7031 Binding element 'where' implicitly has an 'any' type.

- src/tag.ts:14:22 TS7031: Binding element 'where' implicitly has an 'any' type.
- src/tag.ts:14:29 TS7031: Binding element 'userId' implicitly has an 'any' type.
- src/tag.ts:14:63 TS7006: Parameter 'todo' implicitly has an 'any' type.
- src/tag.ts:14:93 TS7006: Parameter 'user' implicitly has an 'any' type.
