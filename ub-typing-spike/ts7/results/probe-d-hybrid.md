# d-hybrid

Baseline diagnostics: TS6 0, TS7 0

## Hovers 

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 39 | 39 | yes |
| cross-schema builder | 42 | 42 | yes |
| hook item | 390 | 390 | NO |
| schema constant | 857 | 857 | NO |
| rules entry `.with(` | 892 | 898 | NO |
| findMany result | 373 | 373 | NO |
| field hook value | 25 | 25 | yes |
| factory schema constant (TodoUser) | 894 | 894 | NO |
| role where (two factories) | 43 | 43 | yes |

### hook item

TS6:
```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    parent: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
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

### schema constant

TS6:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
}, AppTypes<...>>
```
TS7:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
}, AppTypes<...>>
```

### rules entry `.with(`

TS6:
```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | ... 1 more ... | "high")[], false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>
```
TS7:
```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & Readonly<Record<never, never>> & AclSchemaOption<"Todo">): DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | ... 1 more ... | "normal")[], false>;
    ... 4 more ...;
    readonly tags: RelationField<...>;
} & {
    ...;
}, AppTypes<...>>
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

### factory schema constant (TodoUser)

TS6:
```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```
TS7:
```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
        readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

## Hovers — WITHOUT the Register line (diag TS6 0, TS7 0)

| Point | TS6 | TS7 | Same text |
| --- | --- | --- | --- |
| where (builder) | 878 | 878 | NO |
| cross-schema builder | 910 | 910 | NO |
| hook item | 390 | 390 | NO |
| schema constant | 857 | 857 | NO |
| rules entry `.with(` | 1301 | 1304 | NO |
| findMany result | 373 | 373 | NO |
| field hook value | 25 | 25 | yes |
| factory schema constant (TodoUser) | 894 | 894 | NO |
| role where (two factories) | 854 | 854 | NO |

### where (builder)

TS6:
```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
TS7:
```
(parameter) where: WhereBuilder<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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

### cross-schema builder

TS6:
```
(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>
```
TS7:
```
(parameter) user: WhereBuilder<ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
        readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>
```

### hook item

TS6:
```
(parameter) item: Readonly<{
    acl: ACL;
    id: string;
    assignee: PointerRef | null;
    createdAt: Date;
    updatedAt: Date;
    parent: PointerRef | null;
    title: string;
    archived: boolean;
    priority: "low" | "normal" | "high" | null;
    allowedPriorities: readonly ("low" | "normal" | "high")[] | null;
    status: "open" | "doing" | "done";
    isDeleted: boolean;
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

### schema constant

TS6:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
}, AppTypes<...>>
```
TS7:
```
const Todo: DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
}, AppTypes<...>>
```

### rules entry `.with(`

TS6:
```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
    readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
}, AppTypes<...>>> & AccessSchemaOption<...> & HooksSchemaOption<...> & Readonly<...> & AclSchemaOption<...>): DefinedSchema<...>
```
TS7:
```
(method) RulesMethod<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, unknown>.with(rules: PostgresSchemaOption<DefinedSchema<"Todo", {
    readonly title: ScalarField<"string", string, true>;
    readonly archived: ScalarField<"boolean", boolean, true>;
    readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
    readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
    readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
    readonly assignee: PointerField<() => ConfiguredSchema<"TodoUser", {
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
}, AppTypes<...>>> & AccessSchemaOption<...> & HooksSchemaOption<...> & Readonly<...> & AclSchemaOption<...>): DefinedSchema<...>
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

### factory schema constant (TodoUser)

TS6:
```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        readonly status: ScalarField<"enum", "open" | "doing" | "done", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```
TS7:
```
const TodoUser: ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
        readonly status: ScalarField<"enum", "doing" | "done" | "open", true>;
        readonly assignee: PointerField<...>;
        readonly parent: PointerField<...>;
        readonly subtasks: RelationField<...>;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>
```

### role where (two factories)

TS6:
```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "low" | "normal" | "high", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>>>
```
TS7:
```
(parameter) where: WhereBuilder<DefinedSchema<"TodoRole", {
    readonly description: ScalarField<"string", string, false>;
} & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", {
    readonly displayName: ScalarField<"string", string, true>;
    readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", {
        readonly title: ScalarField<"string", string, true>;
        readonly archived: ScalarField<"boolean", boolean, true>;
        readonly priority: ScalarField<"enum", "high" | "low" | "normal", false>;
        readonly allowedPriorities: ScalarField<"enumList", readonly ("high" | "low" | "normal")[], false>;
        ... 4 more ...;
        readonly tags: RelationField<...>;
    } & {
        ...;
    }, AppTypes<...>>, "assignee">;
} & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & {
    ...;
}>>, AppTypes<...>>>
```

## Completions

- rules entry (empty .with({})): TS6 4, TS7 4, DIFF (only TS6: access, acl, hooks, postgres; only TS7: access?, acl?, hooks?, postgres?)
- define declaration keys: TS6 1, TS7 1, same
- after define(...). (discover): TS6 5, TS7 6, DIFF (only TS6: -; only TS7: ~fields)
- App.: TS6 13, TS7 14, DIFF (only TS6: -; only TS7: Symbol)
- after define(...).: TS6 5, TS7 6, DIFF (only TS6: -; only TS7: ~fields)
- after .softDelete().: TS6 4, TS7 5, DIFF (only TS6: -; only TS7: ~fields)

## Cases

| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |
| --- | --- | --- | --- | --- | --- | --- |
| 1 relation target typo | 3/3 | yes/yes | 2552/2552 | 52/52 | yes | yes |
| 2 local where typo | 1/1 | yes/yes | 2345/2345 | 89/89 | yes | yes |
| 3 cross-schema field typo (object filter) | 1/1 | yes/yes | 2561/2561 | 136/136 | yes | yes |
| 4 plugin field typo in hook | 1/1 | yes/yes | 2551/2551 | 392/291 | NO | yes |
| 5 mappedBy typo | 1/1 | no/no | 2322/2322 | 1158/1612 | NO | yes |
| 6 rules key typo | 5/5 | yes/yes | 2561/2561 | 261/261 | yes | yes |
| 7 wrong filter return | 1/1 | yes/yes | 2322/2322 | 68/68 | yes | yes |
| 8 query select typo | 1/1 | yes/yes | 2561/2561 | 421/424 | NO | yes |
| extra cross-schema builder typo | 1/1 | yes/yes | 2345/2345 | 91/91 | yes | yes |
| extra cross callback returns the wrong schema | 1/1 | yes/yes | 2322/2322 | 143/143 | yes | yes |
| extra field hook returns a number | 1/1 | yes/yes | 2322/2322 | 184/184 | yes | yes |
| extra field hook key typo | 2/2 | yes/yes | 2561/2561 | 152/152 | yes | yes |
| extra index on unknown field | 1/1 | yes/yes | 2820/2820 | 91/91 | yes | yes |
| extra hook item is readonly | 1/1 | yes/yes | 2540/2540 | 60/60 | yes | yes |
| extra softDelete called twice | 16/16 | no/no | 2339/2339 | 358/361 | NO | yes |
| extra shape method after .with | 25/25 | yes/yes | 2339/2339 | 368/368 | yes | yes |
| extra second role schema registered | 2/2 | yes/yes | 2322/2322 | 1165/1626 | NO | yes |
| extra role schema missing | 1/1 | yes/yes | 2345/2345 | 1198/1198 | yes | yes |
| extra Register removed (plain D) | 0/0 | no/no | -/- | -/- | yes | yes |
| extra field option wrong value (required: 'yes') | 3/3 | yes/yes | 2322/2322 | 62/62 | yes | yes |
| extra className not a string | 26/26 | yes/yes | 2322/2322 | 49/49 | yes | yes |

### 4 plugin field typo in hook

TS6 (src/todo.ts:33):
```
Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; id: string; assignee: PointerRef | null; parent: PointerRef | null; createdAt: Date; updatedAt: Date; title: string; archived: boolean; priority: "low" | ... 2 more ... | null; allowedPriorities: readonly ("low" | ... 1 more ... | "high")[] | null; status: "open" | ... 1 more ... | "done"; isDel...'. Did you mean 'isDeleted'?
```
TS7 (src/todo.ts:33):
```
Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; allowedPriorities: readonly ("high" | "low" | "normal")[] | null; archived: boolean; assignee: PointerRef | null; createdAt: Date; id: string; isDeleted: boolean; ... 4 more ...; updatedAt: Date; }>'. Did you mean 'isDeleted'?
```

### 5 mappedBy typo

TS6 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...'.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
```
TS7 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...'.
  Type 'ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordU...' is not assignable to type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
    Property ''~error'' is missing in type 'DefinedSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<() => DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; ... 7 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>, "asignee">; } & PasswordUser...' but required in type 'SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'.
```

### 8 query select typo

TS6 (src/usage.ts:57):
```
Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. Did you mean to write 'title'?
```
TS7 (src/usage.ts:57):
```
Object literal may only specify known properties, but 'titel' does not exist in type 'Select<DefinedSchema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>>>'. Did you mean to write 'title'?
```

### extra softDelete called twice

TS6 (src/todo.ts:22):
```
Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "low" | ... 1 more ... | "high", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
```
TS7 (src/todo.ts:22):
```
Property 'softDelete' does not exist on type 'Schema<"Todo", { readonly title: ScalarField<"string", string, true>; readonly archived: ScalarField<"boolean", boolean, true>; readonly priority: ScalarField<"enum", "high" | ... 1 more ... | "normal", false>; ... 5 more ...; readonly tags: RelationField<...>; } & { ...; }, AppTypes<...>, "softDelete", unknown>'.
```

### extra second role schema registered

TS6 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......'.
  Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
```
TS7 (src/ultimabase.ts:9):
```
Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......'.
  Type 'ConfiguredSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ...' is not assignable to type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
    Property ''~error'' is missing in type 'DefinedSchema<"TodoRole", { readonly description: ScalarField<"string", string, false>; } & RoleOwnedFields<() => ConfiguredSchema<"TodoUser", { readonly displayName: ScalarField<"string", string, true>; readonly assignedTodos: RelationField<...>; } & PasswordUserOwnedFields, AppTypes<...>, PasswordUserModel & { ......' but required in type 'SchemaRegistrationError<"TodoRole: factory 'RoleSchema' already created another registered schema">'.
```
