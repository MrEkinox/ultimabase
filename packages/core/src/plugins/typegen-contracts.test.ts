import { describe, expect, it } from 'vitest'

import {
	defineTypegenReference,
	isTypegenReference,
	snapshotTypegenProperties,
	snapshotTypegenTypeNode,
} from './typegen-contracts.js'

const reference = defineTypegenReference({
	exportName: 'WorkflowState',
	module: '@fixture/workflow',
})

describe('structured Typegen contracts', () => {
	it('snapshots every closed type node without retaining mutable input', () => {
		const properties = [
			{
				description: 'Current state.',
				name: 'state',
				optional: true,
				readonly: true,
				type: {
					arguments: [{ kind: 'literal', value: 'editorial' }],
					kind: 'reference',
					reference,
				},
			},
		]
		const node = snapshotTypegenTypeNode(
			{
				kind: 'object',
				properties: [
					...properties,
					{
						name: 'history',
						type: {
							kind: 'array',
							value: {
								kind: 'tuple',
								values: [
									{ kind: 'string' },
									{
										kind: 'union',
										values: [
											{ kind: 'number' },
											{ kind: 'boolean' },
											{ kind: 'bigint' },
											{ kind: 'unknown' },
											{ kind: 'never' },
										],
									},
								],
							},
						},
					},
				],
			},
			'contract',
		)

		const mutableProperty = properties[0]
		if (mutableProperty === undefined) throw new TypeError('Missing fixture')
		mutableProperty.name = 'mutated'
		expect(node.kind).toBe('object')
		if (node.kind !== 'object') throw new TypeError('Expected object node')
		expect(node.properties[0]).toMatchObject({
			name: 'state',
			optional: true,
			readonly: true,
		})
		expect(isTypegenReference(reference)).toBe(true)
		expect(isTypegenReference({ ...reference })).toBe(false)
	})

	it('rejects forged references and every malformed node boundary', () => {
		const invalidNodes: readonly [unknown, string][] = [
			[null, 'must be a structured Typegen type'],
			[{ kind: 'string', raw: true }, 'unknown option'],
			[{ kind: 'literal', value: undefined }, 'JSON primitive'],
			[
				{ kind: 'reference', reference: { exportName: 'X', module: 'x' } },
				'must be created by defineTypegenReference',
			],
			[
				{ arguments: 'no', kind: 'reference', reference },
				'arguments must be a list',
			],
			[{ kind: 'tuple', values: [] }, 'non-empty list'],
			[{ kind: 'union', values: 'no' }, 'non-empty list'],
			[{ kind: 'object', properties: 'no' }, 'properties must be a list'],
			[{ kind: 'unsupported' }, 'kind is unsupported'],
		]
		for (const [node, message] of invalidNodes) {
			expect(() => snapshotTypegenTypeNode(node, 'contract')).toThrow(message)
		}

		expect(() =>
			defineTypegenReference(
				null as unknown as { readonly exportName: 'X'; readonly module: 'x' },
			),
		).toThrow('plain object')
		expect(() =>
			defineTypegenReference({ exportName: 'Invalid-Name', module: 'x' }),
		).toThrow('must be an identifier')
		expect(() =>
			defineTypegenReference({ exportName: 'X', module: ' bad module ' }),
		).toThrow('stable specifier')
		expect(() =>
			defineTypegenReference({
				exportName: 'X',
				module: 'x',
				extra: true,
			} as unknown as {
				readonly exportName: 'X'
				readonly module: 'x'
			}),
		).toThrow('unknown option')
	})

	it('rejects malformed or ambiguous property declarations', () => {
		const valid = { name: 'state', type: { kind: 'string' } }
		const invalidProperties: readonly [readonly unknown[], string][] = [
			[[null], 'must be a property'],
			[[{ ...valid, extra: true }], 'unknown option'],
			[[valid, valid], 'duplicate property'],
			[[{ ...valid, description: 1 }], 'description must be a string'],
			[[{ ...valid, optional: 'yes' }], 'optional must be a boolean'],
			[[{ ...valid, readonly: 'yes' }], 'readonly must be a boolean'],
		]
		for (const [properties, message] of invalidProperties) {
			expect(() => snapshotTypegenProperties(properties, 'properties')).toThrow(
				message,
			)
		}
	})
})
