import type { CommandBindings } from '../runtime/commands/bindings.js'
import type { CompiledCommandGraph } from './command-graph.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'
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
	type ApplicationCapabilityResource,
	type ApplicationCapabilityFactoryContext,
	type CapabilityConsumerValue,
	type CapabilityProviderContribution,
	type CapabilityRequirement,
	type CapabilityToken,
	type PluginCapabilityReader,
} from './capabilities.js'
import {
	readCapabilityPlans,
	readDeclarationCapability,
	type CapabilityInventory,
} from './capability-inventory.js'
import type { PluginGraph } from './graph.js'
import type { NormalizedPlugin } from './normalization.js'
import { PluginCommandMaterializer } from './plugin-command-materializer.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
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
const throwCapabilityCycle = (
	token: CapabilityToken,
	resolutionStack: readonly CapabilityToken[],
): never => {
	const cycleStart = resolutionStack.findIndex(
		(candidate) => candidate === token,
	)
	const cycle = [...resolutionStack.slice(cycleStart), token].map(
		(candidate) => `${candidate.capabilityId}@${candidate.version}`,
	)

	throw new FrameworkError(
		'PLUGIN_CAPABILITY_CONFLICT',
		`Application capability dependency cycle detected: ${cycle.join(' -> ')}.`,
		{
			internalDetails: {
				kind: 'application-capability-cycle',
				cycle,
			},
		},
	)
}
const assertApplicationResource: (
	value: unknown,
	capabilityId: string,
) => asserts value is ApplicationCapabilityResource<unknown> = (
	value,
	capabilityId,
) => {
	if (!isPlainRecord(value)) {
		throw new TypeError(
			`Application capability "${capabilityId}" factory must return a plain resource object`,
		)
	}
	for (const key of Reflect.ownKeys(value)) {
		if (key !== 'value' && key !== 'dispose') {
			throw new TypeError(
				`Application capability "${capabilityId}" resource contains unknown option: ${String(key)}`,
			)
		}
	}
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
const throwCleanupErrors = (errors: readonly unknown[]): void => {
	if (errors.length === 0) return
	if (errors.length === 1) throw errors[0]
	throw new AggregateError(
		errors,
		'Multiple application capabilities failed to dispose.',
	)
}
const createDeniedConstraintCompilerReader = (
	owner: PluginIdentity,
): DatabaseConstraintCompilerReader => {
	const throwDenied = (): never => {
		throw new FrameworkError(
			'PLUGIN_PRIVILEGE_DENIED',
			`Plugin "${formatPluginIdentity(owner)}" requires active privilege "adapter:consume" to read database constraint compilers.`,
			{
				internalDetails: {
					kind: 'capability-factory-privilege-missing',
					plugin: formatPluginIdentity(owner),
					privilege: 'adapter:consume',
				},
			},
		)
	}

	return Object.freeze({
		get size(): number {
			return throwDenied()
		},
		values: throwDenied,
	})
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
	readonly #readers = new Map<
		string,
		Map<string | undefined, PluginCapabilityReader>
	>()
	readonly #factoryReaders = new Map<
		string,
		Map<string | undefined, PluginCapabilityReader>
	>()
	readonly #resolvedConsumers = new Map<CapabilityToken, unknown>()
	readonly #resolvedContributions = new Map<
		CapabilityToken,
		readonly MaterializedCapabilityContribution[]
	>()
	readonly #resolvedTokens = new Set<CapabilityToken>()
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

	#assertPrivilege(owner: PluginIdentity, privilege: PluginPrivilege): void {
		const plugin = this.#graph.get(owner)
		const request = plugin?.definition.manifest.privileges.find(
			(candidate) => candidate.name === privilege,
		)
		if (
			plugin !== undefined &&
			request !== undefined &&
			this.#inventory.isPrivilegeActive(owner, request)
		) {
			return
		}

		throw new FrameworkError(
			'PLUGIN_PRIVILEGE_DENIED',
			`Plugin "${formatPluginIdentity(owner)}" requires active privilege "${privilege}" for this capability effect.`,
			{
				internalDetails: {
					kind: 'capability-factory-privilege-missing',
					plugin: formatPluginIdentity(owner),
					privilege,
				},
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
		if (this.#disposed) {
			throw new TypeError('Application capabilities are no longer available')
		}
		if (!this.#materialized) {
			throw new TypeError(
				'Application capabilities require completed materialization',
			)
		}

		return this.#resolvedConsumers.get(token)
	}

	/** Reads Core-owned provider provenance without opening generic plugin lookup. */
	readContributions<const TToken extends CapabilityToken>(
		token: TToken,
	): readonly MaterializedCapabilityContribution<TToken>[] {
		if (this.#disposed) {
			throw new TypeError('Application capabilities are no longer available')
		}
		if (!this.#materialized) {
			throw new TypeError(
				'Application capabilities require completed materialization',
			)
		}

		return (this.#resolvedContributions.get(token) ??
			immutableArray(
				[],
			)) as readonly MaterializedCapabilityContribution<TToken>[]
	}

	/** Returns one stable reader whose requirement objects are fixed to its owner. */
	forPlugin(owner: PluginIdentity): PluginCapabilityReader {
		return this.#readerFor(owner, 'setup', this.#readers)
	}

	#readerFor(
		owner: PluginIdentity,
		phase: 'factory' | 'setup',
		readers: Map<string, Map<string | undefined, PluginCapabilityReader>>,
	): PluginCapabilityReader {
		let instances = readers.get(owner.pluginId)
		if (instances === undefined) {
			instances = new Map()
			readers.set(owner.pluginId, instances)
		}
		const existing = instances.get(owner.instanceId)
		if (existing !== undefined) return existing

		const reader = immutableRecord({
			contributions: (requirement: CapabilityRequirement) =>
				this.#readProviderContributions(owner, requirement, phase),
			get: (requirement: CapabilityRequirement): unknown =>
				this.#read(owner, requirement, phase),
		}) as PluginCapabilityReader
		instances.set(owner.instanceId, reader)
		return reader
	}

	/** Disposes resources owned by one plugin after its dispose hook completes. */
	async disposeOwner(owner: PluginIdentity): Promise<void> {
		const errors: unknown[] = []
		for (let index = this.#resources.length - 1; index >= 0; index -= 1) {
			const resource = this.#resources[index]
			if (
				resource === undefined ||
				!isSamePluginIdentity(resource.owner, owner)
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
		throwCleanupErrors(errors)
	}

	/** Releases every resource left after partial setup or plugin cleanup failure. */
	async dispose(): Promise<void> {
		if (this.#disposed) return
		const errors: unknown[] = []
		for (const resource of this.#resources.toReversed()) {
			try {
				await resource.dispose()
			} catch (error: unknown) {
				errors.push(error)
			}
		}
		const bindings = this.#commandBindings ?? this.#commands?.()?.bindings
		bindings?.dispose()
		this.#resources.length = 0
		this.#resolvedConsumers.clear()
		this.#resolvedContributions.clear()
		this.#resolvedTokens.clear()
		this.#disposed = true
		throwCleanupErrors(errors)
	}

	async #performMaterialization(): Promise<void> {
		const commands = new PluginCommandMaterializer({
			application: this.#application,
			context: (plugin, owner) => this.#factoryContext(plugin, owner),
			graph: this.#graph,
			retain: (resource) => this.#resources.push(resource),
		})
		this.#commandBindings = commands.bindTransports(this.#commands?.())
		for (const { entry } of readCapabilityPlans(this.#inventory)) {
			if (entry.token.lifetime === 'application') {
				await this.#resolve(entry.token, [])
			}
		}
		await commands.bindHandlers(this.#commandBindings)
		this.#materialized = true
	}

	async #resolve(
		token: CapabilityToken,
		resolutionStack: readonly CapabilityToken[],
	): Promise<unknown> {
		if (this.#resolvedTokens.has(token)) {
			return this.#resolvedConsumers.get(token)
		}
		if (resolutionStack.includes(token)) {
			throwCapabilityCycle(token, resolutionStack)
		}

		const plan = readCapabilityPlans(this.#inventory).find(
			({ entry }) => entry.token === token,
		)
		if (plan === undefined || plan.providers.length === 0) {
			this.#resolvedTokens.add(token)
			return undefined
		}

		const nextStack = [...resolutionStack, token]
		const providers: unknown[] = []
		const materializedContributions: MaterializedCapabilityContribution[] = []
		for (const contribution of plan.providers) {
			const plugin = contribution.plugin

			const requirements =
				plugin === undefined
					? []
					: [
							...plugin.definition.manifest.capabilities.requires,
							...plugin.definition.manifest.capabilities.optional,
						]
			for (const requirement of requirements) {
				if (
					requirement.phase === 'materialization' &&
					requirement.token !== token &&
					requirement.token.lifetime === 'application'
				) {
					await this.#resolve(requirement.token, nextStack)
				}
			}

			const createResource = () =>
				runApplicationCapabilityFactory(
					contribution.declaration,
					this.#factoryContext(plugin, contribution.owner),
				)
			const resource = await (plugin === undefined
				? createResource()
				: runWithApplicationPluginOwner(
						this.#application,
						contribution.owner,
						createResource,
					))
			assertApplicationResource(resource, token.capabilityId)
			const providerValue = materializeAdapterContribution(
				token,
				resource.value,
				{
					contributionId: contribution.declaration.contributionId,
					owner: contribution.owner,
					packageVersion: contribution.version,
				},
			)
			providers.push(providerValue)
			materializedContributions.push(
				immutableRecord({
					contributionId: contribution.declaration.contributionId,
					owner: contribution.owner,
					pluginVersion: contribution.version,
					value: providerValue,
				}),
			)
			if (resource.dispose !== undefined) {
				const dispose = resource.dispose
				this.#resources.push({
					owner: contribution.owner,
					dispose:
						plugin === undefined
							? resource.dispose
							: () =>
									runWithApplicationPluginOwner(
										this.#application,
										contribution.owner,
										dispose,
									),
				})
			}
		}

		const consumer: unknown = composeCapability(token, providers)
		if (isApplicationOperationTransportPlanningCapability(token)) {
			bindApplicationOperationTransportPlanner(consumer, this.#application)
		}
		if (mutation.isApplicationSchemaMutationSurfaceCapability(token)) {
			mutation.bindApplicationSchemaMutationSurface(
				consumer,
				this.#resolveSchemaSurface,
			)
		}
		this.#resolvedContributions.set(
			token,
			immutableArray(materializedContributions),
		)
		this.#resolvedConsumers.set(token, consumer)
		this.#resolvedTokens.add(token)
		return consumer
	}

	#factoryContext(
		plugin: NormalizedPlugin | undefined,
		owner: PluginIdentity,
	): ApplicationCapabilityFactoryContext {
		return immutableRecord({
			assertPrivilege: (privilege: PluginPrivilege): void => {
				this.#assertPrivilege(owner, privilege)
			},
			callbacks: this.#callbacks,
			capabilities: this.#readerFor(owner, 'factory', this.#factoryReaders),
			constraintCompilers:
				plugin !== undefined && this.#canConsumeAdapter(owner, plugin)
					? this.#constraintCompilers
					: createDeniedConstraintCompilerReader(owner),
			owner,
			schemas: this.#schemas,
		})
	}

	#read(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
		readerPhase: 'factory' | 'setup',
	): unknown {
		this.#assertDeclaredRequirementRead(owner, requirement, readerPhase)

		if (!this.#inventory.isRequirementActive(owner, requirement)) {
			return undefined
		}
		if (requirement.token.lifetime === 'declaration') {
			return readDeclarationCapability(this.#inventory, requirement)
		}
		if (!this.#resolvedTokens.has(requirement.token)) {
			throw new TypeError(
				`Application capability "${requirement.token.capabilityId}" was read before materialization`,
			)
		}
		return this.#resolvedConsumers.get(requirement.token)
	}

	#readProviderContributions(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
		readerPhase: 'factory' | 'setup',
	): readonly MaterializedCapabilityContribution[] {
		this.#assertDeclaredRequirementRead(owner, requirement, readerPhase)
		if (requirement.token.lifetime !== 'application') {
			throw new TypeError(
				'Provider contributions require an application capability',
			)
		}
		if (!this.#inventory.isRequirementActive(owner, requirement)) {
			return immutableArray([])
		}
		if (!this.#resolvedTokens.has(requirement.token)) {
			throw new TypeError(
				`Application capability "${requirement.token.capabilityId}" was read before materialization`,
			)
		}
		return (
			this.#resolvedContributions.get(requirement.token) ?? immutableArray([])
		)
	}

	#assertDeclaredRequirementRead(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
		readerPhase: 'factory' | 'setup',
	): void {
		const plugin = this.#graph.get(owner)
		if (plugin === undefined) {
			throw new TypeError(
				`Unknown capability reader owner: ${formatPluginIdentity(owner)}`,
			)
		}
		const declarations = plugin.definition.manifest.capabilities
		const declared = [...declarations.requires, ...declarations.optional].some(
			(candidate) => candidate === requirement,
		)
		if (!declared) {
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_MISSING',
				`Plugin "${formatPluginIdentity(owner)}" attempted to read an undeclared capability requirement.`,
				{
					internalDetails: {
						kind: 'undeclared-capability-read',
						plugin: formatPluginIdentity(owner),
						capabilityId: requirement.token.capabilityId,
					},
				},
			)
		}
		if (readerPhase === 'factory' && requirement.phase === 'setup') {
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_MISSING',
				`Plugin "${formatPluginIdentity(owner)}" attempted to read a setup-phase capability from an application factory.`,
				{
					internalDetails: {
						kind: 'setup-capability-factory-read',
						plugin: formatPluginIdentity(owner),
						capabilityId: requirement.token.capabilityId,
					},
				},
			)
		}
	}

	#canConsumeAdapter(owner: PluginIdentity, plugin: NormalizedPlugin): boolean {
		return plugin.definition.manifest.privileges.some(
			(request) =>
				request.name === 'adapter:consume' &&
				this.#inventory.isPrivilegeActive(owner, request),
		)
	}
}
