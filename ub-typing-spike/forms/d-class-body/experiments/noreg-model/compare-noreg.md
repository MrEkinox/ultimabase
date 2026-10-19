# noreg-model without Register (+ rules checks)

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 44 | 44 | yes |
| cross-schema builder | 47 | 47 | yes |
| hook item | 36 | 36 | yes |
| schema class (declaration) | 10 | 10 | yes |
| schema class (usage `Todo.findMany`) | 30 | 18 | NO |
| `Todo.findMany` method (usage) | 2136 | 1431 | NO |
| `static rules` property | 47 | 47 | yes |
| static helper `findOpen` (declaration) | 55 | 55 | yes |
| static helper result `Todo.findOpen()` | 36 | 36 | yes |
| rules entry `this.with(` | 503 | 503 | yes |
| findMany result | 373 | 373 | NO |
| field hook value | 25 | 25 | yes |
| factory schema class (TodoUser) | 14 | 14 | yes |
| role where (two factories) | 48 | 48 | yes |
| hook originalItem | 51 | 51 | yes |
| findMany() no args | 36 | 36 | yes |
| findMany({ where }) no select | 37 | 37 | yes |
| findOne({ where }) | 40 | 40 | yes |
| createOne({ data }) | 34 | 34 | yes |
| findOne + select (partial) | 79 | 79 | yes |
| findMany + include (partial) | 718 | 718 | NO |
| Model<typeof Todo> | 31 | 31 | yes |
| CreateInput<typeof Todo> | 43 | 43 | yes |
| UpdateInput<typeof Todo> | 43 | 43 | yes |

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
| 2 local where typo | 1/1 | yes/yes | 2345/2345 | 94/94 | yes | yes |
| 3 cross-schema field typo (object filter) | 1/1 | yes/yes | 2561/2561 | 141/141 | yes | yes |
| 4 plugin field typo in hook | 1/1 | yes/yes | 2551/2551 | 90/90 | yes | yes |
| 5 mappedBy typo | 1/1 | no/no | 2375/2375 | 447/447 | yes | yes |
| 6 rules key typo | 5/5 | yes/yes | 2561/2561 | 267/267 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 73/73 | yes | yes |
| 8 query select typo | 1/1 | yes/yes | 2561/2561 | 138/138 | yes | yes |
| extra cross-schema builder typo | 1/1 | yes/yes | 2345/2345 | 96/96 | yes | yes |
| extra cross callback returns the wrong schema | 1/1 | yes/yes | 2322/2322 | 143/143 | yes | yes |
| extra field hook returns a number | 1/1 | yes/yes | 2322/2322 | 184/184 | yes | yes |
| extra field hook key typo | 2/2 | yes/yes | 2561/2561 | 157/157 | yes | yes |
| extra index on unknown field | 1/1 | yes/yes | 2820/2820 | 96/96 | yes | yes |
| extra hook item is readonly | 1/1 | yes/yes | 2540/2540 | 60/60 | yes | yes |
| extra softDelete called twice | 29/29 | yes/yes | 2339/2339 | 358/361 | NO | yes |
| extra second role schema registered | 2/2 | yes/yes | 2375/2375 | 461/461 | yes | yes |
| extra role schema missing | 1/1 | yes/yes | 2345/2345 | 435/435 | yes | yes |
| extra field option wrong value (required: 'yes') | 4/4 | yes/yes | 2322/2322 | 62/62 | yes | yes |
| extra className not a string | 34/34 | yes/yes | 2322/2322 | 49/49 | yes | yes |
| extra findMany() element typo | 1/1 | yes/yes | 2551/2551 | 83/83 | yes | yes |
| extra Model<typeof Todo> typo | 1/1 | yes/yes | 2551/2551 | 83/83 | yes | yes |
| extra originalItem typo | 1/1 | yes/yes | 2551/2551 | 90/90 | yes | yes |
| extra instance method in the class body | 1/1 | no/no | 2375/2375 | 485/485 | yes | yes |
| extra instance field in the class body | 1/1 | no/no | 2375/2375 | 485/485 | yes | yes |
| extra compatible override of findMany | 15/15 | no/no | 2554/2554 | 32/32 | yes | yes |
| extra override without the override keyword | 16/16 | yes/yes | 4114/4114 | 110/110 | yes | yes |
| extra static helper with a cross typo | 1/1 | yes/yes | 2561/2561 | 142/142 | yes | yes |
| extra rules borrowed from another class | 4/4 | no/no | 2345/2345 | 94/94 | yes | yes |
| extra rules static name typo | 1/1 | no/no | 2375/2375 | 397/397 | yes | yes |
| extra rules without this.with | 5/5 | no/no | 7031/7031 | 53/53 | yes | yes |

### extra softDelete called twice

TS6 (src/todo.ts:20):
```
Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
```
TS7 (src/todo.ts:20):
```
Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
```
