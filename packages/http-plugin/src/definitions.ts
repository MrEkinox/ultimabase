import type { CompiledSchemaRegistry } from '@ultimabase/core'
import type {
	ApplicationCapabilityFactoryContext,
	PluginCapabilityReader,
} from '@ultimabase/core/plugin'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

/** @internal Rejects non-plain options and every unknown own key, symbols included. */
export const assertExactOptions: (
	value: unknown,
	keys: readonly string[],
	label: string,
) => asserts value is Readonly<Record<string, unknown>> = (
	value,
	keys,
	label,
) => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${label} must be a plain object`)
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.includes(key)) {
			throw new TypeError(`${label} contains unknown option: ${String(key)}`)
		}
	}
}

/** @internal Shapes the shared provider options of endpoints and resolvers. */
export interface HttpContributionOptions<TDefinition> {
	readonly contributionId: string
	readonly create: (
		context: Readonly<{
			readonly capabilities: PluginCapabilityReader<'materialization'>
			readonly schemas: CompiledSchemaRegistry
		}>,
	) => MaybePromise<TDefinition | readonly TDefinition[]>
}

/**
 * @internal Accepts only definitions made by this package's own factories, so
 * look-alike objects can never reach application assembly.
 */
export class HttpDefinitionRegistry<TDefinition extends object> {
	readonly #created = new WeakSet<object>()
	readonly #creators: string

	constructor(creators: string) {
		this.#creators = creators
	}

	register<TCreated extends TDefinition>(definition: TCreated): TCreated {
		this.#created.add(definition)
		return definition
	}

	/** Returns the validated definitions or names the first foreign element. */
	validate(values: unknown, path: string): readonly TDefinition[] {
		if (!isUnknownArray(values)) {
			throw new TypeError(`${path} must be an array`)
		}
		const definitions: TDefinition[] = []
		for (const [index, value] of values.entries()) {
			if (!this.#isCreated(value)) {
				throw new TypeError(
					`${path}[${String(index)}] must be created by ${this.#creators}`,
				)
			}
			definitions.push(value)
		}
		return definitions
	}

	#isCreated(value: unknown): value is TDefinition {
		return isPlainRecord(value) && this.#created.has(value)
	}

	/** Validates provider options and wraps their factory with definition checks. */
	contribution(
		options: HttpContributionOptions<TDefinition>,
		label: string,
	): Readonly<{
		readonly contributionId: string
		readonly create: (
			context: ApplicationCapabilityFactoryContext,
		) => Promise<Readonly<{ readonly value: readonly TDefinition[] }>>
	}> {
		assertExactOptions(
			options,
			['contributionId', 'create'],
			`${label} provider options`,
		)
		assertNonEmptyString(options.contributionId, `${label} contributionId`)
		if (typeof options.create !== 'function') {
			throw new TypeError(`${label} provider create must be a function`)
		}
		return {
			contributionId: options.contributionId,
			create: async (context) => {
				const created = await options.create({
					capabilities: context.capabilities,
					schemas: context.schemas,
				})
				const definitions = this.validate(
					isUnknownArray(created) ? created : [created],
					`${label} contribution`,
				)
				return immutableRecord({ value: immutableArray(definitions) })
			},
		}
	}
}
