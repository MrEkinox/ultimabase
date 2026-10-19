import { Todo } from './todo.ts';
declare const TodoUser_base: import("@ultimabase/core").Schema<"TodoUser", {
    readonly displayName: import("@ultimabase/core").ScalarField<"string", string, true>;
    readonly assignedTodos: import("@ultimabase/core").RelationField<() => typeof Todo, "assignee">;
} & import("@ultimabase/core/plugins").PasswordUserOwnedFields, import("@ultimabase/core").AppTypes<readonly [import("@ultimabase/core/plugins").PostgresSchemaOptions, import("@ultimabase/core/plugins").AccessSchemaOptions, import("@ultimabase/core/plugins").HooksSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core/plugins").AclSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core").NoSchemaOptions], Readonly<Record<never, never>> & object & {
    readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
}, Readonly<Record<never, never>> & object & import("@ultimabase/core/plugins").SoftDeleteShapes>, never, import("@ultimabase/core/plugins").PasswordUserModel & {
    readonly '~factory': "PasswordUserSchema";
}>;
export declare class TodoUser extends TodoUser_base {
    static rules: import("@ultimabase/core").SchemaRules<typeof TodoUser>;
}
export {};
