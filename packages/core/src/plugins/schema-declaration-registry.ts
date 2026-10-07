import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { FieldBuilderMethodResolver } from '../schema/schema/field-builder-methods.js'
import {
	type PluginSchemaContributionOwner,
	type SchemaCompilationProvenance,
} from '../schema/schema/provenance.js'
import {
	publishSchemaRegistryCompilation,
	type SchemaRegistry,
	stageSchemaRegistryCompilation,
} from '../schema/schema/registry.js'
import type { SchemaTargetGraph } from '../schema/schema/targets.js'
import type { CapabilityRequirement } from './capabilities.js'
import type { ApplicationCapabilityHost } from './capability-host.js'
import {
	diagnosePluginDeclarationFailure,
	type MutableSchemaDeclarationBatch,
	type OwnedSchemaSource,
	type PendingSchemaOptionRuntimeCompilation,
	pluginDeclarationDiagnostic,
	PluginDeclarationDiagnosticError,
	type PluginDeclarationFailureDiagnostic,
	type PluginSchemaDeclarationRegistrar,
	type SchemaDeclarationBatch,
	snapshotStaticOptions,
} from './schema-declaration-contracts.js'
import { isSamePluginIdentity } from './manifest.js'

import {
	fieldOptionDefinitions,
	schemaOptionDefinitions,
} from './schema-option-definitions.js'

import {
	schemaPatchOperations,
	type SchemaSelection,
	schemaSelections,
	type SchemaSelectorOptions,
} from './schema-patch-contracts.js'

import {
	createApplicationSurfaceRegistrars,
	type PluginModelSurfaceRegistrar,
	type PluginOperationDeclarationRegistrar,
	snapshotApplicationSurfaceDeclarations,
} from './application-surface-declarations.js'
import { compileCommandGraph } from './application-surface-registry.js'
import type { CompiledCommandGraph } from './command-graph.js'
import { compileSchemaDeclarations } from './compiled-schema-declarations.js'
import { executeRuntimeCompilations } from './schema-runtime-options.js'
import { normalizeSelector } from './schema-selectors.js'
import {
	type CompiledTypegenGraph,
	createCompiledTypegenGraph,
	createTypegenReferenceRegistrar,
	snapshotTypegenDeclarations,
	type TypegenReferenceRegistrar,
} from './typegen-declarations.js'
import { pluginSourceReceipt } from './source-projections.js'

export class SchemaDeclarationRegistry {
	readonly #batches: SchemaDeclarationBatch[] = []
	#closed = false
	#nextSelectionId = 0
	#runtimeCompilations:
		readonly PendingSchemaOptionRuntimeCompilation[] | undefined
	#runtimeCompilationState: 'failed' | 'idle' | 'running' | 'succeeded' = 'idle'
	#compiledProvenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined
	#commands: CompiledCommandGraph | undefined

	beginPluginDeclaration(
		owner: PluginSchemaContributionOwner,
		privileges: Readonly<{
			declare: boolean
			modelExtend: boolean
			operationDeclare: boolean
			requirements: readonly CapabilityRequirement[]
			typegenReference: boolean
		}>,
	): Readonly<{
		close(): void
		commit(): void
		models: PluginModelSurfaceRegistrar
		operations: PluginOperationDeclarationRegistrar
		registrar: PluginSchemaDeclarationRegistrar
		typegenReferences: TypegenReferenceRegistrar
	}> {
		if (this.#closed) {
			throw new TypeError('Schema declaration registry is already closed')
		}

		const batch: MutableSchemaDeclarationBatch = {
			additions: [],
			canDeclare: privileges.declare,
			claims: [],
			options: [],
			owner,
			patches: [],
			surfaces: {
				modelSurfaces: [],
				operations: [],
			},
			typegen: {
				references: [],
			},
		}
		let open = true
		const assertOpen = (): void => {
			if (!open) {
				throw new TypeError(
					'Plugin schema declaration facade is already closed',
				)
			}
		}
		const assertDeclare = (): void => {
			assertOpen()
			if (!batch.canDeclare) {
				throw new TypeError('schema:declare is required for this declaration')
			}
		}
		const createSelection = <const TSelector extends SchemaSelectorOptions>(
			selector: TSelector,
		): SchemaSelection<TSelector> => {
			assertOpen()
			const selection = immutableRecord({
				selectionId: `selection:${String(this.#nextSelectionId)}`,
				selector: normalizeSelector(selector),
			})
			this.#nextSelectionId += 1
			schemaSelections.add(selection)
			return selection as SchemaSelection<TSelector>
		}
		const surfaces = createApplicationSurfaceRegistrars(
			owner,
			batch.surfaces,
			createSelection,
		)
		const typegen = createTypegenReferenceRegistrar(
			owner,
			batch.typegen,
			assertOpen,
		)
		const operations: PluginOperationDeclarationRegistrar = immutableRecord({
			declare: (operation) => {
				const receipt = surfaces.operations.declare(operation)
				if (!privileges.typegenReference) return receipt
				const references =
					operation.kind === 'plugin-operation'
						? [operation.input.typegen, operation.result.typegen]
						: [operation.input.typegen]
				for (const reference of references) {
					if (reference !== undefined) typegen.registerReachable(reference)
				}
				return receipt
			},
		})
		type SchemaSourceOptions = Parameters<
			PluginSchemaDeclarationRegistrar['add']
		>[0]
		const stageSchemaSource = (
			kind: 'addition' | 'claim',
			options: SchemaSourceOptions,
		): void => {
			assertDeclare()
			const path = `Schema ${kind}`
			if (!isPlainRecord(options)) {
				throw new TypeError(`${path} must be a plain object`)
			}
			assertNonEmptyString(options.contributionId, `${path} contributionId`)
			const sources: OwnedSchemaSource[] =
				kind === 'addition' ? batch.additions : batch.claims
			sources.push(
				immutableRecord({
					contributionId: options.contributionId,
					owner,
					schema: options.schema,
					staticOptions: snapshotStaticOptions(
						options.staticOptions,
						`${path} staticOptions`,
					),
				}),
			)
		}
		const registrar: PluginSchemaDeclarationRegistrar = immutableRecord({
			add: (options) => {
				stageSchemaSource('addition', options)
			},
			claim: (options) => {
				stageSchemaSource('claim', options)
			},
			defineOptions: (options) => {
				assertDeclare()
				if (!isPlainRecord(options)) {
					throw new TypeError('Schema option namespace must be a plain object')
				}
				assertNonEmptyString(
					options.contributionId,
					'Schema option namespace contributionId',
				)
				const staticOptions = snapshotStaticOptions(
					options.staticOptions,
					'Schema option namespace staticOptions',
				)
				for (const scope of ['schema', 'field'] as const) {
					const definitions = options[scope]
					if (definitions === undefined) continue
					if (!isPlainRecord(definitions)) {
						throw new TypeError(
							`Schema option namespace ${scope} must be a plain object`,
						)
					}
					for (const [name, definition] of Object.entries(definitions)) {
						assertNonEmptyString(name, `Schema ${scope} option name`)
						const expectedDefinitions =
							scope === 'field'
								? fieldOptionDefinitions
								: schemaOptionDefinitions
						if (!expectedDefinitions.has(definition)) {
							throw new TypeError(
								`Schema ${scope} option ${name} must be created by ${scope === 'field' ? 'defineFieldOption' : 'defineSchemaOption'}`,
							)
						}
						if (scope === 'schema' && fieldOptionDefinitions.has(definition)) {
							throw new TypeError(
								`Schema option ${name} cannot use a field option definition`,
							)
						}
						if (
							definition.runtime !== undefined &&
							!privileges.requirements.some(
								(requirement) =>
									requirement === definition.runtime?.requirement,
							)
						) {
							throw new TypeError(
								`Schema ${scope} option ${name} uses an undeclared Runtime capability requirement`,
							)
						}
						batch.options.push(
							immutableRecord({
								contributionId: `${options.contributionId}:${scope}:${name}`,
								definition,
								name,
								owner,
								scope,
								staticOptions,
							}),
						)
					}
				}
				return pluginSourceReceipt()
			},
			patch: (options) => {
				assertOpen()
				if (!batch.canDeclare) {
					throw new TypeError('schema:declare is required for patches')
				}
				if (!isPlainRecord(options)) {
					throw new TypeError('Schema patch must be a plain object')
				}
				if (!schemaSelections.has(options.targets)) {
					throw new TypeError(
						'Schema patch targets must be created by schemas.select',
					)
				}
				if (!isUnknownArray(options.operations)) {
					throw new TypeError('Schema patch operations must be a list')
				}
				for (const operation of options.operations) {
					if (!schemaPatchOperations.has(operation)) {
						throw new TypeError(
							'Schema patch operation must be created by a Core patch factory',
						)
					}
				}
				batch.patches.push(
					immutableRecord({
						operations: immutableArray(options.operations),
						owner,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'Schema patch staticOptions',
						),
						targets: options.targets,
					}),
				)
				return pluginSourceReceipt()
			},
			select: (selector) => {
				return createSelection(selector)
			},
		})

		return immutableRecord({
			close: (): void => {
				open = false
			},
			commit: (): void => {
				assertOpen()
				this.#batches.push(
					immutableRecord({
						...batch,
						additions: immutableArray(batch.additions),
						claims: immutableArray(batch.claims),
						options: immutableArray(batch.options),
						patches: immutableArray(batch.patches),
						surfaces: snapshotApplicationSurfaceDeclarations(batch.surfaces),
						typegen: snapshotTypegenDeclarations(batch.typegen),
					}),
				)
			},
			models: surfaces.models,
			operations,
			registrar,
			typegenReferences: typegen,
		})
	}

	close(): void {
		this.#closed = true
	}

	schemaAdditions(): readonly SchemaDefinition[] {
		if (!this.#closed) {
			throw new TypeError('Schema declaration registry is not closed')
		}

		const contributionIds = new Map<
			string,
			readonly PluginSchemaContributionOwner[]
		>()
		const schemas: SchemaDefinition[] = []
		for (const batch of this.#batches) {
			for (const addition of batch.additions) {
				const prior = contributionIds.get(addition.contributionId) ?? []
				if (
					prior.some((owner) => isSamePluginIdentity(owner, addition.owner))
				) {
					throw new PluginDeclarationDiagnosticError(
						`Duplicate schema contributionId: ${addition.contributionId}`,
						pluginDeclarationDiagnostic(
							addition.owner,
							addition.schema.className,
							addition.contributionId,
						),
					)
				}
				contributionIds.set(addition.contributionId, [...prior, addition.owner])
				schemas.push(addition.schema)
			}
		}

		return immutableArray(schemas)
	}

	/** Compiles private declarations and publishes one complete registry atomically. */
	compileSchemaRegistry(
		registry: SchemaRegistry,
		fieldMethods: FieldBuilderMethodResolver,
	): SchemaTargetGraph {
		const staging = stageSchemaRegistryCompilation(
			registry,
			this.schemaAdditions(),
			fieldMethods,
		)
		const compiled = compileSchemaDeclarations(staging.prepared, this.#batches)
		this.#runtimeCompilations = compiled.runtimeCompilations
		this.#compiledProvenance = compiled.provenance
		const commands = compileCommandGraph(
			this.#batches.map(({ surfaces: declarations }) => declarations),
			compiled,
			staging.registry,
		)
		const targets = publishSchemaRegistryCompilation(
			registry,
			staging,
			compiled.candidates,
		)
		this.#commands = commands
		return targets
	}

	/** Reads the private canonical graph only after atomic schema publication. */
	commandGraph(): CompiledCommandGraph {
		if (this.#commands === undefined)
			throw new TypeError('Application commands have not been compiled')
		return this.#commands
	}

	/** Reads the complete immutable graph after successful compilation. */
	typegenGraph(): CompiledTypegenGraph {
		if (this.#commands === undefined) {
			throw new TypeError('Typegen declarations require compiled schemas')
		}
		return createCompiledTypegenGraph({
			batches: this.#batches,
			commands: this.#commands,
		})
	}

	diagnoseFailure(error: unknown): PluginDeclarationFailureDiagnostic {
		return diagnosePluginDeclarationFailure(
			error,
			this.#compiledProvenance,
			this.#batches,
		)
	}

	/** Executes used Runtime option compilers after capabilities exist and before setup. */
	runRuntimeCompilers(capabilities: ApplicationCapabilityHost): void {
		if (!this.#closed || this.#runtimeCompilations === undefined) {
			throw new TypeError(
				'Schema Runtime option compilers require completed static compilation',
			)
		}
		if (this.#runtimeCompilationState === 'succeeded') return
		if (this.#runtimeCompilationState !== 'idle') {
			throw new TypeError('Schema Runtime option compilation is unavailable')
		}

		this.#runtimeCompilationState = 'running'
		try {
			executeRuntimeCompilations(this.#runtimeCompilations, capabilities)
			this.#runtimeCompilationState = 'succeeded'
		} catch (error: unknown) {
			this.#runtimeCompilationState = 'failed'
			throw error
		}
	}
}
