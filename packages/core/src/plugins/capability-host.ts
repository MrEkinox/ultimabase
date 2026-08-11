import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	composeCapability,
	runApplicationCapabilityFactory,
	runCapabilityDecorator,
	type ApplicationCapabilityResource,
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
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginIdentity,
} from './manifest.js'

interface MaterializedCapabilityResource {
	readonly owner: PluginIdentity
	readonly dispose: () => MaybePromise<void>
}

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

/** Materializes application values and creates exact owner-bound consumer readers. */
export class ApplicationCapabilityHost {
	readonly #graph: PluginGraph
	readonly #inventory: CapabilityInventory
	readonly #readers = new Map<
		string,
		Map<string | undefined, PluginCapabilityReader>
	>()
	readonly #resolvedConsumers = new Map<CapabilityToken, unknown>()
	readonly #resolvedTokens = new Set<CapabilityToken>()
	readonly #resources: MaterializedCapabilityResource[] = []
	#materializationPromise: Promise<void> | undefined

	constructor(graph: PluginGraph) {
		this.#graph = graph
		this.#inventory = graph.capabilities
	}

	/** Materializes every active application capability exactly once before setup. */
	materialize(): Promise<void> {
		this.#materializationPromise ??= this.#performMaterialization()
		return this.#materializationPromise
	}

	/** Returns one stable reader whose requirement objects are fixed to its owner. */
	forPlugin(owner: PluginIdentity): PluginCapabilityReader {
		let instances = this.#readers.get(owner.pluginId)
		if (instances === undefined) {
			instances = new Map()
			this.#readers.set(owner.pluginId, instances)
		}
		const existing = instances.get(owner.instanceId)
		if (existing !== undefined) return existing

		const reader = immutableRecord({
			get: (requirement: CapabilityRequirement): unknown =>
				this.#read(owner, requirement),
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
		const errors: unknown[] = []
		for (const resource of this.#resources.toReversed()) {
			try {
				await resource.dispose()
			} catch (error: unknown) {
				errors.push(error)
			}
		}
		this.#resources.length = 0
		throwCleanupErrors(errors)
	}

	async #performMaterialization(): Promise<void> {
		for (const { entry } of readCapabilityPlans(this.#inventory)) {
			if (entry.token.lifetime === 'application') {
				await this.#resolve(entry.token, [])
			}
		}
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
		if (plan === undefined || plan.chains.length === 0) {
			this.#resolvedTokens.add(token)
			return undefined
		}

		const nextStack = [...resolutionStack, token]
		const providers: unknown[] = []
		for (const chain of plan.chains) {
			const contribution = chain.at(-1)
			if (contribution === undefined) continue

			const requirements = [
				...contribution.plugin.definition.manifest.capabilities.requires,
				...contribution.plugin.definition.manifest.capabilities.optional,
			]
			for (const requirement of requirements) {
				if (
					requirement.token !== token &&
					requirement.token.lifetime === 'application'
				) {
					await this.#resolve(requirement.token, nextStack)
				}
			}

			const resource = await runApplicationCapabilityFactory(
				contribution.declaration,
				immutableRecord({
					capabilities: this.forPlugin(contribution.owner),
				}),
			)
			assertApplicationResource(resource, token.capabilityId)
			providers.push(resource.value)
			if (resource.dispose !== undefined) {
				this.#resources.push({
					owner: contribution.owner,
					dispose: resource.dispose,
				})
			}
		}

		let consumer: unknown = composeCapability(token, providers)
		for (const decorator of plan.entry.decorators.toReversed()) {
			consumer = runCapabilityDecorator(decorator.declaration, consumer)
		}
		this.#resolvedConsumers.set(token, consumer)
		this.#resolvedTokens.add(token)
		return consumer
	}

	#read(owner: PluginIdentity, requirement: CapabilityRequirement): unknown {
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
}
