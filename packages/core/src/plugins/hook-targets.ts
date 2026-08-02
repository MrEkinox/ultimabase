import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	Schema,
	type ExtensionDefinition,
	type FieldExtension,
	type GenericField,
	type SchemaDefinition,
	type SchemaExtension,
} from '../schema/index.js'
import type { FieldHooks } from '../schema/hooks/field-contracts.js'
import {
	normalizeFieldHookDeclarations,
	type FieldHookDeclarations,
} from '../schema/hooks/field-declarations.js'
import type {
	FieldAtPath,
	SchemaFieldPath,
} from '../schema/hooks/field-paths.js'
import { resolveSchemaFieldPath } from '../schema/hooks/field-paths.js'
import type { SchemaHooks } from '../schema/hooks/contracts.js'
import {
	normalizeSchemaHookDeclarations,
	type SchemaHookDeclarations,
} from '../schema/hooks/declarations.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from '../schema/fields/base/kinds.js'
import { collectFieldTraversalEntries } from '../schema/fields/traversal.js'
import type { SchemaRegistry } from '../schema/schema/registry.js'
import type { PluginContribution } from './setup-registries.js'

/** Identifies the six declaration scopes available to plugin-owned native hooks. */
export type PluginHookTargetKind =
	| 'field'
	| 'field-extension'
	| 'field-kind'
	| 'global'
	| 'schema'
	| 'schema-extension'

/** Retains one exact custom field contract behind a reusable kind selector. */
export interface FieldKindHookTarget<TField extends GenericField> {
	/** The namespaced field kind exported by its owning plugin package. */
	readonly kind: TField['kind']
}

const fieldKindTargets = new WeakSet<object>()

/**
 * Creates a typed selector for every field carrying one community field kind.
 *
 * The field package should export this token beside its field factory so hook
 * handlers retain the same logical value type.
 *
 * @example
 * ```ts
 * const vectorHookTarget =
 *   defineFieldKindHookTarget<VectorField>('pg-vector.vector')
 * ```
 */
export const defineFieldKindHookTarget = <TField extends GenericField>(
	kind: AvailablePluginFieldKind<TField['kind']>,
): FieldKindHookTarget<TField> => {
	assertPluginFieldKind(kind, 'field hook target kind')
	const target = immutableRecord({ kind })
	fieldKindTargets.add(target)

	return target
}

/** Supplies the schema and exact matched extension to a hook factory. */
export interface SchemaExtensionHookTargetContext<
	TExtension extends SchemaExtension<string, object>,
> {
	readonly extension: TExtension
	readonly schema: SchemaDefinition
}

/** Supplies one matched field extension without leaking its config into hook inputs. */
export interface FieldExtensionHookTargetContext<
	TExtension extends FieldExtension<string, object>,
> {
	readonly extension: TExtension
	readonly field: GenericField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

/** Supplies one exact field matched by a typed namespaced-kind selector. */
export interface FieldKindHookTargetContext<TField extends GenericField> {
	readonly field: TField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

export type SchemaExtensionHookFactory<
	TExtension extends SchemaExtension<string, object>,
> = (
	context: SchemaExtensionHookTargetContext<TExtension>,
) => SchemaHooks<SchemaDefinition>

export type FieldExtensionHookFactory<
	TExtension extends FieldExtension<string, object>,
> = (
	context: FieldExtensionHookTargetContext<TExtension>,
) => FieldHooks<GenericField>

export type FieldKindHookFactory<TField extends GenericField> = (
	context: FieldKindHookTargetContext<TField>,
) => FieldHooks<TField>

/** Adds owner-bound native hook declarations during the plugin setup phase. */
export interface PluginHookRegistry {
	/** Appends schema hooks to every schema owned by this application. */
	global(name: string, hooks: SchemaHooks<SchemaDefinition>): void
	/** Appends schema hooks to one exact application-owned Schema instance. */
	schema<TSchema extends SchemaDefinition>(
		name: string,
		schema: TSchema,
		hooks: SchemaHooks<NoInfer<TSchema>>,
	): void
	/** Appends exact-value hooks to one typed nested field path. */
	field<
		TSchema extends SchemaDefinition,
		const TPath extends SchemaFieldPath<TSchema>,
	>(
		name: string,
		schema: TSchema,
		path: TPath,
		hooks: FieldHooks<NoInfer<FieldAtPath<TSchema, TPath>>>,
	): void
	/** Expands hooks over schemas carrying one extension owned by this plugin. */
	schemaExtension<TExtension extends SchemaExtension<string, object>>(
		name: string,
		extension: TExtension,
		factory: SchemaExtensionHookFactory<NoInfer<TExtension>>,
	): void
	/** Expands hooks over fields carrying one extension owned by this plugin. */
	fieldExtension<TExtension extends FieldExtension<string, object>>(
		name: string,
		extension: TExtension,
		factory: FieldExtensionHookFactory<NoInfer<TExtension>>,
	): void
	/** Expands exact-value hooks over one typed namespaced community field kind. */
	fieldKind<TField extends GenericField>(
		name: string,
		target: FieldKindHookTarget<TField>,
		factory: FieldKindHookFactory<NoInfer<TField>>,
	): void
}

interface BaseHookRegistration {
	readonly localName: string
	readonly ownerPlugin: string
	readonly targetKind: PluginHookTargetKind
}

// Public factories are type-checked before this private execution-only erasure.
type ErasedHookFactory = (context: never) => unknown

const runHookFactory = (factory: ErasedHookFactory, context: object): unknown =>
	factory(context as never)

interface GlobalHookRegistration extends BaseHookRegistration {
	readonly declarations: SchemaHookDeclarations
	readonly targetKind: 'global'
}

interface SchemaHookRegistration extends BaseHookRegistration {
	readonly declarations: SchemaHookDeclarations
	readonly schema: SchemaDefinition
	readonly targetKind: 'schema'
}

interface FieldHookRegistration extends BaseHookRegistration {
	readonly declarations: FieldHookDeclarations
	readonly path: readonly [string, ...string[]]
	readonly schema: SchemaDefinition
	readonly targetKind: 'field'
}

interface SchemaExtensionHookRegistration extends BaseHookRegistration {
	readonly extension: SchemaExtension<string, object>
	readonly factory: ErasedHookFactory
	readonly targetKind: 'schema-extension'
}

interface FieldExtensionHookRegistration extends BaseHookRegistration {
	readonly extension: FieldExtension<string, object>
	readonly factory: ErasedHookFactory
	readonly targetKind: 'field-extension'
}

interface FieldKindHookRegistration extends BaseHookRegistration {
	readonly factory: ErasedHookFactory
	readonly kind: string
	readonly targetKind: 'field-kind'
}

type HookRegistration =
	| FieldExtensionHookRegistration
	| FieldHookRegistration
	| FieldKindHookRegistration
	| GlobalHookRegistration
	| SchemaExtensionHookRegistration
	| SchemaHookRegistration

type HookRegistrationInput = HookRegistration extends infer TRegistration
	? TRegistration extends HookRegistration
		? Omit<TRegistration, 'localName' | 'ownerPlugin'>
		: never
	: never

/** Describes one resolved schema declaration retained for the Runtime dispatcher. */
export interface ResolvedPluginSchemaHooks {
	readonly declarations: SchemaHookDeclarations
	readonly schema: SchemaDefinition
}

/** Describes one resolved field declaration retained for the Runtime dispatcher. */
export interface ResolvedPluginFieldHooks {
	readonly declarations: FieldHookDeclarations
	readonly field: GenericField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

/** Stores one immutable, owner-attributed hook contribution after target expansion. */
export interface ResolvedPluginHookContribution {
	readonly fields: readonly ResolvedPluginFieldHooks[]
	readonly localName: string
	readonly ownerPlugin: string
	readonly schemas: readonly ResolvedPluginSchemaHooks[]
	readonly targetKind: PluginHookTargetKind
}

const hookRegistrations = new WeakMap<object, HookRegistration>()
const resolvedHookContributions = new WeakMap<
	object,
	ResolvedPluginHookContribution
>()

const assertDeclarations = <TDeclarations extends object>(
	declarations: TDeclarations | undefined,
	name: string,
): TDeclarations => {
	if (declarations === undefined) {
		throw new TypeError(
			`Plugin hook contribution "${name}" must declare a hook`,
		)
	}

	return declarations
}

const normalizeFieldPath = (path: unknown): readonly [string, ...string[]] => {
	if (!isUnknownArray(path) || path.length === 0) {
		throw new TypeError(
			'Plugin hook field path must be a non-empty segment list',
		)
	}

	const [firstSegment, ...remainingSegments] = path
	assertNonEmptyString(firstSegment, 'plugin hook field path[0]')
	const normalizedPath: [string, ...string[]] = [firstSegment]

	for (const [index, segment] of remainingSegments.entries()) {
		assertNonEmptyString(
			segment,
			`plugin hook field path[${String(index + 1)}]`,
		)
		normalizedPath.push(segment)
	}

	return immutableArray(normalizedPath)
}

const createRegistrationDefinition = (
	registration: HookRegistration,
): Readonly<{ readonly targetKind: PluginHookTargetKind }> => {
	const definition = immutableRecord({ targetKind: registration.targetKind })
	hookRegistrations.set(definition, registration)

	return definition
}

const assertExtensionTarget: (
	ownerPlugin: string,
	extension: unknown,
	scope: 'field' | 'schema',
) => asserts extension is ExtensionDefinition<
	'field' | 'schema',
	string,
	object
> = (ownerPlugin, extension, scope) => {
	if (
		!isPlainRecord(extension) ||
		extension.scope !== scope ||
		typeof extension.name !== 'string' ||
		typeof extension.pluginName !== 'string' ||
		!isPlainRecord(extension.config)
	) {
		throw new TypeError(`Plugin hook target must be a ${scope} extension`)
	}

	assertNonEmptyString(extension.name, 'plugin hook extension name')
	assertNonEmptyString(extension.pluginName, 'plugin hook extension pluginName')

	if (extension.pluginName !== ownerPlugin) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin "${ownerPlugin}" cannot target extension "${extension.name}" owned by plugin "${extension.pluginName}".`,
			{
				internalDetails: {
					kind: 'foreign-hook-extension',
					extensionName: extension.name,
					extensionScope: scope,
					ownerPlugin,
					targetPlugin: extension.pluginName,
				},
			},
		)
	}
}

interface CreatePluginHookRegistryOptions {
	readonly isOpen: () => boolean
	readonly ownerPlugin: string
	readonly register: (name: string, value: unknown) => void
}

/** Creates one immutable hook facade whose writes cannot forge plugin ownership. */
export const createPluginHookRegistry = ({
	isOpen,
	ownerPlugin,
	register,
}: CreatePluginHookRegistryOptions): PluginHookRegistry => {
	const registerHook = (
		name: string,
		registration: HookRegistrationInput,
	): void => {
		if (!isOpen()) {
			throw new TypeError('Plugin hooks can only be registered during setup')
		}

		assertNonEmptyString(name, 'plugin hook name')
		register(
			name,
			createRegistrationDefinition(
				immutableRecord({
					...registration,
					localName: name,
					ownerPlugin,
				}),
			),
		)
	}

	const registry: PluginHookRegistry = {
		global: (name, hooks): void => {
			registerHook(name, {
				declarations: assertDeclarations(
					normalizeSchemaHookDeclarations(hooks),
					name,
				),
				targetKind: 'global',
			})
		},
		schema: (name, schema, hooks): void => {
			registerHook(name, {
				declarations: assertDeclarations(
					normalizeSchemaHookDeclarations(hooks),
					name,
				),
				schema,
				targetKind: 'schema',
			})
		},
		field: (name, schema, path, hooks): void => {
			registerHook(name, {
				declarations: assertDeclarations(
					normalizeFieldHookDeclarations(hooks),
					name,
				),
				path: normalizeFieldPath(path),
				schema,
				targetKind: 'field',
			})
		},
		schemaExtension: (name, extension, factory): void => {
			assertExtensionTarget(ownerPlugin, extension, 'schema')

			if (typeof factory !== 'function') {
				throw new TypeError('Schema-extension hook factory must be a function')
			}

			registerHook(name, {
				extension,
				factory,
				targetKind: 'schema-extension',
			})
		},
		fieldExtension: (name, extension, factory): void => {
			assertExtensionTarget(ownerPlugin, extension, 'field')

			if (typeof factory !== 'function') {
				throw new TypeError('Field-extension hook factory must be a function')
			}

			registerHook(name, {
				extension,
				factory,
				targetKind: 'field-extension',
			})
		},
		fieldKind: (name, target, factory): void => {
			if (!isPlainRecord(target) || !fieldKindTargets.has(target)) {
				throw new TypeError(
					'Field-kind hook target must be created by defineFieldKindHookTarget',
				)
			}

			if (typeof factory !== 'function') {
				throw new TypeError('Field-kind hook factory must be a function')
			}

			registerHook(name, {
				factory,
				kind: target.kind,
				targetKind: 'field-kind',
			})
		},
	}

	return Object.freeze(registry)
}

const extensionMatches = (
	actual: ExtensionDefinition<'field' | 'schema', string, object>,
	target: ExtensionDefinition<'field' | 'schema', string, object>,
): boolean =>
	actual.scope === target.scope &&
	actual.name === target.name &&
	actual.pluginName === target.pluginName

const resolveOwnedSchema = (
	schemas: SchemaRegistry,
	schema: SchemaDefinition,
	registration: BaseHookRegistration,
): SchemaDefinition => {
	const isSchema = Schema.is(schema)
	const schemaClassName = isSchema ? schema.className : '<invalid-schema>'

	if (!isSchema || schemas.get(schemaClassName) !== schema) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin hook "${registration.localName}" references a schema outside this application.`,
			{
				internalDetails: {
					kind: 'foreign-hook-schema',
					localName: registration.localName,
					ownerPlugin: registration.ownerPlugin,
					schemaClassName,
				},
			},
		)
	}

	return schema
}

const resolveExactField = (
	schema: SchemaDefinition,
	path: readonly [string, ...string[]],
	registration: BaseHookRegistration,
): GenericField => {
	try {
		return resolveSchemaFieldPath(schema, path)
	} catch (cause: unknown) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin hook "${registration.localName}" references an invalid field path in schema "${schema.className}".`,
			{
				cause,
				internalDetails: {
					kind: 'invalid-hook-field-path',
					localName: registration.localName,
					ownerPlugin: registration.ownerPlugin,
					path: immutableArray(path),
					schemaClassName: schema.className,
				},
			},
		)
	}
}

const createSchemaMatch = (
	schema: SchemaDefinition,
	declarations: SchemaHookDeclarations,
): ResolvedPluginSchemaHooks => immutableRecord({ declarations, schema })

const createFieldMatch = (
	schema: SchemaDefinition,
	field: GenericField,
	path: readonly string[],
	declarations: FieldHookDeclarations,
): ResolvedPluginFieldHooks =>
	immutableRecord({
		declarations,
		field,
		path: immutableArray(path),
		schema,
	})

const emptyFieldExtensions: readonly FieldExtension<string, object>[] =
	immutableArray([])

const isFieldExtension = (
	value: unknown,
): value is FieldExtension<string, object> =>
	isPlainRecord(value) &&
	value.scope === 'field' &&
	typeof value.name === 'string' &&
	value.name.length > 0 &&
	typeof value.pluginName === 'string' &&
	value.pluginName.length > 0 &&
	isPlainRecord(value.config)

const getFieldExtensions = (
	field: GenericField,
): readonly FieldExtension<string, object>[] => {
	const extensions: unknown =
		'extensions' in field.options ? field.options.extensions : undefined

	if (!isUnknownArray(extensions)) {
		return emptyFieldExtensions
	}

	const normalizedExtensions: FieldExtension<string, object>[] = []

	for (const extension of extensions) {
		if (!isFieldExtension(extension)) {
			throw new TypeError('Invalid field extension in plugin hook target')
		}

		normalizedExtensions.push(extension)
	}

	return immutableArray(normalizedExtensions)
}

/** Resolves every opaque native target after setup but before infrastructure starts. */
export const resolvePluginHookTargets = (
	schemas: SchemaRegistry,
	contributions: readonly PluginContribution[],
): void => {
	for (const contribution of contributions) {
		const definition = contribution.value

		if (typeof definition !== 'object' || definition === null) {
			continue
		}

		const registration = hookRegistrations.get(definition)

		if (registration === undefined) {
			continue
		}

		const schemaMatches: ResolvedPluginSchemaHooks[] = []
		const fieldMatches: ResolvedPluginFieldHooks[] = []

		switch (registration.targetKind) {
			case 'global': {
				for (const schema of schemas.values()) {
					schemaMatches.push(
						createSchemaMatch(schema, registration.declarations),
					)
				}
				break
			}
			case 'schema': {
				const schema = resolveOwnedSchema(
					schemas,
					registration.schema,
					registration,
				)
				schemaMatches.push(createSchemaMatch(schema, registration.declarations))
				break
			}
			case 'field': {
				const schema = resolveOwnedSchema(
					schemas,
					registration.schema,
					registration,
				)
				const field = resolveExactField(schema, registration.path, registration)
				fieldMatches.push(
					createFieldMatch(
						schema,
						field,
						registration.path,
						registration.declarations,
					),
				)
				break
			}
			case 'schema-extension': {
				for (const schema of schemas.values()) {
					for (const extension of schema.extensions) {
						if (!extensionMatches(extension, registration.extension)) {
							continue
						}

						const declarations = assertDeclarations(
							normalizeSchemaHookDeclarations(
								runHookFactory(
									registration.factory,
									immutableRecord({ extension, schema }),
								),
							),
							registration.localName,
						)
						schemaMatches.push(createSchemaMatch(schema, declarations))
					}
				}
				break
			}
			case 'field-extension': {
				for (const schema of schemas.values()) {
					for (const { field, path } of collectFieldTraversalEntries(
						schema.fields,
					)) {
						for (const extension of getFieldExtensions(field)) {
							if (!extensionMatches(extension, registration.extension)) {
								continue
							}

							const declarations = assertDeclarations(
								normalizeFieldHookDeclarations(
									runHookFactory(
										registration.factory,
										immutableRecord({ extension, field, path, schema }),
									),
								),
								registration.localName,
							)
							fieldMatches.push(
								createFieldMatch(schema, field, path, declarations),
							)
						}
					}
				}
				break
			}
			case 'field-kind': {
				for (const schema of schemas.values()) {
					for (const { field, path } of collectFieldTraversalEntries(
						schema.fields,
					)) {
						if (field.kind !== registration.kind) {
							continue
						}

						const declarations = assertDeclarations(
							normalizeFieldHookDeclarations(
								runHookFactory(
									registration.factory,
									immutableRecord({ field, path, schema }),
								),
							),
							registration.localName,
						)
						fieldMatches.push(
							createFieldMatch(schema, field, path, declarations),
						)
					}
				}
				break
			}
		}

		resolvedHookContributions.set(
			definition,
			immutableRecord({
				fields: immutableArray(fieldMatches),
				localName: registration.localName,
				ownerPlugin: registration.ownerPlugin,
				schemas: immutableArray(schemaMatches),
				targetKind: registration.targetKind,
			}),
		)
	}
}

/** Reads only framework-created, already resolved native plugin hook definitions. */
export const getResolvedPluginHookContribution = (
	value: unknown,
): ResolvedPluginHookContribution | undefined =>
	typeof value === 'object' && value !== null
		? resolvedHookContributions.get(value)
		: undefined

/** Identifies a pending or resolved native definition without accepting forgeries. */
export const isPluginHookTargetDefinition = (value: unknown): boolean =>
	typeof value === 'object' && value !== null && hookRegistrations.has(value)
