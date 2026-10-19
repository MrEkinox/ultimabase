import { TodoUser } from './todo-user.ts';
export declare const AdminRole: import("@ultimabase/core").Schema<"AdminRole", Readonly<Record<never, never>> & import("@ultimabase/core/plugins").RoleOwnedFields<() => typeof TodoUser>, import("@ultimabase/core").AppTypes<readonly [import("@ultimabase/core/plugins").PostgresSchemaOptions, import("@ultimabase/core/plugins").AccessSchemaOptions, import("@ultimabase/core/plugins").HooksSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core/plugins").AclSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core").NoSchemaOptions], Readonly<Record<never, never>> & object & {
    readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
}, Readonly<Record<never, never>> & object & import("@ultimabase/core/plugins").SoftDeleteShapes>, never, import("@ultimabase/core/plugins").RoleModel & {
    readonly '~factory': "RoleSchema";
}>;
