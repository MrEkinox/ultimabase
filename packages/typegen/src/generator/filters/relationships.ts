import type { TypegenFieldSnapshot } from '../../snapshot.js'
import {
	nullProperties,
	renderEqualityProperties,
	renderNamedFilter,
	renderOrderedProperties,
} from './operators.js'

/** Renders pointer and relation filter declarations when the root schema uses them. */
export const renderRelationshipFilters = (
	rootFields: readonly TypegenFieldSnapshot[],
): readonly string[] => {
	const definitions: string[] = []

	if (rootFields.some(({ value }) => value.kind === 'pointer')) {
		definitions.push(
			renderNamedFilter('PointerFilter<TWhere>', [
				renderEqualityProperties('string | null'),
				'\treadonly is?: TWhere',
				'\treadonly isNot?: TWhere',
				nullProperties,
			]),
		)
	}

	if (rootFields.some(({ value }) => value.kind === 'relation')) {
		definitions.push(
			renderNamedFilter('RelationFilter<TWhere>', [
				`\treadonly count?: {
${renderEqualityProperties('number | null').replaceAll('\t', '\t\t')}
${renderOrderedProperties('number | null').replaceAll('\t', '\t\t')}
\t\treadonly where?: TWhere
\t}`,
				'\treadonly every?: TWhere',
				'\treadonly isEmpty?: true',
				'\treadonly isNotEmpty?: true',
				'\treadonly none?: TWhere',
				'\treadonly some?: TWhere',
			]),
		)
	}

	return definitions
}
