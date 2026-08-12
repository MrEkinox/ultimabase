import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import type { FieldBuilderMethodResolver } from '../schema/schema/field-builder-methods.js'
import {
	publishSchemaRegistryCompilation,
	type SchemaRegistry,
	stageSchemaRegistryCompilation,
} from '../schema/schema/registry.js'
import type { SchemaTargetGraph } from '../schema/schema/targets.js'

import type { CapabilityRequirement } from './capabilities.js'

import type { ApplicationCapabilityHost } from './capability-host.js'

import {
	type PluginSchemaContributionOwner,
	type SchemaCompilationProvenance,
} from '../schema/schema/provenance.js'

import {
	attachPluginDeclarationDiagnostic,
	diagnosePluginDeclarationFailure,
	type MutableSchemaDeclarationBatch,
	type OwnedSchemaAddition,
	type PendingSchemaOptionRuntimeCompilation,
	pluginDeclarationDiagnostic,
	PluginDeclarationDiagnosticError,
	type PluginDeclarationFailureDiagnostic,
	type PluginSchemaDeclarationRegistrar,
	type ResolvedFieldOptions,
	samePluginOwner,
	type SchemaDeclarationBatch,
	snapshotStaticOptions,
} from './schema-declaration-contracts.js'

import { attachInitialContributionProvenance } from './schema-declaration-provenance.js'

import { schemaOptionDefinitions } from './schema-option-definitions.js'

import { resolveCandidateOptions } from './schema-option-resolution.js'

import {
	type SchemaSelection,
	schemaPatchOperations,
	schemaSelections,
} from './schema-patch-contracts.js'

import { normalizeSelector } from './schema-selectors.js'
import {
	collectOptionDefinitions,
	collectRuntimeCompilations,
	executeRuntimeCompilations,
} from './schema-runtime-options.js'
import { compileCanonicalSchemaCompilerIr } from './schema-compiler-ir/canonical-compiler.js'
import { decodeSchemaCompilerOutput } from './schema-compiler-ir/decoder.js'
import { encodeSchemaCompilerInput } from './schema-compiler-ir/input-encoder.js'
import { assertSchemaCompilerOutput } from './schema-compiler-ir/validation.js'

export class SchemaDeclarationRegistry {
	readonly #batches: SchemaDeclarationBatch[] = []
	#closed = false
	#runtimeCompilations:
		readonly PendingSchemaOptionRuntimeCompilation[] | undefined
	#runtimeCompilationState: 'failed' | 'idle' | 'running' | 'succeeded' = 'idle'
	#compiledProvenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined

	beginPluginDeclaration(
		owner: PluginSchemaContributionOwner,
		privileges: Readonly<{
			declare: boolean
			requirements: readonly CapabilityRequirement[]
			transform: boolean
		}>,
	): Readonly<{
		close(): void
		commit(): void
		registrar: PluginSchemaDeclarationRegistrar
	}> {
		if (this.#closed) {
			throw new TypeError('Schema declaration registry is already closed')
		}

		const batch: MutableSchemaDeclarationBatch = {
			additions: [],
			canDeclare: privileges.declare,
			canTransform: privileges.transform,
			options: [],
			owner,
			patches: [],
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
						if (!schemaOptionDefinitions.has(definition)) {
							throw new TypeError(
								`Schema ${scope} option ${name} must be created by defineSchemaOption`,
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
				if (!batch.canDeclare && !batch.canTransform) {
					throw new TypeError(
						'schema:declare or schema:transform is required for patches',
					)
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
					const requiresTransform =
						operation.kind === 'field:replace' ||
						operation.kind === 'field:rename' ||
						operation.kind === 'field:remove' ||
						operation.kind === 'index:replace' ||
						operation.kind === 'index:remove' ||
						operation.kind === 'extension:replace' ||
						operation.kind === 'extension:remove' ||
						operation.kind === 'constraint:replace' ||
						operation.kind === 'constraint:remove' ||
						operation.kind === 'schema-option:remove' ||
						operation.kind === 'field-option:remove' ||
						(operation.kind === 'schema-option:set' &&
							operation.target !== undefined) ||
						(operation.kind === 'field-option:set' &&
							operation.target !== undefined)
					if (requiresTransform && !batch.canTransform) {
						throw new TypeError(
							'schema:transform is required for replacement, rename, or removal',
						)
					}
					if (!requiresTransform && !batch.canDeclare) {
						throw new TypeError('schema:declare is required for additions')
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
				assertOpen()
				const selection = immutableRecord({
					selector: normalizeSelector(selector),
				})
				schemaSelections.add(selection)
				return selection
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
					}),
				)
			},
			registrar,
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
		const prepared = this.#compilePrepared(staging.prepared)
		return publishSchemaRegistryCompilation(registry, staging, prepared)
	}

	#compilePrepared(
		prepared: readonly PreparedSchemaCompilation[],
	): readonly PreparedSchemaCompilation[] {
		if (!this.#closed) {
			throw new TypeError('Schema declaration registry is not closed')
		}

		const optionDefinitions = collectOptionDefinitions(this.#batches)
		const resolvedFields: ResolvedFieldOptions = new WeakMap()
		const additionsBySchema = new Map<SchemaDefinition, OwnedSchemaAddition>()
		for (const batch of this.#batches) {
			for (const addition of batch.additions) {
				additionsBySchema.set(addition.schema, addition)
			}
		}
		let candidates = prepared.map((candidate) => {
			const addition = additionsBySchema.get(candidate.schema)
			try {
				const resolved = resolveCandidateOptions(
					candidate,
					optionDefinitions,
					resolvedFields,
					addition?.owner,
				)
				return attachInitialContributionProvenance(
					resolved,
					addition,
					optionDefinitions,
				)
			} catch (cause: unknown) {
				if (addition === undefined) throw cause
				throw attachPluginDeclarationDiagnostic(
					cause,
					addition.owner,
					candidate.schema.className,
					addition.contributionId,
				)
			}
		})
		const encoded = encodeSchemaCompilerInput(candidates, this.#batches, {
			definitions: optionDefinitions,
			resolvedFields,
		})
		const output = compileCanonicalSchemaCompilerIr(encoded.input)
		assertSchemaCompilerOutput(encoded.input, output, encoded.session)
		candidates = [...decodeSchemaCompilerOutput(output, encoded.session)]

		this.#runtimeCompilations = collectRuntimeCompilations(
			this.#batches,
			candidates,
		)
		this.#compiledProvenance = new Map(
			candidates.map((candidate) => [
				candidate.schema.className,
				candidate.definition.provenance,
			]),
		)

		return immutableArray(candidates)
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
