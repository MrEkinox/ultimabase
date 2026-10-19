# d-class-body TS6 vs TS7

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 39 | 39 | yes |
| cross-schema builder | 42 | 42 | yes |
| hook item | 31 | 31 | yes |
| schema class (declaration) | 10 | 10 | yes |
| schema class (usage `Todo.findMany`) | 30 | 18 | NO |
| `Todo.findMany` method (usage) | 2136 | 1431 | NO |
| `static rules` property | 47 | 47 | yes |
| static helper `findOpen` (declaration) | 50 | 50 | yes |
| static helper result `Todo.findOpen()` | 31 | 31 | yes |
| rules entry `this.with(` | 483 | 483 | yes |
| findMany result | 373 | 373 | NO |
| field hook value | 25 | 25 | yes |
| factory schema class (TodoUser) | 14 | 14 | yes |
| role where (two factories) | 43 | 43 | yes |
| hook originalItem | 46 | 46 | yes |
| findMany() no args | 31 | 31 | yes |
| findMany({ where }) no select | 32 | 32 | yes |
| findOne({ where }) | 35 | 35 | yes |
| createOne({ data }) | 29 | 29 | yes |
| findOne + select (partial) | 79 | 79 | yes |
| findMany + include (partial) | 725 | 718 | NO |
| Model<typeof Todo> | 26 | 26 | yes |
| CreateInput<typeof Todo> | 38 | 38 | yes |
| UpdateInput<typeof Todo> | 38 | 38 | yes |

### schema class (usage `Todo.findMany`)

TS6:
```
(alias) class Todo
import Todo
```
TS7:
```
(alias) class Todo
```

### `Todo.findMany` method (usage)

TS6:
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
TS7:
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
            ...;
        };
        readonly tags: {
            ...;
        };
    };
    readonly select: {
        ...;
    };
    readonly include: {
        ...;
    };
} | undefined, options?: QueryOptions): Promise<...>
```

### findMany result

TS6:
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
TS7:
```
const pending: {
    readonly assignee: {
        readonly email: string;
        readonly id: string;
    } | null;
    readonly id: string;
    readonly priority: "high" | "low" | "normal" | null;
    readonly status: "doing" | "done" | "open";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
    readonly title: string;
}[]
```

### findMany + include (partial)

TS6:
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
TS7:
```
const withAssignee: {
    readonly acl: ACL;
    readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    readonly archived: boolean;
    readonly assignee: {
        readonly acl: ACL;
        readonly createdAt: Date;
        readonly displayName: string;
        readonly email: string;
        readonly id: string;
        readonly updatedAt: Date;
        readonly username: string;
    } | null;
    readonly createdAt: Date;
    readonly id: string;
    readonly isDeleted: boolean;
    readonly parent: PointerRef | null;
    readonly priority: "high" | "low" | "normal" | null;
    readonly status: "doing" | "done" | "open";
    readonly title: string;
    readonly updatedAt: Date;
}[]
```

## Hovers — WITHOUT the Register line (diag TS6 0, TS7 0)

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 44 | 44 | yes |
| cross-schema builder | 47 | 47 | yes |
| hook item | 390 | 390 | NO |
| schema class (declaration) | 10 | 10 | yes |
| schema class (usage `Todo.findMany`) | 30 | 18 | NO |
| `Todo.findMany` method (usage) | 2136 | 1431 | NO |
| `static rules` property | 47 | 47 | yes |
| static helper `findOpen` (declaration) | 409 | 409 | NO |
| static helper result `Todo.findOpen()` | 390 | 390 | NO |
| rules entry `this.with(` | 503 | 503 | yes |
| findMany result | 373 | 373 | NO |
| field hook value | 25 | 25 | yes |
| factory schema class (TodoUser) | 14 | 14 | yes |
| role where (two factories) | 48 | 48 | yes |
| hook originalItem | 405 | 405 | NO |
| findMany() no args | 390 | 390 | NO |
| findMany({ where }) no select | 391 | 391 | NO |
| findOne({ where }) | 394 | 394 | NO |
| createOne({ data }) | 388 | 388 | NO |
| findOne + select (partial) | 79 | 79 | yes |
| findMany + include (partial) | 718 | 718 | NO |
| Model<typeof Todo> | 385 | 385 | NO |
| CreateInput<typeof Todo> | 43 | 43 | yes |
| UpdateInput<typeof Todo> | 43 | 43 | yes |

### hook item

TS6:
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
TS7:
```
(parameter) item: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>
```

### schema class (usage `Todo.findMany`)

TS6:
```
(alias) class Todo
import Todo
```
TS7:
```
(alias) class Todo
```

### `Todo.findMany` method (usage)

TS6:
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
TS7:
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
            ...;
        };
        readonly tags: {
            ...;
        };
    };
    readonly select: {
        ...;
    };
    readonly include: {
        ...;
    };
} | undefined, options?: QueryOptions): Promise<...>
```

### static helper `findOpen` (declaration)

TS6:
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
TS7:
```
(method) Todo.findOpen(): Promise<Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>[]>
```

### static helper result `Todo.findOpen()`

TS6:
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
TS7:
```
const openList: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>[]
```

### findMany result

TS6:
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
TS7:
```
const pending: {
    readonly assignee: {
        readonly email: string;
        readonly id: string;
    } | null;
    readonly id: string;
    readonly priority: "high" | "low" | "normal" | null;
    readonly status: "doing" | "done" | "open";
    readonly subtasks: {
        readonly id: string;
        readonly title: string;
    }[];
    readonly title: string;
}[]
```

### hook originalItem

TS6:
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
TS7:
```
(parameter) originalItem: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}> | null
```

### findMany() no args

TS6:
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
TS7:
```
const allTodos: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>[]
```

### findMany({ where }) no select

TS6:
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
TS7:
```
const openTodos: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>[]
```

### findOne({ where })

TS6:
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
TS7:
```
const oneTodo: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}> | null
```

### createOne({ data })

TS6:
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
TS7:
```
const madeTodo: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>
```

### findMany + include (partial)

TS6:
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
TS7:
```
const withAssignee: {
    readonly acl: ACL;
    readonly allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    readonly archived: boolean;
    readonly assignee: {
        readonly acl: ACL;
        readonly createdAt: Date;
        readonly displayName: string;
        readonly email: string;
        readonly id: string;
        readonly updatedAt: Date;
        readonly username: string;
    } | null;
    readonly createdAt: Date;
    readonly id: string;
    readonly isDeleted: boolean;
    readonly parent: PointerRef | null;
    readonly priority: "high" | "low" | "normal" | null;
    readonly status: "doing" | "done" | "open";
    readonly title: string;
    readonly updatedAt: Date;
}[]
```

### Model<typeof Todo>

TS6:
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
TS7:
```
const model: Readonly<{
    acl: ACL;
    allowedPriorities: readonly ("high" | "low" | "normal")[] | null;
    archived: boolean;
    assignee: PointerRef | null;
    createdAt: Date;
    id: string;
    isDeleted: boolean;
    parent: PointerRef | null;
    priority: "high" | "low" | "normal" | null;
    status: "doing" | "done" | "open";
    title: string;
    updatedAt: Date;
}>
```

## Completions

- rules entry (empty this.with({})): TS6 4, TS7 4, DIFF (only TS6: access, acl, hooks, postgres; only TS7: access?, acl?, hooks?, postgres?)
- define declaration keys: TS6 1, TS7 1, same
- this. in static initializer: TS6 16, TS7 19, DIFF (only TS6: -; only TS7: Symbol, ~fields, ~framework?)
- App.: TS6 13, TS7 14, DIFF (only TS6: -; only TS7: Symbol)
- after define(...).: TS6 15, TS7 18, DIFF (only TS6: -; only TS7: Symbol, ~fields, ~framework?)
- item. (hook): TS6 12, TS7 12, same
- Todo. (usage): TS6 16, TS7 19, DIFF (only TS6: -; only TS7: Symbol, ~fields, ~framework?)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| 1 relation target typo | 3/3 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| 2 local where typo | 1/1 | yes/yes | 2345/2345 | 89/89 | yes | yes |
| 3 cross-schema field typo (object filter) | 1/1 | yes/yes | 2561/2561 | 136/136 | yes | yes |
| 4 plugin field typo in hook | 1/1 | yes/yes | 2551/2551 | 85/85 | yes | yes |
| 5 mappedBy typo | 1/1 | no/no | 2375/2375 | 447/447 | yes | yes |
| 6 rules key typo | 5/5 | yes/yes | 2561/2561 | 261/261 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 68/68 | yes | yes |
| 8 query select typo | 1/1 | yes/yes | 2561/2561 | 133/133 | yes | yes |
| extra cross-schema builder typo | 1/1 | yes/yes | 2345/2345 | 91/91 | yes | yes |
| extra cross callback returns the wrong schema | 1/1 | yes/yes | 2322/2322 | 143/143 | yes | yes |
| extra field hook returns a number | 1/1 | yes/yes | 2322/2322 | 184/184 | yes | yes |
| extra field hook key typo | 2/2 | yes/yes | 2561/2561 | 152/152 | yes | yes |
| extra index on unknown field | 1/1 | yes/yes | 2820/2820 | 91/91 | yes | yes |
| extra hook item is readonly | 1/1 | yes/yes | 2540/2540 | 60/60 | yes | yes |
| extra softDelete called twice | 29/29 | yes/yes | 2339/2339 | 358/361 | NO | yes |
| extra second role schema registered | 2/2 | yes/yes | 2375/2375 | 461/461 | yes | yes |
| extra role schema missing | 1/1 | yes/yes | 2345/2345 | 435/435 | yes | yes |
| extra Register removed (plain D) | 0/0 | no/no | -/- | -/- | yes | yes |
| extra field option wrong value (required: 'yes') | 4/4 | yes/yes | 2322/2322 | 62/62 | yes | yes |
| extra className not a string | 34/34 | yes/yes | 2322/2322 | 49/49 | yes | yes |
| extra findMany() element typo | 1/1 | yes/yes | 2551/2551 | 78/78 | yes | yes |
| extra Model<typeof Todo> typo | 1/1 | yes/yes | 2551/2551 | 78/78 | yes | yes |
| extra originalItem typo | 1/1 | yes/yes | 2551/2551 | 85/85 | yes | yes |
| extra instance method in the class body | 1/1 | no/no | 2375/2375 | 485/485 | yes | yes |
| extra instance field in the class body | 1/1 | no/no | 2375/2375 | 485/485 | yes | yes |
| extra compatible override of findMany | 20/21 | no/no | 2554/2554 | 32/32 | yes | NO |
| extra override without the override keyword | 21/22 | yes/yes | 4114/4114 | 110/110 | yes | NO |
| extra static helper with a cross typo | 1/1 | yes/yes | 2561/2561 | 137/137 | yes | yes |
| extra rules borrowed from another class | 3/3 | no/no | 2345/2345 | 89/89 | yes | yes |
| extra rules static name typo | 0/0 | no/no | -/- | -/- | yes | yes |
| extra rules without this.with | 4/4 | no/no | 7031/7031 | 53/53 | yes | yes |

### extra softDelete called twice

TS6 (src/todo.ts:20):
```
Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
```
TS7 (src/todo.ts:20):
```
Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
```

### extra compatible override of findMany

TS6 (src/named.ts:9):
```
Expected 0 arguments, but got 1.
```
TS7 (src/named.ts:9):
```
Expected 0 arguments, but got 1.
```
- only TS7: src/ultimabase.ts:9:14:2322 Type 'Application<readonly [typeof TodoUser, typeof TodoRole, typeof Todo, typeof Tag]>' is not assignable to type 'Application<[typeof TodoUser, typeof TodoRole, typeof Todo, typeof Tag]>'.

### extra override without the override keyword

TS6 (src/todo.ts:39):
```
This member must have an 'override' modifier because it overrides a member in the base class 'SchemaInstance'.
```
TS7 (src/todo.ts:39):
```
This member must have an 'override' modifier because it overrides a member in the base class 'SchemaInstance'.
```
- only TS7: src/ultimabase.ts:9:14:2322 Type 'Application<readonly [typeof TodoUser, typeof TodoRole, typeof Todo, typeof Tag]>' is not assignable to type 'Application<[typeof TodoUser, typeof TodoRole, typeof Todo, typeof Tag]>'.
