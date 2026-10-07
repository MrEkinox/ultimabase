import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { isCoreFieldOptionKey } from '../schema/fields/base/options.js'
import type { PreparedSchemaCompilation } from '../schema/schema/definition.js'
import type { SchemaOptionProvenance } from '../schema/schema/provenance.js'
import type { ApplicationCapabilityHost } from './capability-host.js'
import {
	attachPluginDeclarationDiagnostic,
	type OptionDefinitionIndex,
	type OwnedOptionDefinition,
	type PendingSchemaOptionRuntimeCompilation,
	type SchemaDeclarationBatch,
} from './schema-declaration-contracts.js'
import { coreSchemaKeys } from '../schema/schema/registry.js'
import { readDeclaredRuntimeCapability, sameOwner } from './schema-selectors.js'

const readCompiledOptionValue = (source: unknown, name: string): unknown => {
	if (!isPlainRecord(source)) {
		throw new TypeError('Compiled schema options must be a plain object')
	}
	return source[name]
}

/** Executes compiled option behavior only after application capabilities exist. */
export const executeRuntimeCompilations = (
	compilations: readonly PendingSchemaOptionRuntimeCompilation[],
	capabilities: ApplicationCapabilityHost,
): void => {
	for (const compilation of compilations) {
		try {
			const capability = readDeclaredRuntimeCapability(
				capabilities.forPlugin(compilation.owner),
				compilation.runtime.requirement,
			)
			const context = immutableRecord({
				...compilation.context,
				capability,
			})
			compilation.runtime.compile(context)
		} catch (cause: unknown) {
			throw attachPluginDeclarationDiagnostic(
				cause,
				compilation.owner,
				compilation.context.path,
				compilation.context.provenance.definition.contributionId,
			)
		}
	}
}

/** Collects only final option occurrences still owned by their Runtime descriptor. */
export const collectRuntimeCompilations = (
	batches: readonly SchemaDeclarationBatch[],
	candidates: readonly PreparedSchemaCompilation[],
): readonly PendingSchemaOptionRuntimeCompilation[] => {
	const compilations: PendingSchemaOptionRuntimeCompilation[] = []

	// Descriptor declaration order preserves plugin dependency and registration order.
	for (const batch of batches) {
		for (const option of batch.options) {
			const runtime = option.definition.runtime
			if (runtime === undefined) continue
			// Records one occurrence whose final value is still owned by this descriptor.
			const collect = (
				className: string,
				fieldName: string | undefined,
				provenance: SchemaOptionProvenance | undefined,
				path: string,
				readValue: () => unknown,
			): void => {
				if (provenance === undefined) {
					throw new TypeError(
						`Missing ${fieldName === undefined ? 'schema' : 'field'} option provenance: ${path}`,
					)
				}
				if (
					!sameOwner(provenance.definition.owner, option.owner) ||
					provenance.definition.contributionId !== option.contributionId
				) {
					return
				}
				compilations.push(
					immutableRecord({
						context: immutableRecord({
							className,
							...(fieldName === undefined
								? {}
								: { fieldName, fieldContext: 'stored' as const }),
							optionName: option.name,
							path,
							provenance,
							scope: option.scope,
							// Static normalization already proved the owner-defined value contract.
							value: readValue(),
						}),
						owner: option.owner,
						runtime,
					}),
				)
			}

			for (const { definition, schema } of candidates) {
				const { className } = schema
				if (option.scope === 'schema') {
					if (!Object.hasOwn(definition, option.name)) continue
					collect(
						className,
						undefined,
						definition.provenance.options[option.name],
						`${className}.${option.name}`,
						() => readCompiledOptionValue(definition, option.name),
					)
					continue
				}

				for (const [fieldName, field] of Object.entries(
					definition.persistedFields,
				)) {
					if (!Object.hasOwn(field.options, option.name)) continue
					collect(
						className,
						fieldName,
						definition.provenance.fieldOptions[fieldName]?.[option.name],
						`${className}.fields.${fieldName}.options.${option.name}`,
						() => readCompiledOptionValue(field.options, option.name),
					)
				}
			}
		}
	}

	return immutableArray(compilations)
}

/** Builds the owner-aware option index and rejects Core namespace collisions. */
export const collectOptionDefinitions = (
	batches: readonly SchemaDeclarationBatch[],
): OptionDefinitionIndex => {
	const field = new Map<string, readonly OwnedOptionDefinition[]>()
	const schema = new Map<string, readonly OwnedOptionDefinition[]>()

	for (const batch of batches) {
		for (const option of batch.options) {
			if (
				(option.scope === 'schema' && coreSchemaKeys.has(option.name)) ||
				(option.scope === 'field' && isCoreFieldOptionKey(option.name))
			) {
				const cause = new TypeError(
					`Plugin option collides with Core-owned ${option.scope} option: ${option.name}`,
				)
				throw attachPluginDeclarationDiagnostic(
					cause,
					option.owner,
					`${option.scope}.options.${option.name}`,
					option.contributionId,
				)
			}
			const target = option.scope === 'field' ? field : schema
			target.set(option.name, [...(target.get(option.name) ?? []), option])
		}
	}

	return immutableRecord({ field, schema })
}
