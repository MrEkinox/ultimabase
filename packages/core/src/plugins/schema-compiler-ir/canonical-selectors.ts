import { isPlainRecord } from '@ultimabase/shared'

import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/definition.js'
import type { SchemaContributionOwner } from '../../schema/schema/provenance.js'
import type { SchemaSelectorOptions } from '../schema-patch-contracts.js'
import { sameCompilerOwner } from './canonical-state.js'
import type { CanonicalSchemaCompilerState } from './canonical-state.js'

const readOptionPath = (value: unknown, path: readonly string[]): unknown => {
	let current = value
	for (const segment of path) {
		if (!isPlainRecord(current) || !Object.hasOwn(current, segment)) {
			return undefined
		}
		current = current[segment]
	}
	return current
}

/** Matches one frozen selector using only callback-free compiler facts. */
export const matchesSchemaCompilerSelector = (
	state: CanonicalSchemaCompilerState,
	owner: SchemaContributionOwner,
	selector: SchemaSelectorOptions,
): boolean => {
	if (
		selector.className !== undefined &&
		state.className !== selector.className
	) {
		return false
	}
	if (
		selector.owner !== undefined &&
		!sameCompilerOwner(owner, selector.owner)
	) {
		return false
	}
	if (selector.field !== undefined) {
		const field = state.fields.find(({ name }) => name === selector.field?.name)
		if (
			field === undefined ||
			(selector.field.kind !== undefined && field.kind !== selector.field.kind)
		) {
			return false
		}
	}
	if (selector.option !== undefined) {
		const option = state.options.find(
			({ name }) => name === selector.option?.name,
		)
		const selected = readOptionPath(option?.value, selector.option.path ?? [])
		if (
			!areSchemaDeclarationValuesCompatible(selected, selector.option.equals)
		) {
			return false
		}
	}
	return true
}
