export declare const TodoUser: import("@ultimabase/core").ConfiguredSchema<"TodoUser", {
    readonly displayName: import("@ultimabase/core").ScalarField<"string", string, true>;
    readonly assignedTodos: import("@ultimabase/core").RelationField<() => (abstract new () => {}) & {
        readonly className: "Todo";
        readonly '~fields': Readonly<{
            readonly title: import("@ultimabase/core").ScalarField<"string", string, true>;
            readonly archived: import("@ultimabase/core").ScalarField<"boolean", boolean, true>;
            readonly priority: import("@ultimabase/core").ScalarField<"enum", "low" | "normal" | "high", false>;
            readonly allowedPriorities: import("@ultimabase/core").ScalarField<"enumList", readonly ("low" | "normal" | "high")[], false>;
            readonly status: import("@ultimabase/core").ScalarField<"enum", "open" | "doing" | "done", true>;
            readonly assignee: import("@ultimabase/core").PointerField<() => import("@ultimabase/core").ConfiguredSchema<"TodoUser", /*elided*/ any & import("@ultimabase/core/plugins").PasswordUserOwnedFields, import("@ultimabase/core").AppTypes<readonly [import("@ultimabase/core/plugins").PostgresSchemaOptions, import("@ultimabase/core/plugins").AccessSchemaOptions, import("@ultimabase/core/plugins").HooksSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core/plugins").AclSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core").NoSchemaOptions], Readonly<Record<never, never>> & object & {
                readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
            }, Readonly<Record<never, never>> & object & import("@ultimabase/core/plugins").SoftDeleteShapes>, import("@ultimabase/core/plugins").PasswordUserModel & {
                readonly '~factory': "PasswordUserSchema";
            }>, false>;
            readonly parent: import("@ultimabase/core").PointerField<() => /*elided*/ any, false>;
            readonly subtasks: import("@ultimabase/core").RelationField<() => /*elided*/ any, "parent">;
            readonly tags: import("@ultimabase/core").RelationField<() => (abstract new () => {}) & {
                readonly className: "Tag";
                readonly '~fields': Readonly<{
                    readonly name: import("@ultimabase/core").ScalarField<"string", string, true>;
                    readonly todos: import("@ultimabase/core").RelationField<() => /*elided*/ any, "tags">;
                } & import("@ultimabase/core").SystemFields & Readonly<Record<never, never>> & object & {
                    readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
                }>;
                readonly findMany: import("@ultimabase/core").SchemaQueries["findMany"];
                readonly findOne: import("@ultimabase/core").SchemaQueries["findOne"];
                readonly createOne: import("@ultimabase/core").SchemaQueries["createOne"];
            }, undefined>;
        } & {
            readonly isDeleted: import("@ultimabase/core").ScalarField<"boolean", boolean, true>;
        } & import("@ultimabase/core").SystemFields & Readonly<Record<never, never>> & object & {
            readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
        }>;
        readonly findMany: import("@ultimabase/core").SchemaQueries["findMany"];
        readonly findOne: import("@ultimabase/core").SchemaQueries["findOne"];
        readonly createOne: import("@ultimabase/core").SchemaQueries["createOne"];
    }, "assignee">;
} & import("@ultimabase/core/plugins").PasswordUserOwnedFields, import("@ultimabase/core").AppTypes<readonly [import("@ultimabase/core/plugins").PostgresSchemaOptions, import("@ultimabase/core/plugins").AccessSchemaOptions, import("@ultimabase/core/plugins").HooksSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core/plugins").AclSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core").NoSchemaOptions], Readonly<Record<never, never>> & object & {
    readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
}, Readonly<Record<never, never>> & object & import("@ultimabase/core/plugins").SoftDeleteShapes>, import("@ultimabase/core/plugins").PasswordUserModel & {
    readonly '~factory': "PasswordUserSchema";
}>;
