import { createHash } from 'node:crypto'

import type { SchemaContributionOwner } from '@ultimabase/core'

import { GraphqlSchemaCompilationError } from './errors.js'

const typeNamePattern = /^[A-Z][_0-9A-Za-z]*$/u
const fieldNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u
const enumNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

interface NameOwner {
	readonly description: string
	readonly owner?: SchemaContributionOwner
}

/** Validates and owns every generated type identity before GraphQL sees it. */
export class GraphqlNameRegistry {
	readonly #types = new Map<string, NameOwner>()

	claimType(name: string, source: NameOwner): void {
		if (!typeNamePattern.test(name) || name.startsWith('__')) {
			throw new GraphqlSchemaCompilationError(
				'invalid-name',
				`Invalid GraphQL type name "${name}" from ${source.description}`,
				{
					...(source.owner === undefined ? {} : { owner: source.owner }),
					path: name,
				},
			)
		}
		const existing = this.#types.get(name)
		if (existing !== undefined) {
			throw new GraphqlSchemaCompilationError(
				'name-collision',
				`GraphQL type "${name}" from ${source.description} conflicts with ${existing.description}`,
				{
					...(source.owner === undefined ? {} : { owner: source.owner }),
					path: name,
				},
			)
		}
		this.#types.set(name, source)
	}
}

/** Rejects schema fields that cannot be represented without an alias. */
export const assertGraphqlFieldName = (
	name: string,
	description: string,
	owner?: SchemaContributionOwner,
): void => {
	if (!fieldNamePattern.test(name) || name.startsWith('__')) {
		throw new GraphqlSchemaCompilationError(
			'invalid-name',
			`Invalid GraphQL field name "${name}" from ${description}`,
			{ ...(owner === undefined ? {} : { owner }), path: name },
		)
	}
}

/** Produces the stable child-name segment shared with Typegen conventions. */
export const graphqlFieldTypeSegment = (name: string): string =>
	`${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`

/** Maps every Core enum value to one reversible GraphQL enum identity. */
export const graphqlEnumValueName = (value: string): string =>
	enumNamePattern.test(value) && !value.startsWith('__')
		? value
		: `VALUE_${createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase()}`
