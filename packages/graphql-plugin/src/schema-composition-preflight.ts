import type {
	ApplicationCallbackExecutor,
	PluginIdentity,
	SchemaContributionOwner,
} from '@ultimabase/core'
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
	type GraphQLSchema,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'

/** @internal Identifies one completed schema and its callback authority. */
export interface OwnedGraphqlSchema {
	readonly attribution:
		| Readonly<{ readonly kind: 'application' }>
		| Readonly<{
				readonly kind: 'generated' | 'plugin'
				readonly owner: PluginIdentity
				readonly pluginVersion: string
		  }>
	readonly description: string
	readonly schema: GraphQLSchema
}

/** @internal Supplies trusted attribution while cloning contributed callbacks. */
export interface GraphqlSchemaCompositionContext {
	readonly callbacks: ApplicationCallbackExecutor
	readonly schemas: readonly OwnedGraphqlSchema[]
}

const contributionOwner = (
	entry: OwnedGraphqlSchema,
): SchemaContributionOwner =>
	entry.attribution.kind === 'application'
		? { kind: 'application' }
		: {
				kind: 'plugin',
				pluginId: entry.attribution.owner.pluginId,
				version: entry.attribution.pluginVersion,
				...(entry.attribution.owner.instanceId === undefined
					? {}
					: { instanceId: entry.attribution.owner.instanceId }),
			}

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
}

// Names each mergeable kind and the label of the members that must stay unique.
const kindOf = (
	type: GraphQLNamedType,
): Readonly<{ kind: string; members?: string }> => {
	if (isObjectType(type)) return { kind: 'object', members: 'object field' }
	if (isInterfaceType(type)) {
		return { kind: 'interface', members: 'interface field' }
	}
	if (isInputObjectType(type)) {
		return { kind: 'input object', members: 'input object field' }
	}
	if (isEnumType(type)) return { kind: 'enum', members: 'enum value' }
	if (isUnionType(type)) return { kind: 'union', members: 'union member' }
	return { kind: isScalarType(type) ? 'scalar' : 'unsupported' }
}

const memberNames = (type: GraphQLNamedType): readonly string[] => {
	if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
		return Object.keys(type.toConfig().fields)
	}
	if (isEnumType(type)) return Object.keys(type.toConfig().values)
	return isUnionType(type) ? type.toConfig().types.map(({ name }) => name) : []
}

const conflict = (
	entry: GraphqlCompositionTypeEntry,
	path: string,
	detail: string,
): never => {
	throw new GraphqlSchemaCompilationError('name-collision', detail, {
		owner: contributionOwner(entry.source),
		path,
	})
}

const preflightGroup = (group: GraphqlCompositionTypeGroup): void => {
	const [first] = group.entries
	if (first === undefined) return
	const { kind, members } = kindOf(first.type)
	for (const entry of group.entries.slice(1)) {
		const candidate = kindOf(entry.type).kind
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
	if (members === undefined) return
	// Merged object, interface, input, enum and union members need one owner each.
	const owners = new Map<string, GraphqlCompositionTypeEntry>()
	for (const entry of group.entries) {
		for (const value of memberNames(entry.type)) {
			const existing = owners.get(value)
			if (existing !== undefined) {
				conflict(
					entry,
					`${group.name}.${value}`,
					`GraphQL ${members} "${group.name}.${value}" from ${entry.source.description} conflicts with ${existing.source.description}`,
				)
			}
			owners.set(value, entry)
		}
	}
}

/** Collects every source identity and rejects ambiguous merge ownership. */
export const preflightGraphqlSchemas = (
	schemas: readonly OwnedGraphqlSchema[],
): GraphqlCompositionPreflight => {
	const directives: GraphQLDirective[] = []
	const directiveOwners = new Map<string, OwnedGraphqlSchema>()
	const groups = new Map<string, GraphqlCompositionTypeGroup>()
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
		// Subscription roots were rejected above, so only two roots can merge.
		for (const [key, name, root] of [
			['@query', 'Query', source.schema.getQueryType()],
			['@mutation', 'Mutation', source.schema.getMutationType()],
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
	return { directives, groups }
}
