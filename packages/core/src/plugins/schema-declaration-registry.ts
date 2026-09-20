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
	type PendingSchemaOptionRuntimeCompilation,
	pluginDeclarationDiagnostic,
	PluginDeclarationDiagnosticError,
	type PluginDeclarationFailureDiagnostic,
	type PluginSchemaDeclarationRegistrar,
	samePluginOwner,
	type SchemaDeclarationBatch,
	snapshotStaticOptions,
} from './schema-declaration-contracts.js'

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
import {
	compileCommandGraph,
	type CompiledApplicationSchemaSurface,
	type CompiledPluginOperation,
} from './application-surface-registry.js'
import type { CompiledCommandGraph } from './command-graph.js'
import { compileSchemaDeclarations } from './compiled-schema-declarations.js'
import { createCompiledTypegenGraph } from './compiled-typegen-graph.js'
import { executeRuntimeCompilations } from './schema-runtime-options.js'
import { normalizeSelector } from './schema-selectors.js'
import {
	type CompiledTypegenGraph,
	createTypegenReferenceRegistrar,
	snapshotTypegenDeclarations,
	type TypegenReferenceRegistrar,
} from './typegen-declarations.js'

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
		const createSelection = (
			selector: SchemaSelectorOptions,
		): SchemaSelection => {
			assertOpen()
			const selection = immutableRecord({
				selectionId: `selection:${String(this.#nextSelectionId)}`,
				selector: normalizeSelector(selector),
			})
			this.#nextSelectionId += 1
			schemaSelections.add(selection)
			return selection
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
		const registrar: PluginSchemaDeclarationRegistrar = immutableRecord({
			add: (options): void => {
				assertDeclare()
				if (!isPlainRecord(options)) {
					throw new TypeError('Schema addition must be a plain object')
				}
				assertNonEmptyString(
					options.contributionId,
					'Schema addition contributionId',
				)
				batch.additions.push(
					immutableRecord({
						contributionId: options.contributionId,
						owner,
						schema: options.schema,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'Schema addition staticOptions',
						),
					}),
				)
			},
			defineOptions: (options): void => {
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
			},
			patch: (options): void => {
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
			},
			select: (selector): SchemaSelection => {
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
						options: immutableArray(batch.options),
						patches: immutableArray(batch.patches),
						surfaces: snapshotApplicationSurfaceDeclarations(batch.surfaces),
						typegen: snapshotTypegenDeclarations(batch.typegen),
					}),
				)
			},
			models: surfaces.models,
			operations: surfaces.operations,
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
				if (prior.some((owner) => samePluginOwner(owner, addition.owner))) {
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

	/** Compiles declarations through IR and publishes one complete registry atomically. */
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
			compiled.output,
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

	/** Resolves one final operation declaration after static compilation. */
	operation(name: string): CompiledPluginOperation | undefined {
		if (this.#commands === undefined) {
			throw new TypeError('Application operations have not been compiled')
		}
		return this.#commands.operation(name)
	}

	/** Reads the complete immutable graph after successful compilation. */
	typegenGraph(): CompiledTypegenGraph {
		if (this.#commands === undefined) {
			throw new TypeError('Typegen declarations require compiled schemas')
		}
		const views = this.#commands.legacyViews()
		return createCompiledTypegenGraph({
			batches: this.#batches,
			operations: views.operations,
			provenance: this.#compiledProvenance,
			schemaSurfaces: views.schemas,
		})
	}

	/** Resolves one final application schema surface after static compilation. */
	schemaSurface(
		className: string,
	): CompiledApplicationSchemaSurface | undefined {
		if (this.#commands === undefined) {
			throw new TypeError('Application schema surfaces have not been compiled')
		}
		return this.#commands.schemaSurface(className)
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
