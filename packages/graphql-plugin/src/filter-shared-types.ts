import {
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLNamedType,
	type GraphQLNullableInputType,
} from 'graphql'

import type { GraphqlNameRegistry } from './names.js'
import { GraphqlJSON } from './scalars.js'

/** Owns read-input types shared by every generated schema. */
export class GraphqlFilterSharedTypes {
	readonly #names: GraphqlNameRegistry
	readonly #types: GraphQLNamedType[] = []
	#direction: GraphQLEnumType | undefined
	#regex: GraphQLInputObjectType | undefined
	#regexFlag: GraphQLEnumType | undefined
	#jsonPath: GraphQLInputObjectType | undefined

	constructor(names: GraphqlNameRegistry) {
		this.#names = names
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#types
	}

	#claim(name: string): void {
		this.#names.claimType(name, {
			description: `shared GraphQL read input ${name}`,
		})
	}

	#list(
		type: GraphQLNullableInputType,
	): GraphQLList<GraphQLNonNull<GraphQLNullableInputType>> {
		return new GraphQLList(new GraphQLNonNull(type))
	}

	regex(): GraphQLInputObjectType {
		if (this.#regex !== undefined) return this.#regex
		this.#claim('GraphqlRegexFlag')
		this.#regexFlag = new GraphQLEnumType({
			name: 'GraphqlRegexFlag',
			values: {
				CASE_INSENSITIVE: { value: 'case-insensitive' },
				DOT_MATCHES_NEWLINE: { value: 'dot-matches-newline' },
				MULTILINE: { value: 'multiline' },
			},
		})
		this.#claim('GraphqlRegexPattern')
		this.#regex = new GraphQLInputObjectType({
			name: 'GraphqlRegexPattern',
			fields: {
				flags: { type: new GraphQLNonNull(this.#list(this.#regexFlag)) },
				source: { type: new GraphQLNonNull(GraphQLString) },
			},
		})
		this.#types.push(this.#regexFlag, this.#regex)
		return this.#regex
	}

	jsonPath(): GraphQLInputObjectType {
		if (this.#jsonPath !== undefined) return this.#jsonPath
		this.#claim('GraphqlJsonPathExpression')
		this.#jsonPath = new GraphQLInputObjectType({
			name: 'GraphqlJsonPathExpression',
			fields: {
				source: { type: new GraphQLNonNull(GraphQLString) },
				variables: { type: GraphqlJSON },
			},
		})
		this.#types.push(this.#jsonPath)
		return this.#jsonPath
	}

	direction(): GraphQLEnumType {
		if (this.#direction !== undefined) return this.#direction
		this.#claim('GraphqlOrderDirection')
		this.#direction = new GraphQLEnumType({
			name: 'GraphqlOrderDirection',
			values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } },
		})
		this.#types.push(this.#direction)
		return this.#direction
	}
}
