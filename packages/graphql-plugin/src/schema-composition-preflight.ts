import {
	isEnumType,
	isInputObjectType,
	isInterfaceType,
	isObjectType,
	isScalarType,
	isSpecifiedDirective,
	isSpecifiedScalarType,
	isUnionType,
	type GraphQLDirective,
	type GraphQLNamedType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import {
	contributionOwner,
	type OwnedGraphqlSchema,
} from './schema-composition-types.js'

export interface GraphqlCompositionTypeEntry {
	readonly source: OwnedGraphqlSchema
	readonly type: GraphQLNamedType
}

export interface GraphqlCompositionTypeGroup {
	readonly key: string
	readonly name: string
	readonly entries: GraphqlCompositionTypeEntry[]
}

export interface GraphqlCompositionPreflight {
	readonly directives: readonly GraphQLDirective[]
	readonly groups: ReadonlyMap<string, GraphqlCompositionTypeGroup>
	readonly sourceGroups: ReadonlyMap<
		GraphQLNamedType,
		GraphqlCompositionTypeGroup
	>
}

const kindOf = (type: GraphQLNamedType): string => {
	if (isObjectType(type)) return 'object'
	if (isInterfaceType(type)) return 'interface'
	if (isInputObjectType(type)) return 'input object'
	if (isEnumType(type)) return 'enum'
	if (isUnionType(type)) return 'union'
	if (isScalarType(type)) return 'scalar'
	return 'unsupported'
}

const conflict = (
	entry: GraphqlCompositionTypeEntry,
	path: string,
	detail: string,
): never => {
	const owner = contributionOwner(entry.source)
	throw new GraphqlSchemaCompilationError('name-collision', detail, {
		...(owner === undefined ? {} : { owner }),
		path,
	})
}

const assertUnique = (
	group: GraphqlCompositionTypeGroup,
	values: (entry: GraphqlCompositionTypeEntry) => readonly string[],
	label: string,
): void => {
	const owners = new Map<string, GraphqlCompositionTypeEntry>()
	for (const entry of group.entries) {
		for (const value of values(entry)) {
			const existing = owners.get(value)
			if (existing !== undefined) {
				conflict(
					entry,
					`${group.name}.${value}`,
					`GraphQL ${label} "${group.name}.${value}" from ${entry.source.description} conflicts with ${existing.source.description}`,
				)
			}
			owners.set(value, entry)
		}
	}
}

const preflightGroup = (group: GraphqlCompositionTypeGroup): void => {
	const [first] = group.entries
	if (first === undefined) return
	const kind = kindOf(first.type)
	for (const entry of group.entries.slice(1)) {
		const candidate = kindOf(entry.type)
		if (candidate !== kind) {
			conflict(
				entry,
				group.name,
				`GraphQL type "${group.name}" from ${entry.source.description} is a ${candidate} but ${first.source.description} defines a ${kind}`,
			)
		}
	}
	if (kind === 'scalar' && group.entries.length > 1) {
		conflict(
			group.entries[1] ?? first,
			group.name,
			`GraphQL scalar "${group.name}" has more than one owner`,
		)
	}
	if (kind === 'object' || kind === 'interface' || kind === 'input object') {
		assertUnique(
			group,
			(entry) =>
				isObjectType(entry.type) ||
				isInterfaceType(entry.type) ||
				isInputObjectType(entry.type)
					? Object.keys(entry.type.toConfig().fields)
					: [],
			`${kind} field`,
		)
	}
	if (kind === 'enum') {
		assertUnique(
			group,
			(entry) =>
				isEnumType(entry.type) ? Object.keys(entry.type.toConfig().values) : [],
			'enum value',
		)
	}
	if (kind === 'union') {
		assertUnique(
			group,
			(entry) =>
				isUnionType(entry.type)
					? entry.type.toConfig().types.map(({ name }) => name)
					: [],
			'union member',
		)
	}
}

/** Collects every source identity and rejects ambiguous merge ownership. */
export const preflightGraphqlSchemas = (
	schemas: readonly OwnedGraphqlSchema[],
): GraphqlCompositionPreflight => {
	const directives: GraphQLDirective[] = []
	const directiveOwners = new Map<string, OwnedGraphqlSchema>()
	const groups = new Map<string, GraphqlCompositionTypeGroup>()
	const sourceGroups = new Map<GraphQLNamedType, GraphqlCompositionTypeGroup>()
	for (const source of schemas) {
		if (source.schema.getSubscriptionType() != null) {
			throw new GraphqlSchemaCompilationError(
				'unsupported-feature',
				`GraphQL subscriptions from ${source.description} are not supported`,
				{ path: 'Subscription' },
			)
		}
		const roots = new Map<
			GraphQLNamedType,
			Readonly<{ key: string; name: string }>
		>()
		for (const [key, name, root] of [
			['@query', 'Query', source.schema.getQueryType()],
			['@mutation', 'Mutation', source.schema.getMutationType()],
			['@subscription', 'Subscription', source.schema.getSubscriptionType()],
		] as const) {
			if (root != null) roots.set(root, { key, name })
		}
		for (const type of Object.values(source.schema.getTypeMap())) {
			if (type.name.startsWith('__') || isSpecifiedScalarType(type)) continue
			const root = roots.get(type)
			const key = root?.key ?? `type:${type.name}`
			const group = groups.get(key) ?? {
				key,
				name: root?.name ?? type.name,
				entries: [],
			}
			group.entries.push({ source, type })
			groups.set(key, group)
			sourceGroups.set(type, group)
		}
		for (const directive of source.schema.getDirectives()) {
			if (isSpecifiedDirective(directive)) continue
			const existing = directiveOwners.get(directive.name)
			if (existing !== undefined) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL directive "@${directive.name}" from ${source.description} conflicts with ${existing.description}`,
					{ path: `@${directive.name}` },
				)
			}
			directiveOwners.set(directive.name, source)
			directives.push(directive)
		}
	}
	for (const group of groups.values()) preflightGroup(group)
	const names = new Map<string, GraphqlCompositionTypeGroup>()
	for (const group of groups.values()) {
		const existing = names.get(group.name)
		const entry = group.entries[0]
		if (
			existing !== undefined &&
			existing.key !== group.key &&
			entry !== undefined
		) {
			conflict(
				entry,
				group.name,
				`GraphQL type "${group.name}" has incompatible schema and named-type ownership`,
			)
		}
		names.set(group.name, group)
	}
	return { directives, groups, sourceGroups }
}
