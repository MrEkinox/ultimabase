import {
	defineDatabaseConstraintCompiler,
	type DatabaseConstraintCompilerDefinition,
	type DatabaseConstraintPayload,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { or, sql as drizzleSql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/contracts.js'

declare const postgresConstraintFieldType: unique symbol
declare const postgresConstraintPredicateType: unique symbol
declare const postgresConstraintPayloadType: unique symbol

/** Represents one schema field without exposing its Drizzle column. */
export interface PostgresConstraintField {
	readonly [postgresConstraintFieldType]: true
}

/** Represents parameterized PostgreSQL SQL without exposing raw SQL or Drizzle. */
export interface PostgresConstraintPredicate {
	readonly [postgresConstraintPredicateType]: true
}

/** Lists the only values accepted inside the safe PostgreSQL template tag. */
export type PostgresConstraintInterpolation =
	DatabaseConstraintPayload | PostgresConstraintField

/** Builds one opaque predicate and parameterizes every non-field interpolation. */
export type PostgresConstraintSqlTag = (
	strings: TemplateStringsArray,
	...values: readonly PostgresConstraintInterpolation[]
) => PostgresConstraintPredicate

/** Supplies a decoded payload and safe schema-aware SQL primitives. */
export interface PostgresConstraintCompileContext<
	TPayload extends DatabaseConstraintPayload,
> {
	readonly payload: TPayload
	/** Combines one or more protected predicates without exposing SQL objects. */
	readonly anyOf: (
		first: PostgresConstraintPredicate,
		...rest: readonly PostgresConstraintPredicate[]
	) => PostgresConstraintPredicate
	/** Resolves one logical schema field or rejects the constraint before SQL. */
	readonly field: (name: string) => PostgresConstraintField
	/** Parameterizes values while allowing only resolved field references as SQL. */
	readonly sql: PostgresConstraintSqlTag
}

/** Configures one versioned compiler owned by the registering plugin. */
export interface PostgresConstraintCompilerOptions<
	TKind extends string,
	TVersion extends number,
	TPayload extends DatabaseConstraintPayload,
> {
	readonly kind: TKind
	readonly version: TVersion
	/** Validates untrusted portable data and returns its exact compiler type. */
	readonly decode: (payload: DatabaseConstraintPayload) => TPayload
	/** Produces one opaque parameterized predicate without database I/O. */
	readonly compile: (
		context: PostgresConstraintCompileContext<TPayload>,
	) => PostgresConstraintPredicate
}

/** Carries matching metadata while keeping executable callbacks private. */
export type PostgresConstraintCompilerDefinition<
	TKind extends string = string,
	TVersion extends number = number,
	TPayload extends DatabaseConstraintPayload = DatabaseConstraintPayload,
> = DatabaseConstraintCompilerDefinition<'postgres', TKind, TVersion> & {
	readonly [postgresConstraintPayloadType]?: TPayload
}

interface PostgresConstraintCompilerImplementation {
	readonly compile: (
		context: PostgresConstraintCompileContext<DatabaseConstraintPayload>,
	) => PostgresConstraintPredicate
	readonly decode: (
		payload: DatabaseConstraintPayload,
	) => DatabaseConstraintPayload
}

const compilerImplementations = new WeakMap<
	object,
	PostgresConstraintCompilerImplementation
>()
const postgresConstraintFields = new WeakSet<object>()
const optionKeys = new Set(['compile', 'decode', 'kind', 'version'])

const assertCompilerOptions = (options: unknown): void => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'postgres constraint compiler options must be a plain object',
		)
	}

	for (const key of Object.keys(options)) {
		if (!optionKeys.has(key)) {
			throw new TypeError(
				`postgres constraint compiler contains unknown key: ${key}`,
			)
		}
	}

	if (typeof options.decode !== 'function') {
		throw new TypeError(
			'postgres constraint compiler decode must be a function',
		)
	}

	if (typeof options.compile !== 'function') {
		throw new TypeError(
			'postgres constraint compiler compile must be a function',
		)
	}
}

/** Prevents class instances and SQL wrappers from crossing the value boundary. */
const assertPortableParameter: (
	value: unknown,
	path: string,
) => asserts value is DatabaseConstraintPayload = (value, path) => {
	if (
		value === null ||
		typeof value === 'bigint' ||
		typeof value === 'boolean' ||
		typeof value === 'string'
	) {
		return
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError(`${path} must contain only finite numbers`)
		}

		return
	}

	if (isUnknownArray(value)) {
		for (const [index, item] of value.entries()) {
			assertPortableParameter(item, `${path}[${String(index)}]`)
		}

		return
	}

	if (isPlainRecord(value)) {
		for (const [key, item] of Object.entries(value)) {
			assertPortableParameter(item, `${path}.${key}`)
		}

		return
	}

	throw new TypeError(
		`${path} must be a portable scalar, array, or plain-object value`,
	)
}

const createCompileContext = (
	schema: CompiledPostgresSchema,
	payload: DatabaseConstraintPayload,
): Readonly<{
	context: PostgresConstraintCompileContext<DatabaseConstraintPayload>
	readPredicate: (predicate: PostgresConstraintPredicate) => SQL | undefined
}> => {
	const fieldColumns = new WeakMap<object, PgColumn>()
	const predicateExpressions = new WeakMap<object, SQL>()
	const field = (name: string): PostgresConstraintField => {
		if (typeof name !== 'string') {
			throw new TypeError('postgres constraint field name must be a string')
		}

		const reference = immutableRecord({}) as unknown as PostgresConstraintField
		fieldColumns.set(
			reference,
			resolveCompiledPostgresField(schema, name).column,
		)
		postgresConstraintFields.add(reference)

		return reference
	}
	const sql: PostgresConstraintSqlTag = (strings, ...values) => {
		const parameters = values.map((value, index) => {
			const column =
				typeof value === 'object' && value !== null
					? fieldColumns.get(value)
					: undefined

			if (column !== undefined) {
				return column
			}
			if (
				typeof value === 'object' &&
				value !== null &&
				postgresConstraintFields.has(value)
			) {
				throw new TypeError(
					'postgres constraint field belongs to another compile context',
				)
			}

			// SQL wrappers and class instances fail before Drizzle can unwrap them.
			assertPortableParameter(
				value,
				`postgres constraint interpolation[${String(index)}]`,
			)

			return drizzleSql.param(value)
		})
		const expression = drizzleSql(strings, ...parameters)
		const predicate = immutableRecord(
			{},
		) as unknown as PostgresConstraintPredicate

		predicateExpressions.set(predicate, expression)

		return predicate
	}
	const anyOf: PostgresConstraintCompileContext<DatabaseConstraintPayload>['anyOf'] =
		(first, ...rest) => {
			const expressions = [first, ...rest].map((predicate) => {
				const expression = predicateExpressions.get(predicate)

				if (expression === undefined) {
					throw new TypeError(
						'postgres constraint predicate belongs to another compile context',
					)
				}

				return expression
			})
			const expression = or(...expressions)

			if (expression === undefined) {
				throw new TypeError('postgres constraint anyOf requires one predicate')
			}

			const predicate = immutableRecord(
				{},
			) as unknown as PostgresConstraintPredicate

			predicateExpressions.set(predicate, expression)

			return predicate
		}

	return immutableRecord({
		context: immutableRecord({ anyOf, field, payload, sql }),
		readPredicate: (predicate) => predicateExpressions.get(predicate),
	})
}

/**
 * Declares one versioned PostgreSQL constraint compiler.
 *
 * Register the returned definition through `constraintCompilers` during plugin
 * setup. Ownership is derived from that setup context, while this factory keeps
 * decoder and compiler callbacks private.
 *
 * @example
 * ```ts
 * const tenantRows = postgresConstraintCompiler({
 *   kind: 'tenant.rows',
 *   version: 1,
 *   decode: parseTenantPayload,
 *   compile: ({ field, payload, sql }) =>
 *     sql`${field('tenantId')} = ${payload.tenantId}`,
 * })
 * ```
 */
export const postgresConstraintCompiler = <
	const TKind extends string,
	const TVersion extends number,
	const TPayload extends DatabaseConstraintPayload,
>(
	options: PostgresConstraintCompilerOptions<TKind, TVersion, TPayload>,
): PostgresConstraintCompilerDefinition<TKind, TVersion, TPayload> => {
	const untrustedOptions: unknown = options
	assertCompilerOptions(untrustedOptions)
	const definition = defineDatabaseConstraintCompiler({
		adapter: 'postgres',
		kind: options.kind,
		version: options.version,
	}) as PostgresConstraintCompilerDefinition<TKind, TVersion, TPayload>
	const decode = options.decode as (
		payload: DatabaseConstraintPayload,
	) => DatabaseConstraintPayload
	const compile = options.compile as (
		context: PostgresConstraintCompileContext<DatabaseConstraintPayload>,
	) => PostgresConstraintPredicate

	compilerImplementations.set(definition, immutableRecord({ compile, decode }))

	return definition
}

/** Resolves only PostgreSQL definitions produced by the public factory. */
export const getPostgresConstraintCompilerImplementation = (
	value: unknown,
): PostgresConstraintCompilerImplementation | undefined =>
	typeof value === 'object' && value !== null
		? compilerImplementations.get(value)
		: undefined

/** Runs one protected compiler and rejects forged predicate lookalikes. */
export const compilePostgresConstraintPredicate = (
	definition: unknown,
	schema: CompiledPostgresSchema,
	payload: DatabaseConstraintPayload,
): SQL => {
	const implementation = getPostgresConstraintCompilerImplementation(definition)

	if (implementation === undefined) {
		throw new TypeError('Unknown PostgreSQL constraint compiler definition')
	}

	const decoded = implementation.decode(payload)
	const boundary = createCompileContext(schema, decoded)
	const predicate = implementation.compile(boundary.context)
	const expression = boundary.readPredicate(predicate)

	if (expression === undefined) {
		throw new TypeError(
			'PostgreSQL constraint compiler returned an invalid predicate',
		)
	}

	return expression
}
