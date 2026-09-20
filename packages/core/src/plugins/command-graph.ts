import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { CommandBindings } from '../runtime/commands/bindings.js'
import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
	CompiledSchemaMutationCommand,
} from './application-surface-contracts.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import { assertImmutableOperationValue } from './plugin-operation-boundaries.js'
import type {
	CompiledPluginSchemaMutationDefinition,
	PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'

/** Inert payload/result facts; executable snapshots stay with the private source. */
export type CommandValueFacts = Omit<
	PluginOperationDefinition['input'],
	'snapshot'
>

/** The existing operation contract with every callback removed. */
export type OperationCommandFacts = Omit<
	PluginOperationDefinition,
	'input' | 'result'
> & {
	readonly input: CommandValueFacts
	readonly result: CommandValueFacts
}

/** One validated alias on an exact compiled schema, without its constructor. */
export interface CommandSurface {
	readonly className: string
	readonly contributionId: string
	/** Preserves contribution order independently of operation declaration order. */
	readonly order: number
	readonly name: string
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly surfaces: readonly ('schema' | 'model')[]
}

/** The closed declaration union preserves the two different execution contracts. */
export type CompiledCommand =
	| Readonly<{
			readonly kind: 'operation'
			readonly definition: OperationCommandFacts
			readonly owner: PluginSchemaContributionOwner
	  }>
	| Readonly<{
			readonly kind: 'mutation'
			readonly definition: CompiledPluginSchemaMutationDefinition
			readonly owner: PluginSchemaContributionOwner
			readonly surfaces: readonly CommandSurface[]
	  }>

export type CompiledOperationCommand = Extract<
	CompiledCommand,
	{ kind: 'operation' }
>

interface OperationView {
	readonly command: CompiledOperationCommand
	readonly graph: CompiledCommandGraph
}
const operationViews = new WeakMap<CompiledPluginOperation, OperationView>()

/** Resolves the retained public declaration view to its canonical private command. */
export const readOperationCommand = (
	view: CompiledPluginOperation,
): OperationView => {
	const compiled = operationViews.get(view)
	if (compiled === undefined)
		throw new TypeError('Operation view was not compiled by Core')
	return compiled
}

export type CompiledMutationCommand = Extract<
	CompiledCommand,
	{ kind: 'mutation' }
>
interface MutationView {
	readonly command: CompiledMutationCommand
	readonly graph: CompiledCommandGraph
}
const mutationViews = new WeakMap<CompiledSchemaMutationCommand, MutationView>()

/** Resolves a retained schema/model alias without storing another mutation declaration. */
export const readMutationCommand = (
	view: CompiledSchemaMutationCommand,
): MutationView => {
	const compiled = mutationViews.get(view)
	if (compiled === undefined)
		throw new TypeError('Mutation view was not compiled by Core')
	return compiled
}

/** Source tokens never enter an inert projection or become a registration API. */
export type CommandSource =
	PluginOperationDefinition | PluginSchemaMutationDefinition
export type CommandEntry = Readonly<{
	readonly command: CompiledCommand
	readonly source: CommandSource
}>

/** Owns one compiled declaration graph; all legacy views derive these records. */
export class CompiledCommandGraph {
	readonly bindings: CommandBindings = new CommandBindings((source) =>
		this.fromSource(source),
	)
	readonly commands: readonly CompiledCommand[]
	readonly #entries: ReadonlyMap<
		string,
		CommandEntry & { readonly operationView?: CompiledPluginOperation }
	>
	readonly #surfaceViews = new Map<string, CompiledApplicationSchemaSurface>()

	constructor(
		entries: readonly CommandEntry[],
		schemas: readonly SchemaDefinition[],
	) {
		this.#entries = new Map(
			entries.map((entry) => {
				if (
					entry.command.kind !== 'operation' ||
					entry.source.kind !== 'plugin-operation'
				)
					return [entry.command.definition.name, entry] as const
				const operationView = immutableRecord({
					operation: entry.source,
					owner: entry.command.owner,
				})
				operationViews.set(
					operationView,
					immutableRecord({ command: entry.command, graph: this }),
				)
				return [
					entry.command.definition.name,
					{ ...entry, operationView },
				] as const
			}),
		)
		this.commands = immutableArray(entries.map(({ command }) => command))
		const views = new Map(
			schemas.map((schema) => [
				schema.className,
				{
					schema,
					schemaMutations: new Map<string, CompiledSchemaMutationCommand>(),
					modelMutations: new Map<string, CompiledSchemaMutationCommand>(),
				},
			]),
		)
		// Traverse each selected alias once, preserving its original contribution order.
		const aliases = this.commands
			.flatMap((command) =>
				command.kind === 'mutation'
					? command.surfaces.map((surface) => ({ command, surface }))
					: [],
			)
			.sort((left, right) => left.surface.order - right.surface.order)
		for (const { command, surface } of aliases) {
			const target = views.get(surface.className)
			if (target === undefined)
				throw new TypeError('Compiled command target is unavailable')
			const view = immutableRecord({
				contributionId: surface.contributionId,
				mutation: command.definition,
				owner: command.owner,
				staticOptions: surface.staticOptions,
			})
			mutationViews.set(view, immutableRecord({ command, graph: this }))
			for (const kind of surface.surfaces) {
				const index =
					kind === 'schema' ? target.schemaMutations : target.modelMutations
				index.set(surface.name, view)
			}
		}
		for (const [className, view] of views)
			this.#surfaceViews.set(className, immutableRecord(view))

		Object.freeze(this)
	}

	/** Resolves a name without exposing the nominal source's executable contracts. */
	get(name: string): CompiledCommand | undefined {
		return this.#entries.get(name)?.command
	}

	/** Exact identity prevents shaped, foreign, or same-name tokens from rebinding. */
	fromSource(source: CommandSource): CompiledCommand | undefined {
		const entry = this.#entries.get(source.name)
		return entry?.source === source ? entry.command : undefined
	}

	/** Snapshots either command's payload through its one private source contract. */
	snapshotInput(command: CompiledCommand, value: unknown): unknown {
		const source = this.#source(command)
		const path = `${command.definition.name}.input`
		const snapshot = source.input.snapshot(value, path)
		assertImmutableOperationValue(snapshot, path)
		return snapshot
	}

	/** Application operations alone own an arbitrary result contract. */
	snapshotOperationResult(
		command: CompiledOperationCommand,
		value: unknown,
	): unknown {
		const source = this.#source(command)
		if (source.kind !== 'plugin-operation')
			throw new TypeError('Expected an application operation')
		const path = `${command.definition.name}.result`
		const snapshot = source.result.snapshot(value, path)
		assertImmutableOperationValue(snapshot, path)
		return snapshot
	}

	#source(command: CompiledCommand): CommandSource {
		const entry = this.#entries.get(command.definition.name)
		if (entry?.command !== command)
			throw new TypeError('Command belongs to another compiled graph')
		return entry.source
	}

	/** Temporary operation view for the bounded execution and surface migrations. */
	operation(name: string): CompiledPluginOperation | undefined {
		return this.#entries.get(name)?.operationView
	}

	/** Copies the index while retaining the exact immutable envelope command identities. */
	schemaSurface(
		className: string,
	): CompiledApplicationSchemaSurface | undefined {
		const view = this.#surfaceViews.get(className)
		return view === undefined
			? undefined
			: immutableRecord({
					schema: view.schema,
					schemaMutations: new Map(view.schemaMutations),
					modelMutations: new Map(view.modelMutations),
				})
	}

	/** Keeps the old projection shape until its last consumer migrates in 3011. */
	legacyViews(): Readonly<{
		operations: ReadonlyMap<string, CompiledPluginOperation>
		schemas: ReadonlyMap<string, CompiledApplicationSchemaSurface>
	}> {
		const operations = new Map<string, CompiledPluginOperation>()
		for (const command of this.commands) {
			const operation = this.operation(command.definition.name)
			if (operation !== undefined)
				operations.set(command.definition.name, operation)
		}
		const schemas = new Map<string, CompiledApplicationSchemaSurface>()
		for (const className of this.#surfaceViews.keys()) {
			const surface = this.schemaSurface(className)
			if (surface !== undefined) schemas.set(className, surface)
		}
		return immutableRecord({ operations, schemas })
	}
}
