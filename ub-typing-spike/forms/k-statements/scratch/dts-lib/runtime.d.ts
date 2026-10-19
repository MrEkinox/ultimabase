export interface RuntimeField {
    readonly kind: string;
    readonly options: Readonly<Record<string, unknown>>;
}
export type RuntimeFields = Readonly<Record<string, RuntimeField>>;
/** Factory of one plugin schema kind (`App.RoleSchema`). */
export interface RuntimeSchemaFactory {
    /** `one`: exactly one registered schema of this factory per application. */
    readonly cardinality: 'one' | 'many';
    /** Turns the factory declaration into an ordinary declaration plus model methods. */
    readonly prepare: (declaration: Readonly<Record<string, unknown>>) => {
        readonly declaration: Readonly<Record<string, unknown>>;
        readonly ownedFields: (field: RuntimeFieldBuilder) => RuntimeFields;
        readonly model: Readonly<Record<string, (...args: readonly unknown[]) => unknown>>;
    };
}
/** Runtime part of one plugin definition. */
export interface RuntimePlugin {
    readonly id: string;
    /** Rule keys of this plugin; each becomes a schema statement (`Todo.access({ ... })`). */
    readonly ruleKeys?: readonly string[];
    /** Keys this plugin accepts in `Schema.define({ ... })` (shape options). */
    readonly shapeOptions?: readonly string[];
    /** Fields added from the declared shape options. */
    readonly shapeFields?: (declaration: Readonly<Record<string, unknown>>, field: RuntimeFieldBuilder) => RuntimeFields;
    /** Fields added to every schema. */
    readonly fields?: (field: RuntimeFieldBuilder) => RuntimeFields;
    readonly factories?: Readonly<Record<string, RuntimeSchemaFactory>>;
}
export type RuntimeFieldBuilder = Readonly<Record<string, (...args: readonly unknown[]) => RuntimeField>>;
export declare const fieldBuilder: RuntimeFieldBuilder;
export interface RuntimeSchema {
    readonly className: string;
    readonly fields: RuntimeFields;
    readonly shape: Readonly<Record<string, unknown>>;
    readonly factory: string | undefined;
}
/** One recorded rule statement. */
export interface RuntimeRule {
    readonly value: unknown;
    readonly declaredAt: string;
}
export declare class RegistrationError extends Error {
    readonly name = "RegistrationError";
}
/** What the application collected for one schema. */
export interface RuntimeRegistrationEntry {
    readonly schema: RuntimeSchema;
    readonly className: string;
    readonly fields: Readonly<Record<string, string>>;
    readonly shape: Readonly<Record<string, unknown>>;
    readonly factory: string | undefined;
    readonly rules: Readonly<Record<string, {
        readonly plugin: string | undefined;
        readonly value: unknown;
    }>>;
}
export type RuntimeRegistration = readonly RuntimeRegistrationEntry[];
/** Runtime of `UltimaBase.use(...)`: a constructible application class with schema namespaces. */
export declare const createFactory: (plugins: readonly RuntimePlugin[]) => object;
