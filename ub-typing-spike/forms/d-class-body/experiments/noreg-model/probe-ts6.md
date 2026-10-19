# noreg-model/fixture

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
| hook item | 36 | `(parameter) item: Model<typeof Todo>` |
| schema class (declaration) | 10 | `class Todo` |
| schema class (usage `Todo.findMany`) | 30 | `(alias) class Todo` |
| `Todo.findMany` method (usage) | 2136 | `(method) SchemaQueries.findMany<typeof Todo, {` |
| `static rules` property | 47 | `(property) Todo.rules: SchemaRules<typeof Todo>` |
| static helper `findOpen` (declaration) | 55 | `(method) Todo.findOpen(): Promise<Model<typeof Todo>[]>` |
| static helper result `Todo.findOpen()` | 36 | `const openList: Model<typeof Todo>[]` |
| rules entry `this.with(` | 503 | `(method) RulesEntry<AppTypes<readonly [PostgresSchemaOptions, AccessSchemaOptions, HooksSchemaOptions, NoSchemaOptions, AclSchemaOptions, No` |
| findMany result | 373 | `const pending: {` |
| field hook value | 25 | `(parameter) value: string` |
| factory schema class (TodoUser) | 14 | `class TodoUser` |
| role where (two factories) | 48 | `(parameter) where: WhereBuilder<typeof TodoRole>` |
| hook originalItem | 51 | `(parameter) originalItem: Model<typeof Todo> \| null` |
| findMany() no args | 36 | `const allTodos: Model<typeof Todo>[]` |
| findMany({ where }) no select | 37 | `const openTodos: Model<typeof Todo>[]` |
| findOne({ where }) | 40 | `const oneTodo: Model<typeof Todo> \| null` |
| createOne({ data }) | 34 | `const madeTodo: Model<typeof Todo>` |
| findOne + select (partial) | 79 | `const oneTitle: {` |
| findMany + include (partial) | 718 | `const withAssignee: {` |
| Model<typeof Todo> | 31 | `const model: Model<typeof Todo>` |
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

### hook item — src/todo.ts `item }) => {` (36 chars)

```
(parameter) item: Model<typeof Todo>
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

### static helper `findOpen` (declaration) — src/todo.ts `static findOpen` (55 chars)

```
(method) Todo.findOpen(): Promise<Model<typeof Todo>[]>
```

### static helper result `Todo.findOpen()` — src/named.ts `openList = await` (36 chars)

```
const openList: Model<typeof Todo>[]
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

### hook originalItem — src/todo.ts `originalItem }) =>` (51 chars)

```
(parameter) originalItem: Model<typeof Todo> | null
```

### findMany() no args — src/named.ts `allTodos = await` (36 chars)

```
const allTodos: Model<typeof Todo>[]
```

### findMany({ where }) no select — src/named.ts `openTodos = await` (37 chars)

```
const openTodos: Model<typeof Todo>[]
```

### findOne({ where }) — src/named.ts `oneTodo = await` (40 chars)

```
const oneTodo: Model<typeof Todo> | null
```

### createOne({ data }) — src/named.ts `madeTodo = await` (34 chars)

```
const madeTodo: Model<typeof Todo>
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
        readonly email: string;
        readonly displayName: string;
        readonly username: string;
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

### Model<typeof Todo> — src/named.ts `model: Model` (31 chars)

```
const model: Model<typeof Todo>
```

### CreateInput<typeof Todo> — src/named.ts `createInput: CreateInput` (43 chars)

```
const createInput: CreateInput<typeof Todo>
```

### UpdateInput<typeof Todo> — src/named.ts `updateInput: UpdateInput` (43 chars)

```
const updateInput: UpdateInput<typeof Todo>
```

## Error cases

| # | Case | Detected | On faulty line | Diagnostics | Primary (length) |
| --- | --- | --- | --- | --- | --- |


