import type { ApplicationCallbackExecutor } from '@ultimabase/core'
import {
	assertEnumType,
	assertInputObjectType,
	assertInterfaceType,
	assertObjectType,
	assertUnionType,
	buildSchema,
	getNamedType,
	GraphQLObjectType,
	GraphQLScalarType,
	GraphQLSchema,
	graphql,
	Kind,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { composeGraphqlSchemas } from './schema-composition.js'

const callbacks: ApplicationCallbackExecutor = {
	runApplication: (callback) => callback(),
	runPlugin: (_owner, callback) => callback(),
}

const required = <TValue>(value: TValue | null | undefined): TValue => {
	if (value == null) throw new Error('Expected fixture value')
	return value
}

const compose = (...schemas: GraphQLSchema[]): GraphQLSchema =>
	composeGraphqlSchemas({
		callbacks,
		schemas: schemas.map((schema, index) => ({
			attribution: { kind: 'application' },
			description: `schema ${String(index)}`,
			schema,
		})),
	})

describe('GraphQL composition reference parity', () => {
	it('rewires cycles, wrappers, enum values and directive arguments without mutating sources', () => {
		const first = buildSchema(`
			schema { query: FirstRoot }
			directive @filter(value: Filter) on FIELD
			enum Choice { FIRST }
			input Filter { next: [Filter!] choice: Choice }
			type Item { next: [Item!]! choice: Choice }
			type FirstRoot { items(filter: Filter): [Item!]! self: [FirstRoot!]! }
		`)
		const second = buildSchema(`
			schema { query: SecondRoot }
			enum Choice { SECOND }
			input Filter { limit: Int }
			type Item { label: String }
			type FirstRoot { value: String }
			type SecondRoot { item: Item originalRootName: FirstRoot }
		`)
		const originalChoice = assertEnumType(first.getType('Choice'))
		const value = { identity: 'first-value' }
		required(originalChoice.getValues()[0]).value = value
		const originalItem = assertObjectType(first.getType('Item'))
		originalItem.description = 'first description'
		const schema = compose(first, second)
		const query = assertObjectType(schema.getQueryType())
		const item = assertObjectType(schema.getType('Item'))
		const filter = assertInputObjectType(schema.getType('Filter'))
		const choice = assertEnumType(schema.getType('Choice'))

		expect(query.name).toBe('Query')
		expect(Object.keys(query.getFields())).toEqual([
			'items',
			'self',
			'item',
			'originalRootName',
		])
		expect(getNamedType(query.getFields().self?.type)).toBe(query)
		expect(getNamedType(query.getFields().originalRootName?.type)).toBe(
			schema.getType('FirstRoot'),
		)
		expect(schema.getType('FirstRoot')).not.toBe(query)
		expect(schema.getType('SecondRoot')).toBeUndefined()
		expect(getNamedType(query.getFields().items?.type)).toBe(item)
		expect(String(query.getFields().items?.type)).toBe('[Item!]!')
		expect(getNamedType(item.getFields().next?.type)).toBe(item)
		expect(getNamedType(filter.getFields().next?.type)).toBe(filter)
		expect(query.getFields().items?.args[0]?.type).toBe(filter)
		expect(schema.getDirective('filter')?.args[0]?.type).toBe(filter)
		expect(getNamedType(item.getFields().choice?.type)).toBe(choice)
		expect(choice.getValues().map(({ name }) => name)).toEqual([
			'FIRST',
			'SECOND',
		])
		expect(choice.getValues()[0]?.value).toBe(value)
		expect(Object.keys(filter.getFields())).toEqual(['next', 'choice', 'limit'])
		expect(item.description).toBe('first description')

		required(originalItem.getFields().next).description = 'mutated field'
		required(
			required(assertObjectType(first.getQueryType()).getFields().items)
				.args[0],
		).type = originalChoice
		required(required(first.getDirective('filter')).args[0]).type =
			originalChoice
		required(
			assertInputObjectType(first.getType('Filter')).getFields().choice,
		).type = originalChoice
		required(originalChoice.getValues()[0]).description = 'mutated enum'
		expect(item.getFields().next?.description).toBeUndefined()
		expect(query.getFields().items?.args[0]?.type).toBe(filter)
		expect(schema.getDirective('filter')?.args[0]?.type).toBe(filter)
		expect(filter.getFields().choice?.type).toBe(choice)
		expect(choice.getValues()[0]?.description).toBeUndefined()
		expect(Object.keys(originalItem.getFields())).toEqual(['next', 'choice'])
	})

	it('does not promote a non-root Mutation or Subscription type', () => {
		const schema = compose(
			buildSchema(`
			schema { query: Root }
			type Root { ok: String }
			type Mutation { value: String }
			type Subscription { value: String }
		`),
		)
		expect(schema.getMutationType()).toBeUndefined()
		expect(schema.getSubscriptionType()).toBeUndefined()
		expect(schema.getType('Mutation')).toBeDefined()
		expect(schema.getType('Subscription')).toBeDefined()
	})

	it('preserves merged abstract types and the first-owner type callbacks', async () => {
		const first = buildSchema(`
			interface Node { id: ID! }
			type One implements Node { id: ID! }
			union Result = One
			type Query { node: Node result: Result }
		`)
		const second = buildSchema(`
			interface Node { label: String }
			type Two implements Node { label: String }
			union Result = Two
			type Query { extra: String }
		`)
		const trace: string[] = []
		assertInterfaceType(first.getType('Node')).resolveType = () => {
			trace.push('interface')
			return 'One'
		}
		assertUnionType(first.getType('Result')).resolveType = () => {
			trace.push('union')
			return 'One'
		}
		assertInterfaceType(second.getType('Node')).resolveType = () => {
			throw new Error('Second owner must not replace the first callback')
		}
		assertObjectType(first.getType('One')).isTypeOf = () => {
			trace.push('isTypeOf')
			return true
		}
		// Each concrete object must implement the final merged interface.
		const one = assertObjectType(first.getType('One'))
		const two = assertObjectType(second.getType('Two'))
		one.getFields().label = required(two.getFields().label)
		two.getFields().id = required(one.getFields().id)
		const schema = composeGraphqlSchemas({
			callbacks: {
				runApplication: (callback) => callback(),
				runPlugin: (owner, callback) => {
					trace.push(required(owner.instanceId))
					return callback()
				},
			},
			schemas: [first, second].map((schema, index) => ({
				attribution: {
					kind: 'plugin',
					owner: { pluginId: 'fixture.abstract', instanceId: String(index) },
					pluginVersion: '1.0.0',
				},
				description: `plugin ${String(index)}`,
				schema,
			})),
		})
		const node = assertInterfaceType(schema.getType('Node'))
		const result = assertUnionType(schema.getType('Result'))
		expect(Object.keys(node.getFields())).toEqual(['id', 'label'])
		expect(result.getTypes().map(({ name }) => name)).toEqual(['One', 'Two'])
		expect(assertObjectType(schema.getType('One')).getInterfaces()).toEqual([
			node,
		])
		expect(
			await graphql({
				schema,
				source: '{ node { id } result { ... on One { id } } }',
				rootValue: { node: { id: '1' }, result: { id: '2' } },
			}),
		).toEqual({ data: { node: { id: '1' }, result: { id: '2' } } })
		expect(trace).toEqual([
			'0',
			'interface',
			'0',
			'union',
			'0',
			'isTypeOf',
			'0',
			'isTypeOf',
		])
	})

	it.each(['legacy', 'external'] as const)(
		'keeps GraphQL 17 scalar coercion with %s defaults without intermediate replay',
		async (defaultKind) => {
			const trace: string[] = []
			const defaultValue = { value: 'default' }
			const scalar = new GraphQLScalarType({
				name: 'OwnedValue',
				coerceOutputValue: (value) => {
					trace.push('output')
					return typeof value === 'object' && value !== null && 'value' in value
						? value.value
						: null
				},
				coerceInputValue: (value) => {
					trace.push('input')
					return { value }
				},
				coerceInputLiteral: (node) => {
					trace.push('literal')
					return { value: node.kind === Kind.STRING ? node.value : null }
				},
			})
			const source = new GraphQLSchema({
				query: new GraphQLObjectType({
					name: 'Root',
					fields: {
						echo: {
							type: scalar,
							args: {
								value: {
									type: scalar,
									...(defaultKind === 'legacy'
										? { defaultValue }
										: { default: { value: 'default' } }),
								},
							},
							resolve: (_root: unknown, args: Record<string, unknown>) =>
								args.value,
						},
					},
				}),
			})
			const schema = composeGraphqlSchemas({
				callbacks: {
					runApplication: (callback) => callback(),
					runPlugin: (owner, callback) => {
						trace.push(required(owner.instanceId))
						return callback()
					},
				},
				schemas: [
					{
						attribution: {
							kind: 'plugin',
							owner: { pluginId: 'fixture.scalar', instanceId: 'scalar-owner' },
							pluginVersion: '1.0.0',
						},
						description: 'scalar plugin',
						schema: source,
					},
				],
			})
			// GraphQL 17 validates external defaults once; legacy internal values are
			// already coerced. Composition must not introduce an additional replay.
			expect(trace).toEqual(
				defaultKind === 'legacy' ? [] : ['scalar-owner', 'input'],
			)
			const argument = required(
				required(assertObjectType(schema.getQueryType()).getFields().echo)
					.args[0],
			)
			// Inspect compatibility without adopting a deprecated property in source.
			const internalDefault: unknown = Reflect.get(argument, 'defaultValue')
			if (defaultKind === 'legacy') expect(internalDefault).toBe(defaultValue)
			else expect(argument.default).toEqual({ value: 'default' })
			for (const [document, variables, expected] of [
				['{ echo }', {}, 'default'],
				['{ echo(value: "literal") }', {}, 'literal'],
				[
					'query($value: OwnedValue) { echo(value: $value) }',
					{ value: 'variable' },
					'variable',
				],
			] as const) {
				trace.length = 0
				expect(
					await graphql({
						schema,
						source: document,
						variableValues: variables,
					}),
				).toEqual({ data: { echo: expected } })
				expect(trace).toContain('output')
				for (const [index, entry] of trace.entries()) {
					if (entry !== 'scalar-owner')
						expect(trace[index - 1]).toBe('scalar-owner')
				}
				if (expected !== 'default')
					expect(trace).toContain(expected === 'literal' ? 'literal' : 'input')
			}
		},
	)
})
