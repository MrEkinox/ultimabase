import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type {
	FieldBuilderMethodRegistrar,
	FieldBuilderMethodRegistry,
} from '../schema/schema/field-builder-methods.js'
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
	type PluginPrivilegeRequest,
} from './manifest.js'
import type { SchemaDeclarationRegistry } from './schema-declarations.js'
import { type PluginSchemaDeclarationRegistrar } from './schema-declarations.js'

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

type SchemaTransformRequest<TPrivileges> = Extract<
	PrivilegeUnion<TPrivileges>,
	Readonly<{ name: 'schema:transform' }>
>
type SchemaDeclarationRequest<TPrivileges> =
	SchemaDeclareRequest<TPrivileges> | SchemaTransformRequest<TPrivileges>
type UnconditionalSchemaDeclarationRequest<TPrivileges> =
	SchemaDeclarationRequest<TPrivileges> extends infer TRequest
		? TRequest extends Readonly<{ when: CapabilityRequirement }>
			? never
			: TRequest
		: never

type PluginFieldDeclarationContext<TPrivileges> = [
	SchemaDeclareRequest<TPrivileges>,
] extends [never]
	? Readonly<Record<never, never>>
	: [UnconditionalSchemaDeclareRequest<TPrivileges>] extends [never]
		? Readonly<{ fields?: FieldBuilderMethodRegistrar }>
		: Readonly<{ fields: FieldBuilderMethodRegistrar }>

type PluginSchemaDeclarationContext<TPrivileges> = [
	SchemaDeclarationRequest<TPrivileges>,
] extends [never]
	? Readonly<Record<never, never>>
	: [UnconditionalSchemaDeclarationRequest<TPrivileges>] extends [never]
		? Readonly<{ schemas?: PluginSchemaDeclarationRegistrar }>
		: Readonly<{ schemas: PluginSchemaDeclarationRegistrar }>

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
	PluginSchemaDeclarationContext<TPrivileges>

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

/** Runs the one transactional static declaration phase for an application. */
export class PluginDeclarationHost {
	#completed = false

	constructor(
		private readonly graph: PluginGraph,
		private readonly fieldBuilderMethods: FieldBuilderMethodRegistry,
		private readonly schemaDeclarations: SchemaDeclarationRegistry,
	) {}

	run(): void {
		if (this.#completed) {
			throw new TypeError('Plugin static declaration is already complete')
		}

		for (const plugin of this.graph) {
			const definition = plugin.definition
			const owner = definition.manifest.identity
			const privilege = definition.manifest.privileges.find(
				(request) => request.name === 'schema:declare',
			)
			const transformPrivilege = definition.manifest.privileges.find(
				(request) => request.name === 'schema:transform',
			)
			const canDeclare =
				privilege !== undefined &&
				this.graph.capabilities.isPrivilegeActive(owner, privilege)
			const canTransform =
				transformPrivilege !== undefined &&
				this.graph.capabilities.isPrivilegeActive(owner, transformPrivilege)
			const fieldSession = canDeclare
				? this.fieldBuilderMethods.beginPluginDeclaration(
						formatPluginIdentity(owner),
					)
				: undefined
			const schemaSession =
				canDeclare || canTransform
					? this.schemaDeclarations.beginPluginDeclaration(
							immutableRecord({
								kind: 'plugin',
								pluginId: owner.pluginId,
								...(owner.instanceId === undefined
									? {}
									: { instanceId: owner.instanceId }),
								version: definition.manifest.version,
							}),
							immutableRecord({
								declare: canDeclare,
								requirements: immutableArray([
									...definition.manifest.capabilities.requires,
									...definition.manifest.capabilities.optional,
								]),
								transform: canTransform,
							}),
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
				...(schemaSession === undefined
					? {}
					: { schemas: schemaSession.registrar }),
			})

			try {
				runPluginDeclaration(definition, context)
				fieldSession?.commit()
				schemaSession?.commit()
			} finally {
				open = false
				fieldSession?.close()
				schemaSession?.close()
			}
		}

		this.fieldBuilderMethods.close()
		this.schemaDeclarations.close()
		this.#completed = true
	}
}
