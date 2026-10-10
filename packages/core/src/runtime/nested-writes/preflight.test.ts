import { describe, expect, it, vi } from 'vitest'

import { SchemaRegistry } from '../../schema/schema/registry.js'
import { normalizeNestedWriteGraph } from '../../schema/nested-writes/normalization.js'
import type { RuntimeNestedWriteHost } from './execution.js'
import { RuntimeNestedWritePreflight } from './preflight.js'
import { UltimaBase } from '../application/ultima-base.js'

const Parent = UltimaBase.Schema.define({
	className: 'NestedPreflightParent',
	fields: (field) => ({
		first: field.relation({
			mappedBy: 'firstParent',
			target: 'NestedPreflightChild',
		}),
		name: field.string({ required: true }),
		second: field.relation({
			mappedBy: 'secondParent',
			target: 'NestedPreflightChild',
		}),
	}),
})

const Child = UltimaBase.Schema.define({
	className: 'NestedPreflightChild',
	fields: (field) => ({
		firstParent: field.pointer({ target: 'NestedPreflightParent' }),
		name: field.string({ required: true }),
		secondParent: field.pointer({ target: 'NestedPreflightParent' }),
	}),
})

const schemas = new SchemaRegistry([Parent, Child])
schemas.resolveSchemaTargets()

describe('RuntimeNestedWritePreflight', () => {
	it('counts inverse-pointer replacement expansion cumulatively', async () => {
		const graph = normalizeNestedWriteGraph(
			schemas,
			Parent,
			'update',
			{
				first: { set: [] },
				second: { set: [] },
			},
			// `{ set: [] }` (ADR-0308) allocates no action, unlike the removed `clear`.
			{ maxOperations: 4 },
		)
		const executeCreate = vi.fn()
		const executeUpdate = vi.fn()
		const mutateRelation = vi.fn()
		const host: RuntimeNestedWriteHost = {
			executeCreate,
			executeUpdate,
			isInversePointerRelation: () => true,
			mutateRelation,
			readInversePointerField: () => undefined,
			readRelationTargets: () =>
				Promise.resolve([
					{ id: '0199c2d0-0000-7000-8000-000000000001' },
					{ id: '0199c2d0-0000-7000-8000-000000000002' },
				]),
			verifyTarget: () => Promise.reject(new Error('Unexpected target read')),
		}
		const preflight = new RuntimeNestedWritePreflight(graph, host)

		await expect(
			preflight.run({
				id: '0199c2d0-0000-7000-8000-000000000003',
				name: 'Parent',
			}),
		).rejects.toThrow('Nested write exceeds maxOperations 4')
		expect(executeCreate).not.toHaveBeenCalled()
		expect(executeUpdate).not.toHaveBeenCalled()
		expect(mutateRelation).not.toHaveBeenCalled()
	})
})
