import type { SchemaDefinition, SchemaReference } from './definition.js'

declare const deferredSchemaTargetType: unique symbol

/**
 * Retains the type of one relationship target thunk (`() => User`) without
 * evaluating its return type. Inferring the returned schema while the declaring
 * schema is still being typed creates an initializer cycle (TS7022) between
 * mutually related schemas, so Core reads the thunk only from lazy positions
 * such as filters, inclusions, query results, and rules (ADR-0297).
 */
export interface DeferredSchemaTarget<TThunk> extends SchemaDefinition {
	readonly [deferredSchemaTargetType]: TThunk
}

/** Resolves one deferred relationship target to the schema its thunk returns. */
export type ResolveSchemaTarget<TTarget> =
	TTarget extends DeferredSchemaTarget<infer TThunk>
		? TThunk extends () => infer TSchema
			? TSchema
			: never
		: TTarget

/**
 * Captures one declared relationship target: a schema name keeps the named
 * contract, and a thunk stays deferred until a lazy position reads it.
 */
export type DeclaredSchemaTarget<TTarget> = TTarget extends string
	? SchemaReference<TTarget>
	: DeferredSchemaTarget<TTarget>
