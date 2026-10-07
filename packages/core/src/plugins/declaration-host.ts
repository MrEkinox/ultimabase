import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type { PrivateStorageDeclarationRegistrar } from '../private-storage/contracts.js'
import type { PrivateStorageRegistry } from '../private-storage/registry.js'
import type { FieldBuilderMethodRegistry } from '../schema/schema/field-builder-method-registry.js'
import type { PluginFieldFamilyRegistrar } from '../schema/schema/field-builder-methods.js'
import type {
	PluginModelSurfaceRegistrar,
	PluginOperationDeclarationRegistrar,
} from './application-surface-declarations.js'
import {
	assertCapabilityRequirement,
	type CapabilityConsumerValue,
	type CapabilityRequirement,
	type NormalizedPluginCapabilityDeclarations,
	type PluginCapabilityDeclarationOptions,
} from './capabilities.js'
import { readDeclarationCapability } from './capability-inventory.js'
import { runPluginDeclaration } from './definition.js'
import type { PluginGraph } from './graph.js'
import {
	formatPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'
import type { SchemaDeclarationRegistry } from './schema-declarations.js'
import {
	attachPluginDeclarationDiagnostic,
	type PluginSchemaDeclarationRegistrar,
} from './schema-declarations.js'
import type { TypegenReferenceRegistrar } from './typegen-declarations.js'

type RequiredCapability<TCapabilities> =
	NormalizedPluginCapabilityDeclarations<TCapabilities>['requires'][number]
type OptionalCapability<TCapabilities> =
	NormalizedPluginCapabilityDeclarations<TCapabilities>['optional'][number]

type DeclarationRequirement<TRequirement> =
	TRequirement extends CapabilityRequirement<infer TToken>
		? TToken['lifetime'] extends 'declaration'
			? TRequirement
			: never
		: never

type RequiredDeclarationCapability<TCapabilities> = DeclarationRequirement<
	RequiredCapability<TCapabilities>
>
type OptionalDeclarationCapability<TCapabilities> = DeclarationRequirement<
	OptionalCapability<TCapabilities>
>

type RequirementToken<TRequirement> =
	TRequirement extends CapabilityRequirement<infer TToken> ? TToken : never

/** Reads only exact declaration-lifetime requirements from this plugin manifest. */
export interface PluginDeclarationCapabilityReader<
	TCapabilities extends PluginCapabilityDeclarationOptions | undefined =
		PluginCapabilityDeclarationOptions | undefined,
> {
	/** Reads one required static capability after deterministic composition. */
	get<const TRequirement extends RequiredDeclarationCapability<TCapabilities>>(
		requirement: TRequirement,
	): CapabilityConsumerValue<RequirementToken<TRequirement>>
	/** Reads one optional static capability without probing undeclared protocols. */
	get<const TRequirement extends OptionalDeclarationCapability<TCapabilities>>(
		requirement: TRequirement,
	): CapabilityConsumerValue<RequirementToken<TRequirement>> | undefined
}

type PrivilegeUnion<TPrivileges> =
	TPrivileges extends readonly PluginPrivilegeRequest[]
		? TPrivileges[number]
		: never
type SchemaDeclareRequest<TPrivileges> = Extract<
	PrivilegeUnion<TPrivileges>,
	Readonly<{ name: 'schema:declare' }>
>
type UnconditionalSchemaDeclareRequest<TPrivileges> =
	SchemaDeclareRequest<TPrivileges> extends infer TRequest
		? TRequest extends Readonly<{ when: CapabilityRequirement }>
			? never
			: TRequest
		: never

type PluginFieldDeclarationContext<TPrivileges> = [
	SchemaDeclareRequest<TPrivileges>,
] extends [never]
	? Readonly<Record<never, never>>
	: [UnconditionalSchemaDeclareRequest<TPrivileges>] extends [never]
		? Readonly<{ fields?: PluginFieldFamilyRegistrar }>
		: Readonly<{ fields: PluginFieldFamilyRegistrar }>

type PluginSchemaDeclarationContext<TPrivileges> = [
	SchemaDeclareRequest<TPrivileges>,
] extends [never]
	? Readonly<Record<never, never>>
	: [UnconditionalSchemaDeclareRequest<TPrivileges>] extends [never]
		? Readonly<{ schemas?: PluginSchemaDeclarationRegistrar }>
		: Readonly<{ schemas: PluginSchemaDeclarationRegistrar }>

type PrivilegeRequest<
	TPrivileges,
	TName extends PluginPrivilegeRequest['name'],
> = Extract<PrivilegeUnion<TPrivileges>, Readonly<{ name: TName }>>
type UnconditionalPrivilegeRequest<
	TPrivileges,
	TName extends PluginPrivilegeRequest['name'],
> =
	PrivilegeRequest<TPrivileges, TName> extends infer TRequest
		? TRequest extends Readonly<{ when: CapabilityRequirement }>
			? never
			: TRequest
		: never
type PrivilegedDeclarationContext<
	TPrivileges,
	TName extends PluginPrivilegeRequest['name'],
	TProperty extends string,
	TValue,
> = [PrivilegeRequest<TPrivileges, TName>] extends [never]
	? Readonly<Record<never, never>>
	: [UnconditionalPrivilegeRequest<TPrivileges, TName>] extends [never]
		? Readonly<Partial<Record<TProperty, TValue>>>
		: Readonly<Record<TProperty, TValue>>

type PluginModelDeclarationContext<TPrivileges> = PrivilegedDeclarationContext<
	TPrivileges,
	'model:extend',
	'models',
	PluginModelSurfaceRegistrar
>
type PluginOperationDeclarationContext<TPrivileges> =
	PrivilegedDeclarationContext<
		TPrivileges,
		'operation:declare',
		'operations',
		PluginOperationDeclarationRegistrar
	>
type PluginTypegenReferenceContext<TPrivileges> = PrivilegedDeclarationContext<
	TPrivileges,
	'typegen:reference',
	'typegenReferences',
	TypegenReferenceRegistrar
>
type PluginPrivateStorageDeclarationContext<TPrivileges> =
	PrivilegedDeclarationContext<
		TPrivileges,
		'storage:private',
		'privateStorage',
		PrivateStorageDeclarationRegistrar
	>

/**
 * Supplies only immutable static facades authorized by one plugin manifest.
 *
 * `fields` exists only when `schema:declare` is active. Application resources,
 * adapters, requests, clocks, network state, and setup exports are absent.
 */
export type PluginDeclarationContext<
	TPrivileges extends readonly PluginPrivilegeRequest[] | undefined =
		readonly PluginPrivilegeRequest[] | undefined,
	TCapabilities extends PluginCapabilityDeclarationOptions | undefined =
		PluginCapabilityDeclarationOptions | undefined,
> = Readonly<{
	/** Reads exact declaration-lifetime requirements declared by this plugin. */
	capabilities: PluginDeclarationCapabilityReader<TCapabilities>
}> &
	PluginFieldDeclarationContext<TPrivileges> &
	PluginSchemaDeclarationContext<TPrivileges> &
	PluginModelDeclarationContext<TPrivileges> &
	PluginOperationDeclarationContext<TPrivileges> &
	PluginTypegenReferenceContext<TPrivileges> &
	PluginPrivateStorageDeclarationContext<TPrivileges>

/** Declares deterministic application metadata before schemas are compiled. */
export type PluginDeclaration<
	TPrivileges extends readonly PluginPrivilegeRequest[] | undefined =
		readonly PluginPrivilegeRequest[] | undefined,
	TCapabilities extends PluginCapabilityDeclarationOptions | undefined =
		PluginCapabilityDeclarationOptions | undefined,
> = (context: PluginDeclarationContext<TPrivileges, TCapabilities>) => undefined

const throwUndeclaredCapabilityRead = (
	owner: PluginIdentity,
	requirement: CapabilityRequirement,
): never => {
	throw new FrameworkError(
		'PLUGIN_CAPABILITY_MISSING',
		`Plugin "${formatPluginIdentity(owner)}" attempted to read an undeclared capability requirement during static declaration.`,
		{
			internalDetails: {
				kind: 'undeclared-static-capability-read',
				plugin: formatPluginIdentity(owner),
				capabilityId: requirement.token.capabilityId,
			},
		},
	)
}

const declarationPrivileges: ReadonlySet<PluginPrivilege> = new Set([
	'model:extend',
	'operation:declare',
	'schema:declare',
	'storage:private',
	'typegen:reference',
])

/** Runs the one transactional static declaration phase for an application. */
export class PluginDeclarationHost {
	#completed = false

	constructor(
		private readonly graph: PluginGraph,
		private readonly fieldBuilderMethods: FieldBuilderMethodRegistry,
		private readonly schemaDeclarations: SchemaDeclarationRegistry,
		private readonly privateStorage: PrivateStorageRegistry,
	) {}

	run(): void {
		if (this.#completed) {
			throw new TypeError('Plugin static declaration is already complete')
		}

		for (const plugin of this.graph) {
			const definition = plugin.definition
			const owner = definition.manifest.identity
			const activePrivileges = new Set<PluginPrivilege>()
			for (const request of definition.manifest.privileges) {
				if (
					declarationPrivileges.has(request.name) &&
					this.graph.capabilities.isPrivilegeActive(owner, request)
				) {
					activePrivileges.add(request.name)
				}
			}
			const canDeclare = activePrivileges.has('schema:declare')
			const canExtendModels = activePrivileges.has('model:extend')
			const canDeclareOperations = activePrivileges.has('operation:declare')
			const canReferenceTypegen = activePrivileges.has('typegen:reference')
			const canUsePrivateStorage = activePrivileges.has('storage:private')
			const fieldSession = canDeclare
				? this.fieldBuilderMethods.beginPluginDeclaration(
						formatPluginIdentity(owner),
					)
				: undefined
			const schemaOwner = immutableRecord({
				kind: 'plugin' as const,
				pluginId: owner.pluginId,
				...(owner.instanceId === undefined
					? {}
					: { instanceId: owner.instanceId }),
				version: definition.manifest.version,
			})
			const schemaSession =
				canDeclare ||
				canExtendModels ||
				canDeclareOperations ||
				canReferenceTypegen
					? this.schemaDeclarations.beginPluginDeclaration(
							schemaOwner,
							immutableRecord({
								declare: canDeclare,
								modelExtend: canExtendModels,
								operationDeclare: canDeclareOperations,
								requirements: immutableArray([
									...definition.manifest.capabilities.requires,
									...definition.manifest.capabilities.optional,
								]),
								typegenReference: canReferenceTypegen,
							}),
						)
					: undefined
			const privateStorageSession = canUsePrivateStorage
				? this.privateStorage.beginDeclaration(
						owner,
						definition.manifest.version,
					)
				: undefined
			let open = true
			const capabilities = immutableRecord({
				get: (requirement: CapabilityRequirement): unknown => {
					if (!open) {
						throw new TypeError(
							'Plugin static declaration facade is already closed',
						)
					}

					assertCapabilityRequirement(
						requirement,
						'static declaration capability requirement',
					)
					const declarations = definition.manifest.capabilities
					const declared = [
						...declarations.requires,
						...declarations.optional,
					].some((candidate) => candidate === requirement)
					if (!declared) {
						return throwUndeclaredCapabilityRead(owner, requirement)
					}
					if (requirement.token.lifetime !== 'declaration') {
						throw new FrameworkError(
							'PLUGIN_CAPABILITY_MISSING',
							`Plugin "${formatPluginIdentity(owner)}" attempted to read application capability "${requirement.token.capabilityId}" during static declaration.`,
							{
								internalDetails: {
									kind: 'application-capability-static-read',
									plugin: formatPluginIdentity(owner),
									capabilityId: requirement.token.capabilityId,
								},
							},
						)
					}
					if (
						!this.graph.capabilities.isRequirementActive(owner, requirement)
					) {
						return undefined
					}

					return readDeclarationCapability(this.graph.capabilities, requirement)
				},
			}) as PluginDeclarationCapabilityReader
			const context = immutableRecord({
				capabilities,
				...(fieldSession === undefined ? {} : { fields: fieldSession.fields }),
				...(schemaSession !== undefined && canDeclare
					? { schemas: schemaSession.registrar }
					: {}),
				...(canExtendModels && schemaSession !== undefined
					? { models: schemaSession.models }
					: {}),
				...(canDeclareOperations && schemaSession !== undefined
					? { operations: schemaSession.operations }
					: {}),
				...(canReferenceTypegen && schemaSession !== undefined
					? { typegenReferences: schemaSession.typegenReferences }
					: {}),
				...(privateStorageSession === undefined
					? {}
					: { privateStorage: privateStorageSession.registrar }),
			})

			try {
				try {
					runPluginDeclaration(definition, context)
				} catch (cause: unknown) {
					throw attachPluginDeclarationDiagnostic(
						cause,
						schemaOwner,
						`plugins.${formatPluginIdentity(owner)}.declare`,
					)
				}
				fieldSession?.commit()
				schemaSession?.commit()
			} finally {
				open = false
				fieldSession?.close()
				schemaSession?.close()
				privateStorageSession?.close()
			}
		}

		this.fieldBuilderMethods.close()
		this.schemaDeclarations.close()
		this.#completed = true
	}
}
