// `definePlugin` (ADR-0316): one declarative object instead of selectors,
// patches, source templates and contribution identifiers. It is built only on
// Core's public plugin-author contracts; Core still owns manifests, derived
// privileges, slot evaluation, Runtime order and transactions.
import {
	getOperationSchema,
	provideRuntimeBehavior,
	Schema,
} from '@ultimabase/core'
import {
	addSchemaField,
	contributeDeclarations,
	defineSchemaOption,
	plugin,
	provideSchemaFeatures,
	provideSchemaPermissions,
	provideSchemaRules,
	readSchemaRules,
	type PluginContribution,
	type PluginModelContributionContext,
	type PluginSchemaContributionContext,
	type PluginSchemaRulesSource,
	type PluginSchemaShapeSource,
	type SchemaOptionDefinition,
	type SchemaRulesHKT,
	type SchemaShapeMethod,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { createCommand, type GeneratedCommand } from './commands.js'
import type { ShapeMethodDefinition, Validator } from './shape.js'
import type {
	DefinedPlugin,
	DefinedPluginSource,
	RuleValidators,
	RuleValues,
	RuleValuesOf,
	ShapeMethods,
} from './types.js'

/** Data passed to `afterCommit` after each committed write. */
export interface CommitInput<TRules extends RuleValues> {
	/** The written schema. */
	readonly className: string
	/** The operation kind (`create-one`, `update-many`…) or the plugin command (`restoreOne`). */
	readonly operation: string
	/** The request identifier, for correlation in logs. */
	readonly requestId: string
	/**
	 * This plugin's `.with({ ... })` entries on the written schema, as their
	 * validators returned them when the application compiled.
	 */
	readonly rules: { readonly [TKey in keyof TRules]?: unknown }
}

/** Declares one plugin (see {@link definePlugin}). */
export interface DefinePluginOptions<
	TName extends string,
	TShape extends ShapeMethods,
	TValidators extends RuleValidators,
> {
	/** The npm package name: plugin identity, log prefix and command namespace. */
	readonly name: TName
	/**
	 * The package version recorded in provenance.
	 * @default "0.0.0"
	 */
	readonly version?: string
	/**
	 * Features, made with `feature(...)`: keys of `define` (static, they may
	 * add fields and commands), such as `archivable: true` (ADR-0339).
	 */
	readonly features?: TShape
	/**
	 * Shape methods chained before `.with(...)`.
	 * @deprecated Use `features` (ADR-0339); removed with the shape methods.
	 */
	readonly shape?: TShape
	/**
	 * Rules, each with its validator: the methods of
	 * `.with((plugins) => plugins.audit(true))`, which may hold callbacks
	 * typed against the completed schema (ADR-0339).
	 */
	readonly rules?: TValidators
	/** Runs after each committed write, outside the transaction. */
	readonly afterCommit?: (
		input: CommitInput<RuleValuesOf<TValidators>>,
	) => void | Promise<void>
	/** Raw Core contributions, or a transport plugin's helper such as `httpRoutes(...)`. */
	readonly contributions?: readonly PluginContribution[]
}

const definitionKeys = new Set([
	'afterCommit',
	'contributions',
	'features',
	'name',
	'rules',
	'shape',
	'version',
])
const methodNamePattern = /^[A-Za-z_$][\w$]*$/u
const readOperations: ReadonlySet<string> = new Set([
	'count',
	'exists',
	'find-many',
	'find-one',
	'get',
])

const assertDefinition = (definition: unknown): void => {
	if (!isPlainRecord(definition)) {
		throw new TypeError('definePlugin options must be a plain object')
	}
	const unknownKey = Object.keys(definition).find(
		(key) => !definitionKeys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown definePlugin option: ${unknownKey}`)
	}
	if (definition.features !== undefined && definition.shape !== undefined) {
		throw new TypeError(
			'definePlugin takes features or its deprecated alias shape, not both',
		)
	}
	for (const key of ['features', 'shape', 'rules'] as const) {
		const value = definition[key]
		if (value !== undefined && !isPlainRecord(value)) {
			throw new TypeError(`definePlugin ${key} must be a plain object`)
		}
	}
	if (
		definition.afterCommit !== undefined &&
		typeof definition.afterCommit !== 'function'
	) {
		throw new TypeError('definePlugin afterCommit must be a function')
	}
	if (
		definition.contributions !== undefined &&
		!Array.isArray(definition.contributions)
	) {
		throw new TypeError('definePlugin contributions must be an array')
	}
}

// A method called without its options object is validated as `{}`.
const normalizeShapeOptions =
	(method: string, validate: Validator<object> | undefined) =>
	(value: unknown, path: string): unknown => {
		if (validate !== undefined) return validate(value, path)
		if (!isPlainRecord(value) || Object.keys(value).length > 0) {
			throw new TypeError(`${path}: .${method}() takes no options`)
		}
		return immutableRecord({})
	}

const declareSchemas =
	(
		shape: readonly (readonly [string, ShapeMethodDefinition])[],
		rules: readonly (readonly [string, Validator<unknown>])[],
	) =>
	({ schemas }: PluginSchemaContributionContext): undefined => {
		schemas.defineOptions({
			contributionId: 'options',
			schema: Object.fromEntries([
				...shape.map(
					([method, definition]): [string, SchemaOptionDefinition] => [
						method,
						defineSchemaOption({
							normalize: normalizeShapeOptions(method, definition.options),
							protocolVersion: 1,
							valueKind: 'opaque',
						}),
					],
				),
				...rules.map(([name, validate]): [string, SchemaOptionDefinition] => [
					name,
					defineSchemaOption({
						normalize: validate,
						protocolVersion: 1,
						valueKind: 'opaque',
					}),
				]),
			]),
		})
		for (const [method, definition] of shape) {
			const operations = Object.entries(definition.fields ?? {}).map(
				([name, field]) =>
					addSchemaField({
						contributionId: `${method}.${name}`,
						field,
						mutationInput: 'forbidden',
						name,
					}),
			)
			if (operations.length === 0) continue
			schemas.patch({
				operations,
				targets: schemas.select({
					option: { name: method },
					owner: { kind: 'application' },
				}),
			})
		}
		return undefined
	}

const extendModels =
	(commands: readonly GeneratedCommand[]) =>
	({ models }: PluginModelContributionContext): undefined => {
		for (const method of new Set(commands.map((entry) => entry.method))) {
			models.extend(
				{ option: { name: method }, owner: { kind: 'application' } },
				{
					contributionId: `${method}.commands`,
					schemaMutations: Object.fromEntries(
						commands
							.filter((generated) => generated.method === method)
							.map(({ command, mutation }) => [
								command,
								{ mutation, surfaces: ['schema'] as const },
							]),
					),
				},
			)
		}
		return undefined
	}

// `models` is declared only with commands: Core derives `model:extend` from it.
const createDeclarations = (
	shape: readonly (readonly [string, ShapeMethodDefinition])[],
	rules: readonly (readonly [string, Validator<unknown>])[],
	commands: readonly GeneratedCommand[],
) =>
	commands.length === 0
		? contributeDeclarations({ schema: declareSchemas(shape, rules) })
		: contributeDeclarations({
				schema: declareSchemas(shape, rules),
				models: extendModels(commands),
			})

const createAfterCommit = <TRules extends RuleValues>(
	afterCommit: (input: CommitInput<TRules>) => void | Promise<void>,
	ruleNames: ReadonlySet<string>,
) =>
	provideRuntimeBehavior({
		contributionId: 'after-commit',
		create: ({ owner }) => ({
			value: {
				postCommit: async ({ context, operation }) => {
					if (readOperations.has(operation.kind)) return
					const schema = getOperationSchema(operation)
					if (!Schema.is(schema)) return
					// Shape-method values share the option namespace; only rules are passed.
					const rules: Readonly<Record<string, unknown>> = Object.fromEntries(
						Object.entries(readSchemaRules(schema, owner)).filter(([name]) =>
							ruleNames.has(name),
						),
					)
					await afterCommit({
						className: schema.className,
						operation:
							operation.kind === 'plugin-schema-mutation'
								? operation.command
								: operation.kind,
						requestId: context.requestId,
						rules,
					})
				},
			},
		}),
	})

// Each schema whose declaration called a shape method gets its permissions.
const createPermissions = (
	shape: readonly (readonly [string, ShapeMethodDefinition])[],
) => {
	const declared = shape.flatMap(([method, { permissions = [] }]) =>
		permissions.map((permission) => [method, permission] as const),
	)
	return declared.length === 0
		? []
		: [
				provideSchemaPermissions({
					contributionId: 'permissions',
					create: ({ owner, schemas }) => ({
						value: schemas.values().flatMap((schema) => {
							const rules = readSchemaRules(schema, owner)
							return declared
								.filter(([method]) => rules[method] !== undefined)
								.map(([, permission]) => ({ permission, schema }))
						}),
					}),
				}),
			]
}

// Shape methods are applied at Runtime under one wide signature; their exact
// typed signatures come from the plugin's static source.
type RuntimeShapeSource = PluginSchemaShapeSource<
	Readonly<
		Record<
			string,
			SchemaShapeMethod<
				readonly [options?: unknown],
				Readonly<Record<string, object>>,
				string
			>
		>
	>
>

// Rule names are declared under one wide source; their typed rules come from
// the plugin's static source.
type RuntimeRulesSource = PluginSchemaRulesSource<WideRules>

interface WideRules extends SchemaRulesHKT {
	readonly rules: Readonly<Record<string, unknown>>
}

/**
 * Defines one plugin from a declarative object: features (`define` keys)
 * with their fields and commands, rules (`.with((plugins) => …)` methods), a
 * post-commit callback and raw contributions. Core derives the privileges.
 *
 * @example
 * ```ts
 * export const auditPlugin = () =>
 *   definePlugin({
 *     name: '@community/audit',
 *     rules: { audit: (value, path) => { if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean`); return value } },
 *     afterCommit: ({ className, operation, rules }) => {
 *       if (rules.audit === true) console.info(`[audit] ${className} ${operation}`)
 *     },
 *   })
 * ```
 */
export const definePlugin = <
	const TName extends string,
	const TShape extends ShapeMethods = Readonly<Record<never, never>>,
	// The constraint as default: a narrower one would hide the validators'
	// contextual parameter types.
	const TValidators extends RuleValidators = RuleValidators,
>(
	definition: DefinePluginOptions<TName, TShape, TValidators>,
): DefinedPlugin<TName, TShape, RuleValuesOf<TValidators>> => {
	assertDefinition(definition)
	const shape = Object.entries<ShapeMethodDefinition>(
		definition.features ?? definition.shape ?? {},
	)
	const rules = Object.entries<Validator<unknown>>(definition.rules ?? {})
	for (const [method] of shape) {
		if (!methodNamePattern.test(method) || method === 'with') {
			throw new TypeError(`Invalid shape method name: ${method}`)
		}
	}
	for (const [method, { requires = [] }] of shape) {
		const unknownRule = requires.find(
			(name) => !rules.some(([rule]) => rule === name),
		)
		if (unknownRule !== undefined) {
			throw new TypeError(
				`Feature ${method} requires ${unknownRule}, which is not a rule of this plugin`,
			)
		}
	}
	const duplicate = rules.find(([name]) =>
		shape.some(([method]) => method === name),
	)
	if (duplicate !== undefined) {
		throw new TypeError(`Rule ${duplicate[0]} is also a shape method`)
	}
	const commands = shape.flatMap(([method, { commands: declared = {} }]) =>
		Object.entries(declared).map(([name, command]) =>
			createCommand(definition.name, method, name, command),
		),
	)
	const instance = plugin<
		TName,
		undefined,
		string,
		'^0.0.0',
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		readonly PluginContribution[],
		DefinedPluginSource<TShape, RuleValuesOf<TValidators>>
	>({
		id: definition.name,
		version: definition.version ?? '0.0.0',
		core: '^0.0.0',
		contributions: [
			...(shape.length + rules.length === 0
				? []
				: [createDeclarations(shape, rules, commands)]),
			...commands.map(({ contribution }) => contribution),
			...createPermissions(shape),
			...(definition.afterCommit === undefined
				? []
				: [
						createAfterCommit(
							definition.afterCommit,
							new Set(rules.map(([name]) => name)),
						),
					]),
			...(definition.contributions ?? []),
		],
	})
	// `.with((plugins) => plugins.audit(…))`: the rule names, known now (ADR-0339).
	const withRules =
		rules.length === 0
			? instance
			: provideSchemaRules<typeof instance, RuntimeRulesSource>(
					instance,
					rules.map(([name]) => name),
				)
	if (shape.length === 0) return withRules
	return provideSchemaFeatures<typeof instance, RuntimeShapeSource>(
		withRules,
		Object.fromEntries(
			shape.map(([method, { requires = [] }]) => [
				method,
				{
					sets: [method],
					apply: (options?: unknown) =>
						Object.fromEntries([[method, options ?? {}]]),
					requires,
				},
			]),
		),
	)
}
