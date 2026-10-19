import { Todo } from './todo.ts';
declare const Tag_base: import("@ultimabase/core").Schema<"Tag", {
    readonly name: import("@ultimabase/core").ScalarField<"string", string, true>;
    readonly todos: import("@ultimabase/core").RelationField<() => typeof Todo, "tags">;
}, import("@ultimabase/core").AppTypes<readonly [import("@ultimabase/core/plugins").PostgresSchemaOptions, import("@ultimabase/core/plugins").AccessSchemaOptions, import("@ultimabase/core/plugins").HooksSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core/plugins").AclSchemaOptions, import("@ultimabase/core").NoSchemaOptions, import("@ultimabase/core").NoSchemaOptions], Readonly<Record<never, never>> & object & {
    readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
}, Readonly<Record<never, never>> & object & import("@ultimabase/core/plugins").SoftDeleteShapes>, never, unknown>;
export declare class Tag extends Tag_base {
    static rules: import("@ultimabase/core").SchemaRules<typeof Tag>;
}
export {};
