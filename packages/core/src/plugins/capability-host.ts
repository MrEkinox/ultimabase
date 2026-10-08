import type {
	CommandBindings,
	OwnedCommandHandlerPlan,
} from '../runtime/commands/bindings.js'
import type { CompiledCommandGraph } from './command-graph.js'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { assertExactPlainObject } from '../exact-object-validation.js'
import { FrameworkError } from '../errors/framework-error.js'
import type { CompiledSchemaRegistry } from '../schema/index.js'
import type { DatabaseConstraintCompilerReader } from './constraint-compilers.js'
import {
	createApplicationCallbackExecutor,
	runWithApplicationPluginOwner,
	type ApplicationCallbackExecutor,
} from './callback-execution.js'
import {
	composeCapability,
	runApplicationCapabilityFactory,
	type ApplicationCapabilityFactoryContext,
	type ApplicationCapabilityResource,
	type CapabilityConsumerValue,
	type CapabilityProviderContribution,
	type CapabilityRequirement,
	type CapabilityToken,
	type PluginCapabilityReader,
} from './capabilities.js'
import {
	findActivePrivilegeRequest,
	readCapabilityPlans,
	readDeclarationCapability,
	type CapabilityInventory,
} from './capability-inventory.js'
import { readPluginCommandPlan } from './definition.js'
import type { PluginGraph } from './graph.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	pluginContributionOwner,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
import { PluginIdentityMap } from './plugin-identity-map.js'
import { materializeAdapterContribution } from '../runtime/adapters/contributions.js'
import {
	bindApplicationOperationTransportPlanner,
	isApplicationOperationTransportPlanningCapability,
} from '../runtime/application/application-operation-transport-planning.js'
import * as mutation from '../runtime/application/application-schema-mutation-surface.js'

interface MaterializedCapabilityResource {
	readonly owner: PluginIdentity
	readonly dispose: () => MaybePromise<void>
}
/** Retains exact provider ownership after application capability materialization. */
export type MaterializedCapabilityContribution<
	TToken extends CapabilityToken = CapabilityToken,
> = CapabilityProviderContribution<TToken>
interface MaterializedCapability {
	readonly consumer: unknown
	readonly contributions: readonly MaterializedCapabilityContribution[]
}
type ReaderPhase = 'factory' | 'setup'
const unresolvedCapability: MaterializedCapability = immutableRecord({
	consumer: undefined,
	contributions: immutableArray([]),
})
const assertApplicationResource: (
	value: unknown,
	capabilityId: string,
) => asserts value is ApplicationCapabilityResource<unknown> = (
	value,
	capabilityId,
) => {
	assertExactPlainObject(
		value,
		new Set(['dispose', 'value']),
		`Application capability "${capabilityId}" factory must return a plain resource object`,
		`Application capability "${capabilityId}" resource contains unknown option: `,
	)
	if (!Object.hasOwn(value, 'value')) {
		throw new TypeError(
			`Application capability "${capabilityId}" resource must contain value`,
		)
	}
	if (value.dispose !== undefined && typeof value.dispose !== 'function') {
		throw new TypeError(
			`Application capability "${capabilityId}" resource dispose must be a function`,
		)
	}
}
/** Rethrows one cleanup failure as-is, or several as one `AggregateError`. */
export const throwCleanupErrors = (
	errors: readonly unknown[],
	message: string,
): void => {
	if (errors.length === 1) throw errors[0]
	if (errors.length > 1) throw new AggregateError(errors, message)
}
const capabilityDisposalFailure =
	'Multiple application capabilities failed to dispose.'
const throwFactoryPrivilegeDenied = (
	owner: PluginIdentity,
	privilege: PluginPrivilege,
	purpose: string,
): never => {
	throw new FrameworkError(
		'PLUGIN_PRIVILEGE_DENIED',
		`Plugin "${formatPluginIdentity(owner)}" requires active privilege "${privilege}" ${purpose}.`,
		{
			internalDetails: {
				kind: 'capability-factory-privilege-missing',
				plugin: formatPluginIdentity(owner),
				privilege,
			},
		},
	)
}

/** Materializes application values and creates exact owner-bound consumer readers. */
export class ApplicationCapabilityHost {
	readonly #commands: (() => CompiledCommandGraph | undefined) | undefined
	readonly #application: object
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #graph: PluginGraph
	readonly #inventory: CapabilityInventory
	readonly #schemas: CompiledSchemaRegistry
	readonly #constraintCompilers: DatabaseConstraintCompilerReader
	readonly #resolveSchemaSurface: mutation.SchemaMutationSurfaceResolver
	readonly #readers = new PluginIdentityMap<PluginCapabilityReader>()
	readonly #factoryReaders = new PluginIdentityMap<PluginCapabilityReader>()
	readonly #resolved = new Map<CapabilityToken, MaterializedCapability>()
	readonly #resources: MaterializedCapabilityResource[] = []
	#materializationPromise: Promise<void> | undefined
	#commandBindings: CommandBindings | undefined
	#materialized = false
	#disposed = false

	constructor(
		graph: PluginGraph,
		schemas: CompiledSchemaRegistry,
		constraintCompilers: DatabaseConstraintCompilerReader,
		application?: object,
		resolveSchemaSurface?: mutation.SchemaMutationSurfaceResolver,
		commands?: () => CompiledCommandGraph | undefined,
	) {
		this.#commands = commands
		this.#application = application ?? this
		this.#graph = graph
		this.#inventory = graph.capabilities
		this.#schemas = schemas
		this.#constraintCompilers = constraintCompilers
		this.#resolveSchemaSurface = resolveSchemaSurface ?? (() => undefined)
		this.#callbacks = createApplicationCallbackExecutor(
			this.#application,
			(owner) => {
				if (this.#graph.get(owner) === undefined) {
					throw new FrameworkError(
						'PLUGIN_CONFLICT',
						`Attributed callback owner "${formatPluginIdentity(owner)}" is not installed in this application.`,
						{
							internalDetails: {
								kind: 'callback-owner-unknown',
								plugin: formatPluginIdentity(owner),
							},
						},
					)
				}
			},
		)
	}

	/** Materializes every active application capability exactly once before setup. */
	materialize(): Promise<void> {
		if (this.#disposed) {
			throw new TypeError('Application capabilities are no longer available')
		}
		this.#materializationPromise ??= this.#performMaterialization()
		return this.#materializationPromise
	}

	/** Reads one Core-owned protocol without exposing generic lookup to plugins. */
	read<const TToken extends CapabilityToken>(
		token: TToken,
	): CapabilityConsumerValue<TToken> | undefined {
		return this.#materializedCapability(token)?.consumer
	}

	/** Reads Core-owned provider provenance without opening generic plugin lookup. */
	readContributions<const TToken extends CapabilityToken>(
		token: TToken,
	): readonly MaterializedCapabilityContribution<TToken>[] {
		return (this.#materializedCapability(token) ?? unresolvedCapability)
			.contributions as readonly MaterializedCapabilityContribution<TToken>[]
	}

	#materializedCapability(
		token: CapabilityToken,
	): MaterializedCapability | undefined {
		if (this.#disposed) {
			throw new TypeError('Application capabilities are no longer available')
		}
		if (!this.#materialized) {
			throw new TypeError(
				'Application capabilities require completed materialization',
			)
		}
		return this.#resolved.get(token)
	}

	/** Returns one stable reader whose requirement objects are fixed to its owner. */
	forPlugin(owner: PluginIdentity): PluginCapabilityReader {
		return this.#readerFor(owner, 'setup')
	}

	#readerFor(
		owner: PluginIdentity,
		phase: ReaderPhase,
	): PluginCapabilityReader {
		const readers = phase === 'setup' ? this.#readers : this.#factoryReaders
		return readers.getOrCreate(
			owner,
			() =>
				immutableRecord({
					contributions: (requirement: CapabilityRequirement) => {
						if (requirement.token.lifetime !== 'application') {
							this.#assertDeclaredRequirementRead(owner, requirement, phase)
							throw new TypeError(
								'Provider contributions require an application capability',
							)
						}
						return (
							this.#read(owner, requirement, phase) ?? unresolvedCapability
						).contributions
					},
					get: (requirement: CapabilityRequirement): unknown =>
						requirement.token.lifetime === 'declaration'
							? this.#readDeclaration(owner, requirement, phase)
							: this.#read(owner, requirement, phase)?.consumer,
				}) as PluginCapabilityReader,
		)
	}

	/** Disposes resources owned by one plugin after its dispose hook completes. */
	async disposeOwner(owner: PluginIdentity): Promise<void> {
		throwCleanupErrors(
			await this.#drainResources(owner),
			capabilityDisposalFailure,
		)
	}

	/** Releases every resource left after partial setup or plugin cleanup failure. */
	async dispose(): Promise<void> {
		if (this.#disposed) return
		const errors = await this.#drainResources()
		const bindings = this.#commandBindings ?? this.#commands?.()?.bindings
		bindings?.dispose()
		this.#resolved.clear()
		this.#disposed = true
		throwCleanupErrors(errors, capabilityDisposalFailure)
	}

	async #drainResources(owner?: PluginIdentity): Promise<unknown[]> {
		const errors: unknown[] = []
		for (let index = this.#resources.length - 1; index >= 0; index -= 1) {
			const resource = this.#resources[index]
			if (
				resource === undefined ||
				(owner !== undefined && !isSamePluginIdentity(resource.owner, owner))
			) {
				continue
			}
			this.#resources.splice(index, 1)
			try {
				await resource.dispose()
			} catch (error: unknown) {
				errors.push(error)
			}
		}
		return errors
	}

	/** Retains one cleanup callback, attributed to its plugin owner when it has one. */
	#retain(
		owner: PluginIdentity,
		dispose: (() => MaybePromise<void>) | undefined,
		attributed: boolean,
	): void {
		if (dispose === undefined) return
		this.#resources.push({
			owner,
			dispose: attributed
				? () => runWithApplicationPluginOwner(this.#application, owner, dispose)
				: dispose,
		})
	}

	async #performMaterialization(): Promise<void> {
		const plans = this.#graph.plugins.map((plugin) => ({
			owner: pluginContributionOwner(plugin.definition.manifest),
			plan: readPluginCommandPlan(plugin.definition),
		}))
		const graph = this.#commands?.()
		// Inert transport facts are bound before capability factories can plan them.
		if (graph === undefined) {
			if (
				plans.some(
					({ plan }) => plan.handlers.length > 0 || plan.transports.length > 0,
				)
			) {
				throw new TypeError(
					'Plugin commands require a compiled application command graph',
				)
			}
		} else {
			graph.bindings.bindTransports(
				plans.flatMap(({ owner, plan }) =>
					plan.transports.map((transport) => ({ ...transport, owner })),
				),
			)
			this.#commandBindings = graph.bindings
		}

		for (const [token] of readCapabilityPlans(this.#inventory)) {
			if (token.lifetime === 'application') await this.#resolve(token, [])
		}

		// Owner-attributed handlers are created after their capability dependencies.
		if (this.#commandBindings !== undefined) {
			const handlers: OwnedCommandHandlerPlan[] = []
			for (const { owner, plan } of plans) {
				for (const handler of plan.handlers) {
					const resource = await runWithApplicationPluginOwner(
						this.#application,
						owner,
						() => handler.create(this.#factoryContext(owner, true)),
					)
					handlers.push({
						contributionId: handler.contributionId,
						owner,
						resource,
						source: handler.source,
					})
					this.#retain(owner, resource.dispose, true)
				}
			}
			this.#commandBindings.bindHandlers(handlers)
		}
		this.#materialized = true
	}

	async #resolve(
		token: CapabilityToken,
		resolutionStack: readonly CapabilityToken[],
	): Promise<unknown> {
		const resolved = this.#resolved.get(token)
		if (resolved !== undefined) return resolved.consumer
		if (resolutionStack.includes(token)) {
			const cycle = [
				...resolutionStack.slice(resolutionStack.indexOf(token)),
				token,
			].map((candidate) => `${candidate.capabilityId}@${candidate.version}`)
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_CONFLICT',
				`Application capability dependency cycle detected: ${cycle.join(' -> ')}.`,
				{ internalDetails: { kind: 'application-capability-cycle', cycle } },
			)
		}

		const providers = readCapabilityPlans(this.#inventory).get(token)?.providers
		if (providers === undefined || providers.length === 0) {
			this.#resolved.set(token, unresolvedCapability)
			return undefined
		}

		const nextStack = [...resolutionStack, token]
		const contributions: MaterializedCapabilityContribution[] = []
		for (const { declaration, owner, plugin, version } of providers) {
			const capabilities = plugin?.definition.manifest.capabilities
			for (const requirement of [
				...(capabilities?.requires ?? []),
				...(capabilities?.optional ?? []),
			]) {
				if (
					requirement.phase === 'materialization' &&
					requirement.token !== token &&
					requirement.token.lifetime === 'application'
				) {
					await this.#resolve(requirement.token, nextStack)
				}
			}

			const attributed = plugin !== undefined
			const createResource = () =>
				runApplicationCapabilityFactory(
					declaration,
					this.#factoryContext(owner, attributed),
				)
			const resource: unknown = await (attributed
				? runWithApplicationPluginOwner(
						this.#application,
						owner,
						createResource,
					)
				: createResource())
			assertApplicationResource(resource, token.capabilityId)
			const value = materializeAdapterContribution(token, resource.value, {
				contributionId: declaration.contributionId,
				owner,
				packageVersion: version,
			})
			contributions.push(
				immutableRecord({
					contributionId: declaration.contributionId,
					owner,
					pluginVersion: version,
					value,
				}),
			)
			this.#retain(owner, resource.dispose, attributed)
		}

		const consumer: unknown = composeCapability(
			token,
			contributions.map(({ value }) => value),
		)
		if (isApplicationOperationTransportPlanningCapability(token)) {
			bindApplicationOperationTransportPlanner(consumer, this.#application)
		}
		if (mutation.isApplicationSchemaMutationSurfaceCapability(token)) {
			mutation.bindApplicationSchemaMutationSurface(
				consumer,
				this.#resolveSchemaSurface,
			)
		}
		this.#resolved.set(token, {
			consumer,
			contributions: immutableArray(contributions),
		})
		return consumer
	}

	#factoryContext(
		owner: PluginIdentity,
		isPlugin: boolean,
	): ApplicationCapabilityFactoryContext {
		const canConsumeAdapter =
			isPlugin &&
			findActivePrivilegeRequest(
				this.#inventory,
				this.#graph.get(owner),
				'adapter:consume',
			) !== undefined
		const deny = (): never =>
			throwFactoryPrivilegeDenied(
				owner,
				'adapter:consume',
				'to read database constraint compilers',
			)
		return immutableRecord({
			assertPrivilege: (privilege: PluginPrivilege): void => {
				if (
					findActivePrivilegeRequest(
						this.#inventory,
						this.#graph.get(owner),
						privilege,
					) === undefined
				) {
					throwFactoryPrivilegeDenied(
						owner,
						privilege,
						'for this capability effect',
					)
				}
			},
			callbacks: this.#callbacks,
			capabilities: this.#readerFor(owner, 'factory'),
			constraintCompilers: canConsumeAdapter
				? this.#constraintCompilers
				: Object.freeze({
						get size(): number {
							return deny()
						},
						values: deny,
					}),
			owner,
			schemas: this.#schemas,
		})
	}

	#readDeclaration(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
		phase: ReaderPhase,
	): unknown {
		this.#assertDeclaredRequirementRead(owner, requirement, phase)
		return this.#inventory.isRequirementActive(owner, requirement)
			? readDeclarationCapability(this.#inventory, requirement)
			: undefined
	}

	#read(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
		phase: ReaderPhase,
	): MaterializedCapability | undefined {
		this.#assertDeclaredRequirementRead(owner, requirement, phase)
		if (!this.#inventory.isRequirementActive(owner, requirement)) {
			return undefined
		}
		const resolved = this.#resolved.get(requirement.token)
		if (resolved === undefined) {
			throw new TypeError(
				`Application capability "${requirement.token.capabilityId}" was read before materialization`,
			)
		}
		return resolved
	}

	#assertDeclaredRequirementRead(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
		phase: ReaderPhase,
	): void {
		const plugin = this.#graph.get(owner)
		if (plugin === undefined) {
			throw new TypeError(
				`Unknown capability reader owner: ${formatPluginIdentity(owner)}`,
			)
		}
		const { requires, optional } = plugin.definition.manifest.capabilities
		const violation = ![...requires, ...optional].includes(requirement)
			? {
					kind: 'undeclared-capability-read',
					message: 'attempted to read an undeclared capability requirement',
				}
			: phase === 'factory' && requirement.phase === 'setup'
				? {
						kind: 'setup-capability-factory-read',
						message:
							'attempted to read a setup-phase capability from an application factory',
					}
				: undefined
		if (violation === undefined) return
		throw new FrameworkError(
			'PLUGIN_CAPABILITY_MISSING',
			`Plugin "${formatPluginIdentity(owner)}" ${violation.message}.`,
			{
				internalDetails: {
					kind: violation.kind,
					plugin: formatPluginIdentity(owner),
					capabilityId: requirement.token.capabilityId,
				},
			},
		)
	}
}
