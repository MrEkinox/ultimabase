import { TodoUser } from './todo-user.ts';
declare const TodoRole_base: import("@ultimabase/core").Schema<"TodoRole", {
    readonly description: import("@ultimabase/core").ScalarField<"string", string, false>;
} & import("@ultimabase/core/plugins").RoleOwnedFields<() => typeof TodoUser>, import("@ultimabase/core").AppTypes<readonly [import("@ultimabase/core/plugins").PostgresSchemaOptions, import("@ultimabase/core/plugins").AccessSchemaOptions, import("@ultimabase/core/plugins").HooksSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core/plugins").AclSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core").NoSchemaOptions], Readonly<Record<never, never>> & object & {
    readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
}, Readonly<Record<never, never>> & object & import("@ultimabase/core/plugins").SoftDeleteShapes>, never, import("@ultimabase/core/plugins").RoleModel & {
    readonly '~factory': "RoleSchema";
}>;
export declare class TodoRole extends TodoRole_base {
    static rules: import("@ultimabase/core").SchemaRules<typeof TodoRole>;
}
export {};
