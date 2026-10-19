export declare const Note: (abstract new () => {}) & {
    readonly className: "Note";
    readonly '~fields': Readonly<{
        readonly body: import("@ultimabase/core").ScalarField<"string", string, false>;
    } & import("@ultimabase/core").SystemFields & Readonly<Record<never, never>> & object & {
        readonly acl: import("@ultimabase/core").ScalarField<"json", import("@ultimabase/core/plugins").ACL, true>;
    }>;
    readonly findMany: import("@ultimabase/core").SchemaQueries["findMany"];
    readonly findOne: import("@ultimabase/core").SchemaQueries["findOne"];
    readonly createOne: import("@ultimabase/core").SchemaQueries["createOne"];
};
