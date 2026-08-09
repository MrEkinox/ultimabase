import type {
	TypegenApplicationSnapshot,
	TypegenFieldSnapshot,
} from '../../snapshot.js'
import { listDepth } from '../values.js'
import {
	equalityKinds,
	nullProperties,
	renderNamedFilter,
} from './operators.js'
import { renderRelationshipFilters } from './relationships.js'
import { renderScalarFilters } from './scalar.js'
import { renderStructuralFilters } from './structural.js'

const collectNestedFields = (
	fields: readonly TypegenFieldSnapshot[],
): readonly TypegenFieldSnapshot[] =>
	fields.flatMap((field) => [
		field,
		...(field.value.kind === 'object'
			? collectNestedFields(field.value.fields)
			: []),
	])

/** Coordinates shared declarations while preserving their deterministic order. */
export const renderSharedTypes = (
	snapshot: TypegenApplicationSnapshot,
): string => {
	const rootFields = snapshot.schemas.flatMap(({ fields }) => fields)
	const nestedFields = snapshot.schemas.flatMap(({ fields }) =>
		fields.flatMap((field) =>
			field.value.kind === 'object'
				? collectNestedFields(field.value.fields)
				: [],
		),
	)
	const allFields = [...rootFields, ...nestedFields]
	const definitions: string[] = [`export type OrderDirection = "asc" | "desc"`]

	if (
		allFields.some(
			(field) =>
				listDepth(field) > 0 ||
				(!equalityKinds.has(field.kind) &&
					field.value.kind !== 'object' &&
					field.value.kind !== 'relation'),
		)
	) {
		definitions.push(renderNamedFilter('NullFilter', [nullProperties]))
	}

	definitions.push(
		...renderScalarFilters(rootFields, nestedFields),
		...renderStructuralFilters(rootFields, nestedFields, allFields),
		...renderRelationshipFilters(rootFields),
	)

	return definitions.join('\n\n')
}
