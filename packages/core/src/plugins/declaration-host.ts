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
	pluginContributionOwner,
	type PluginIdentity,
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'
import {
	attachPluginDeclarationDiagnostic,
	type PluginSchemaDeclarationRegistrar,
} from './schema-declaration-contracts.js'
import type { SchemaDeclarationRegistry } from './schema-declaration-registry.js'
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

const throwStaticCapabilityRead = (
	owner: PluginIdentity,
	requirement: CapabilityRequirement,
	kind: string,
	message: string,
): never => {
	throw new FrameworkError(
		'PLUGIN_CAPABILITY_MISSING',
		`Plugin "${formatPluginIdentity(owner)}" ${message} during static declaration.`,
		{
			internalDetails: {
				kind,
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

		for (const { definition } of this.graph) {
			const { identity: owner, capabilities: declared } = definition.manifest
			const active = new Set(
				definition.manifest.privileges
					.filter(
						(request) =>
							declarationPrivileges.has(request.name) &&
							this.graph.capabilities.isPrivilegeActive(owner, request),
					)
					.map(({ name }) => name),
			)
			const canDeclare = active.has('schema:declare')
			const canExtendModels = active.has('model:extend')
			const canDeclareOperations = active.has('operation:declare')
			const canReferenceTypegen = active.has('typegen:reference')
			const requirements = [...declared.requires, ...declared.optional]
			const fieldSession = canDeclare
				? this.fieldBuilderMethods.beginPluginDeclaration(
						formatPluginIdentity(owner),
					)
				: undefined
			const schemaOwner = pluginContributionOwner(definition.manifest)
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
								requirements: immutableArray(requirements),
								typegenReference: canReferenceTypegen,
							}),
						)
					: undefined
			const privateStorageSession = active.has('storage:private')
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
					if (!requirements.includes(requirement)) {
						return throwStaticCapabilityRead(
							owner,
							requirement,
							'undeclared-static-capability-read',
							'attempted to read an undeclared capability requirement',
						)
					}
					if (requirement.token.lifetime !== 'declaration') {
						return throwStaticCapabilityRead(
							owner,
							requirement,
							'application-capability-static-read',
							`attempted to read application capability "${requirement.token.capabilityId}"`,
						)
					}
					return this.graph.capabilities.isRequirementActive(owner, requirement)
						? readDeclarationCapability(this.graph.capabilities, requirement)
						: undefined
				},
			}) as PluginDeclarationCapabilityReader
			const context = immutableRecord({
				capabilities,
				...(fieldSession === undefined ? {} : { fields: fieldSession.fields }),
				...(schemaSession === undefined
					? {}
					: {
							...(canDeclare ? { schemas: schemaSession.registrar } : {}),
							...(canExtendModels ? { models: schemaSession.models } : {}),
							...(canDeclareOperations
								? { operations: schemaSession.operations }
								: {}),
							...(canReferenceTypegen
								? { typegenReferences: schemaSession.typegenReferences }
								: {}),
						}),
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
