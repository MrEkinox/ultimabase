import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	FieldAccess,
	FieldAtPath,
	FieldExtension,
	GenericField,
	SchemaAccess,
	SchemaDefinition,
	SchemaExtension,
	SchemaFieldPath,
} from '../schema/index.js'
import {
	normalizeFieldAccessDeclarations,
	type FieldAccessDeclarations,
} from '../schema/access/field-declarations.js'
import {
	normalizeSchemaAccessDeclarations,
	type SchemaAccessDeclarations,
} from '../schema/access/declarations.js'
import type { AvailablePluginFieldKind } from '../schema/fields/base/kinds.js'
import { collectFieldTraversalEntries } from '../schema/fields/traversal.js'
import type { SchemaRegistry } from '../schema/schema/registry.js'
import type { PluginContribution } from './setup-registries.js'
import {
	assertOwnedPluginExtension,
	createPluginFieldKindTarget,
	getPluginTargetFieldExtensions,
	normalizePluginFieldPath,
	pluginExtensionMatches,
	readPluginFieldKindTarget,
	resolvePluginTargetField,
	resolvePluginTargetSchema,
	runPluginDeclarationFactory,
	type ErasedPluginDeclarationFactory,
	type PluginDeclarationTargetProvenance,
	type PluginFieldKindTarget,
} from './declaration-targets.js'

/** Names every target expanded by the plugin-owned Access registry. */
export type PluginAccessTargetKind =
	| 'field'
	| 'field-extension'
	| 'field-kind'
	| 'global'
	| 'schema'
	| 'schema-extension'

/** Requires each policy provider to state its audited-master semantics. */
export type PluginAccessMasterBehavior = 'bypass' | 'enforce'

/** Configures behavior shared by every match of one plugin contribution. */
export interface PluginAccessContributionOptions {
	/** Chooses whether trusted audited master requests skip this contribution. */
	readonly master: PluginAccessMasterBehavior
}

/** Supplies one schema and its exact matched extension to an Access factory. */
export interface SchemaExtensionAccessTargetContext<
	TExtension extends SchemaExtension<string, object>,
> {
	readonly extension: TExtension
	readonly schema: SchemaDefinition
}

/** Supplies one exact matched field extension to an Access factory. */
export interface FieldExtensionAccessTargetContext<
	TExtension extends FieldExtension<string, object>,
> {
	readonly extension: TExtension
	readonly field: GenericField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

/** Supplies one exact namespaced-kind field to an Access factory. */
export interface FieldKindAccessTargetContext<TField extends GenericField> {
	readonly field: TField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

export type SchemaExtensionAccessFactory<
	TExtension extends SchemaExtension<string, object>,
> = (
	context: SchemaExtensionAccessTargetContext<TExtension>,
) => SchemaAccess<SchemaDefinition>

export type FieldExtensionAccessFactory<
	TExtension extends FieldExtension<string, object>,
> = (
	context: FieldExtensionAccessTargetContext<TExtension>,
) => FieldAccess<GenericField>

export type FieldKindAccessFactory<TField extends GenericField> = (
	context: FieldKindAccessTargetContext<TField>,
) => FieldAccess<TField>

/** Retains one typed community field kind for Access policy expansion. */
export type FieldKindAccessTarget<TField extends GenericField> =
	PluginFieldKindTarget<TField>

/**
 * Creates the typed field-kind selector exported by a policy or field package.
 * @example `defineFieldKindAccessTarget<VectorField>('pg-vector.vector')`
 */
export const defineFieldKindAccessTarget = <TField extends GenericField>(
	kind: AvailablePluginFieldKind<TField['kind']>,
): FieldKindAccessTarget<TField> => createPluginFieldKindTarget<TField>(kind)

/** Adds immutable policy declarations during the owning plugin's setup phase. */
export interface PluginAccessRegistry {
	/**
	 * Adds schema Access rules to every schema in the application.
	 * @example `access.global('read-only', { operation: { read: true } }, { master: 'enforce' })`
	 */
	global(
		name: string,
		access: SchemaAccess<SchemaDefinition>,
		options: PluginAccessContributionOptions,
	): void
	/**
	 * Adds schema Access rules to one exact application-owned schema.
	 * @example `access.schema('posts', Post, { operation: { delete: false } }, { master: 'bypass' })`
	 */
	schema<TSchema extends SchemaDefinition>(
		name: string,
		schema: TSchema,
		access: SchemaAccess<NoInfer<TSchema>>,
		options: PluginAccessContributionOptions,
	): void
	/**
	 * Adds field Access rules to one exact typed nested field path.
	 * @example `access.field('email', User, ['profile', 'email'], { read: false }, { master: 'bypass' })`
	 */
	field<
		TSchema extends SchemaDefinition,
		const TPath extends SchemaFieldPath<TSchema>,
	>(
		name: string,
		schema: TSchema,
		path: TPath,
		access: FieldAccess<NoInfer<FieldAtPath<TSchema, TPath>>>,
		options: PluginAccessContributionOptions,
	): void
	/**
	 * Expands schema Access over extensions owned by this plugin.
	 * @example `access.schemaExtension('tenant', tenantExtension, () => ({ operation: { read: true } }), { master: 'enforce' })`
	 */
	schemaExtension<TExtension extends SchemaExtension<string, object>>(
		name: string,
		extension: TExtension,
		factory: SchemaExtensionAccessFactory<NoInfer<TExtension>>,
		options: PluginAccessContributionOptions,
	): void
	/**
	 * Expands field Access over extensions owned by this plugin.
	 * @example `access.fieldExtension('private', privateExtension, () => ({ read: false }), { master: 'bypass' })`
	 */
	fieldExtension<TExtension extends FieldExtension<string, object>>(
		name: string,
		extension: TExtension,
		factory: FieldExtensionAccessFactory<NoInfer<TExtension>>,
		options: PluginAccessContributionOptions,
	): void
	/**
	 * Expands field Access over one typed namespaced community field kind.
	 * @example `access.fieldKind('vectors', vectorTarget, () => ({ update: false }), { master: 'enforce' })`
	 */
	fieldKind<TField extends GenericField>(
		name: string,
		target: FieldKindAccessTarget<TField>,
		factory: FieldKindAccessFactory<NoInfer<TField>>,
		options: PluginAccessContributionOptions,
	): void
}

interface BaseAccessRegistration extends PluginDeclarationTargetProvenance {
	readonly master: PluginAccessMasterBehavior
	readonly targetKind: PluginAccessTargetKind
}

interface GlobalAccessRegistration extends BaseAccessRegistration {
	readonly declarations: SchemaAccessDeclarations
	readonly targetKind: 'global'
}

interface SchemaAccessRegistration extends BaseAccessRegistration {
	readonly declarations: SchemaAccessDeclarations
	readonly schema: SchemaDefinition
	readonly targetKind: 'schema'
}

interface FieldAccessRegistration extends BaseAccessRegistration {
	readonly declarations: FieldAccessDeclarations
	readonly path: readonly [string, ...string[]]
	readonly schema: SchemaDefinition
	readonly targetKind: 'field'
}

interface SchemaExtensionAccessRegistration extends BaseAccessRegistration {
	readonly extension: SchemaExtension<string, object>
	readonly factory: ErasedPluginDeclarationFactory
	readonly targetKind: 'schema-extension'
}

interface FieldExtensionAccessRegistration extends BaseAccessRegistration {
	readonly extension: FieldExtension<string, object>
	readonly factory: ErasedPluginDeclarationFactory
	readonly targetKind: 'field-extension'
}

interface FieldKindAccessRegistration extends BaseAccessRegistration {
	readonly factory: ErasedPluginDeclarationFactory
	readonly kind: string
	readonly targetKind: 'field-kind'
}

type AccessRegistration =
	| FieldAccessRegistration
	| FieldExtensionAccessRegistration
	| FieldKindAccessRegistration
	| GlobalAccessRegistration
	| SchemaAccessRegistration
	| SchemaExtensionAccessRegistration

type AccessRegistrationInput = AccessRegistration extends infer TRegistration
	? TRegistration extends AccessRegistration
		? Omit<TRegistration, 'localName' | 'ownerPlugin'>
		: never
	: never

/** Describes one resolved schema policy retained for Access compilation. */
export interface ResolvedPluginSchemaAccess {
	readonly declarations: SchemaAccessDeclarations
	readonly schema: SchemaDefinition
}

/** Describes one resolved field policy retained for Access compilation. */
export interface ResolvedPluginFieldAccess {
	readonly declarations: FieldAccessDeclarations
	readonly field: GenericField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

/** Stores one immutable owner-attributed policy after target expansion. */
export interface ResolvedPluginAccessContribution {
	readonly fields: readonly ResolvedPluginFieldAccess[]
	readonly localName: string
	readonly master: PluginAccessMasterBehavior
	readonly ownerPlugin: string
	readonly schemas: readonly ResolvedPluginSchemaAccess[]
	readonly targetKind: PluginAccessTargetKind
}

const accessRegistrations = new WeakMap<object, AccessRegistration>()
const resolvedAccessContributions = new WeakMap<
	object,
	ResolvedPluginAccessContribution
>()

const assertMasterBehavior = (options: unknown): PluginAccessMasterBehavior => {
	if (
		!isPlainRecord(options) ||
		(options.master !== 'bypass' && options.master !== 'enforce')
	) {
		throw new TypeError(
			'Plugin Access options.master must be "bypass" or "enforce"',
		)
	}

	return options.master
}

const assertSchemaDeclarations = (
	access: unknown,
	name: string,
): SchemaAccessDeclarations => {
	const declarations = normalizeSchemaAccessDeclarations(access)

	if (declarations === undefined) {
		throw new TypeError(
			`Plugin Access contribution "${name}" must declare a schema rule`,
		)
	}

	return declarations
}

const assertFieldDeclarations = (
	access: unknown,
	name: string,
): FieldAccessDeclarations => {
	const declarations = normalizeFieldAccessDeclarations(access)

	if (declarations === undefined) {
		throw new TypeError(
			`Plugin Access contribution "${name}" must declare a field rule`,
		)
	}

	return declarations
}

const createAccessDefinition = (
	registration: AccessRegistration,
): Readonly<{
	readonly master: PluginAccessMasterBehavior
	readonly targetKind: PluginAccessTargetKind
}> => {
	const definition = immutableRecord({
		master: registration.master,
		targetKind: registration.targetKind,
	})

	accessRegistrations.set(definition, registration)

	return definition
}

interface CreatePluginAccessRegistryOptions {
	readonly isOpen: () => boolean
	readonly ownerPlugin: string
	readonly register: (name: string, value: unknown) => void
}

/** Creates one immutable Access facade whose writes cannot forge ownership. */
export const createPluginAccessRegistry = ({
	isOpen,
	ownerPlugin,
	register,
}: CreatePluginAccessRegistryOptions): PluginAccessRegistry => {
	const registerAccess = (
		name: string,
		registration: AccessRegistrationInput,
	): void => {
		if (!isOpen()) {
			throw new TypeError('Plugin Access can only be registered during setup')
		}

		assertNonEmptyString(name, 'plugin Access name')
		register(
			name,
			createAccessDefinition(
				immutableRecord({ ...registration, localName: name, ownerPlugin }),
			),
		)
	}

	const registry: PluginAccessRegistry = {
		global: (name, access, options): void => {
			registerAccess(name, {
				declarations: assertSchemaDeclarations(access, name),
				master: assertMasterBehavior(options),
				targetKind: 'global',
			})
		},
		schema: (name, schema, access, options): void => {
			registerAccess(name, {
				declarations: assertSchemaDeclarations(access, name),
				master: assertMasterBehavior(options),
				schema,
				targetKind: 'schema',
			})
		},
		field: (name, schema, path, access, options): void => {
			registerAccess(name, {
				declarations: assertFieldDeclarations(access, name),
				master: assertMasterBehavior(options),
				path: normalizePluginFieldPath(path, 'Access'),
				schema,
				targetKind: 'field',
			})
		},
		schemaExtension: (name, extension, factory, options): void => {
			assertOwnedPluginExtension(ownerPlugin, extension, 'schema', 'Access')

			if (typeof factory !== 'function') {
				throw new TypeError(
					'Schema-extension Access factory must be a function',
				)
			}

			registerAccess(name, {
				extension,
				factory,
				master: assertMasterBehavior(options),
				targetKind: 'schema-extension',
			})
		},
		fieldExtension: (name, extension, factory, options): void => {
			assertOwnedPluginExtension(ownerPlugin, extension, 'field', 'Access')

			if (typeof factory !== 'function') {
				throw new TypeError('Field-extension Access factory must be a function')
			}

			registerAccess(name, {
				extension,
				factory,
				master: assertMasterBehavior(options),
				targetKind: 'field-extension',
			})
		},
		fieldKind: (name, target, factory, options): void => {
			let kind: string

			try {
				kind = readPluginFieldKindTarget(target)
			} catch (cause: unknown) {
				throw new TypeError(
					'Field-kind Access target must be created by defineFieldKindAccessTarget',
					{ cause },
				)
			}

			if (typeof factory !== 'function') {
				throw new TypeError('Field-kind Access factory must be a function')
			}

			registerAccess(name, {
				factory,
				kind,
				master: assertMasterBehavior(options),
				targetKind: 'field-kind',
			})
		},
	}

	return Object.freeze(registry)
}

const createSchemaMatch = (
	schema: SchemaDefinition,
	declarations: SchemaAccessDeclarations,
): ResolvedPluginSchemaAccess => immutableRecord({ declarations, schema })

const createFieldMatch = (
	schema: SchemaDefinition,
	field: GenericField,
	path: readonly string[],
	declarations: FieldAccessDeclarations,
): ResolvedPluginFieldAccess =>
	immutableRecord({
		declarations,
		field,
		path: immutableArray(path),
		schema,
	})

/** Resolves every opaque Access selector before infrastructure starts. */
export const resolvePluginAccessTargets = (
	schemas: SchemaRegistry,
	contributions: readonly PluginContribution[],
): void => {
	for (const contribution of contributions) {
		const definition = contribution.value

		if (typeof definition !== 'object' || definition === null) {
			throw new TypeError(
				`Plugin Access contribution "${contribution.name}" is forged`,
			)
		}

		const registration = accessRegistrations.get(definition)

		if (registration === undefined) {
			throw new TypeError(
				`Plugin Access contribution "${contribution.name}" is forged`,
			)
		}

		const schemaMatches: ResolvedPluginSchemaAccess[] = []
		const fieldMatches: ResolvedPluginFieldAccess[] = []

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
				const schema = resolvePluginTargetSchema(
					schemas,
					registration.schema,
					registration,
					'Access',
				)
				schemaMatches.push(createSchemaMatch(schema, registration.declarations))
				break
			}
			case 'field': {
				const schema = resolvePluginTargetSchema(
					schemas,
					registration.schema,
					registration,
					'Access',
				)
				const field = resolvePluginTargetField(
					schema,
					registration.path,
					registration,
					'Access',
				)
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
						if (!pluginExtensionMatches(extension, registration.extension)) {
							continue
						}

						const declarations = assertSchemaDeclarations(
							runPluginDeclarationFactory(
								registration.factory,
								immutableRecord({ extension, schema }),
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
						for (const extension of getPluginTargetFieldExtensions(
							field,
							'Access',
						)) {
							if (!pluginExtensionMatches(extension, registration.extension)) {
								continue
							}

							const declarations = assertFieldDeclarations(
								runPluginDeclarationFactory(
									registration.factory,
									immutableRecord({ extension, field, path, schema }),
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

						const declarations = assertFieldDeclarations(
							runPluginDeclarationFactory(
								registration.factory,
								immutableRecord({ field, path, schema }),
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

		resolvedAccessContributions.set(
			definition,
			immutableRecord({
				fields: immutableArray(fieldMatches),
				localName: registration.localName,
				master: registration.master,
				ownerPlugin: registration.ownerPlugin,
				schemas: immutableArray(schemaMatches),
				targetKind: registration.targetKind,
			}),
		)
	}
}

/** Reads only already-resolved framework-created Access contributions. */
export const getResolvedPluginAccessContribution = (
	value: unknown,
): ResolvedPluginAccessContribution | undefined =>
	typeof value === 'object' && value !== null
		? resolvedAccessContributions.get(value)
		: undefined

/** Distinguishes genuine setup definitions from structural lookalikes. */
export const isPluginAccessTargetDefinition = (value: unknown): boolean =>
	typeof value === 'object' && value !== null && accessRegistrations.has(value)
