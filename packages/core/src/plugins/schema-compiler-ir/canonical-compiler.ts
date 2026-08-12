import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaContributionOwner } from '../../schema/schema/provenance.js'
import { attachPluginDeclarationDiagnostic } from '../schema-declaration-contracts.js'
import { applyCanonicalArtifactOperation } from './canonical-artifact-operations.js'
import { applyCanonicalFieldOperation } from './canonical-field-operations.js'
import { applyCanonicalIndexOperation } from './canonical-index-operations.js'
import { applyCanonicalOptionOperation } from './canonical-option-operations.js'
import {
	assertUnusedCompilerContributionId,
	type CanonicalSchemaOperationContext,
} from './canonical-operation-context.js'
import { matchesSchemaCompilerSelector } from './canonical-selectors.js'
import {
	createCanonicalSchemaCompilerState,
	snapshotCanonicalSchemaCompilerState,
	type CanonicalSchemaCompilerState,
} from './canonical-state.js'
import type {
	SchemaCompilerInput,
	SchemaCompilerOutput,
	SchemaCompilerPatchOperation,
} from './contracts.js'

const operationHandlers = [
	applyCanonicalFieldOperation,
	applyCanonicalArtifactOperation,
	applyCanonicalOptionOperation,
	applyCanonicalIndexOperation,
] as const

const applyCanonicalOperation = (
	context: CanonicalSchemaOperationContext,
	operation: SchemaCompilerPatchOperation,
): void => {
	assertUnusedCompilerContributionId(
		context.state,
		context.patch.owner,
		operation.contributionId,
	)
	if (!operationHandlers.some((handler) => handler(context, operation))) {
		throw new TypeError(`Unsupported schema patch operation: ${operation.kind}`)
	}
}

/**
 * Compiles one complete schema graph using only the public callback-free IR.
 * Artifact resolution and executable option semantics deliberately stay outside.
 */
export const compileCanonicalSchemaCompilerIr = (
	input: SchemaCompilerInput,
): SchemaCompilerOutput => {
	const states = input.schemas.map(createCanonicalSchemaCompilerState)
	const owners = new Map<CanonicalSchemaCompilerState, SchemaContributionOwner>(
		states.map((state) => [state, state.provenance.schema.owner]),
	)
	const definitions = immutableArray(
		input.declarations.flatMap(({ optionDefinitions }) => optionDefinitions),
	)
	const classNames = new Set(states.map(({ className }) => className))
	const selectionResults: SchemaCompilerOutput['selections'][number][] = []

	for (const declaration of input.declarations) {
		const frozenTargets = new Map<
			string,
			readonly CanonicalSchemaCompilerState[]
		>()
		for (const selection of declaration.selections) {
			if (!frozenTargets.has(selection.selectionId)) {
				const targets = states.filter((state) => {
					try {
						return matchesSchemaCompilerSelector(
							state,
							owners.get(state) ?? state.provenance.schema.owner,
							selection.selector,
						)
					} catch (cause: unknown) {
						throw attachPluginDeclarationDiagnostic(
							cause,
							declaration.owner,
							state.className,
						)
					}
				})
				const frozen = immutableArray(targets)
				frozenTargets.set(selection.selectionId, frozen)
				selectionResults.push(
					immutableRecord({
						classNames: immutableArray(
							frozen.map(({ className }) => className),
						),
						selectionId: selection.selectionId,
					}),
				)
			}
		}

		for (const addition of declaration.additions) {
			if (classNames.has(addition.schema.className)) {
				throw new TypeError(
					`Duplicate schema class name: ${addition.schema.className}`,
				)
			}
			const state = createCanonicalSchemaCompilerState(addition.schema)
			classNames.add(state.className)
			states.push(state)
			owners.set(state, declaration.owner)
		}

		for (const patch of declaration.patches) {
			for (const state of frozenTargets.get(patch.selectionId) ?? []) {
				const context: CanonicalSchemaOperationContext = {
					definitions,
					patch,
					state,
				}
				for (const operation of patch.operations) {
					try {
						applyCanonicalOperation(context, operation)
					} catch (cause: unknown) {
						throw attachPluginDeclarationDiagnostic(
							cause,
							patch.owner,
							state.className,
							operation.contributionId,
						)
					}
				}
			}
		}
	}

	return immutableRecord({
		protocolVersion: input.protocolVersion,
		selections: immutableArray(selectionResults),
		schemas: immutableArray(states.map(snapshotCanonicalSchemaCompilerState)),
	})
}
