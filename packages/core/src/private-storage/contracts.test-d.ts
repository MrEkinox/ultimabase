import { expectTypeOf, test } from 'vitest'

import {
	definePrivateCollection,
	privateStore,
	stringField,
	uuidField,
	type PrivateCollectionHandle,
	type PrivateStorageAdapterCollection,
	type PrivateStorageOperationRequest,
} from '../index.js'
import { plugin as createPlugin, contributeDeclarations } from '../plugin.js'

declare const adapterCollection: PrivateStorageAdapterCollection

const credentials = definePrivateCollection({
	contributionId: 'credentials',
	fields: {
		id: uuidField({ immutable: true, required: true }),
		label: stringField(),
		secret: stringField({ required: true }),
	},
	indexes: [{ fields: ['id'] }, { fields: ['secret'] }] as const,
})

test('derives the exact private record and operation surface', () => {
	const store = privateStore(credentials)
	expectTypeOf(store).toEqualTypeOf<
		PrivateCollectionHandle<typeof credentials>
	>()

	void store.insert({
		data: {
			id: '0198c000-0000-7000-8000-000000000001',
			secret: 'digest',
		},
	})
	expectTypeOf(
		store.insertIfAbsent({
			data: {
				id: '0198c000-0000-7000-8000-000000000001',
				secret: 'digest',
			},
		}),
	).toEqualTypeOf<
		Promise<{
			readonly id: string
			readonly label: string | null
			readonly secret: string
		} | null>
	>()
	void store.findUnique({
		where: { id: '0198c000-0000-7000-8000-000000000001' },
	})
	void store.findUnique({ where: { secret: 'digest' } })
	void store.update({ data: { label: null }, where: { secret: 'digest' } })
	void store.compareAndSwap({
		data: { secret: 'next' },
		expected: { secret: 'digest' },
		where: { id: '0198c000-0000-7000-8000-000000000001' },
	})

	// @ts-expect-error -- Required private fields cannot be omitted.
	void store.insert({ data: { secret: 'digest' } })
	// @ts-expect-error -- A conditional insert takes the same complete record.
	void store.insertIfAbsent({ data: { secret: 'digest' } })
	void store.update({
		// @ts-expect-error -- Immutable fields cannot be updated.
		data: { id: '0198c000-0000-7000-8000-000000000002' },
		where: { secret: 'digest' },
	})
	// @ts-expect-error -- Undeclared selectors are unavailable.
	void store.findUnique({ where: { label: 'public' } })
	expectTypeOf(store).not.toHaveProperty('findMany')
	expectTypeOf(store).not.toHaveProperty('findFirst')
	expectTypeOf(store).not.toHaveProperty('updateMany')
	expectTypeOf(store).not.toHaveProperty('deleteMany')
	expectTypeOf(store).not.toHaveProperty('migrate')
})

test('exposes declarations only under the exact critical privilege', () => {
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.private-contracts',
		permissions: { 'storage:private': 'Declares private credential storage.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				privateStorage: ({ privateStorage }) => {
					privateStorage.register(credentials)
					return undefined
				},
			}),
		],
	})

	definePrivateCollection({
		contributionId: 'invalid-callback',
		fields: { secret: stringField({ required: true }) },
		indexes: [{ fields: ['secret'] }] as const,
		// @ts-expect-error -- Descriptor options retain portable JSON only.
		normalizedStaticOptions: { derive: () => 'secret' },
	})
})

test('keeps adapter requests exact and discriminated', () => {
	const read = (request: PrivateStorageOperationRequest): void => {
		switch (request.kind) {
			case 'find-unique':
			case 'delete':
				expectTypeOf(request.where).toEqualTypeOf<
					Readonly<Record<string, unknown>>
				>()
				break
			case 'insert':
			case 'insert-if-absent':
				expectTypeOf(request.data).toEqualTypeOf<
					Readonly<Record<string, unknown>>
				>()
				break
			case 'update':
				expectTypeOf(request.data).toEqualTypeOf<
					Readonly<Record<string, unknown>>
				>()
				expectTypeOf(request.where).toEqualTypeOf<
					Readonly<Record<string, unknown>>
				>()
				break
			case 'compare-and-swap':
				expectTypeOf(request.expected).toEqualTypeOf<
					Readonly<Record<string, unknown>>
				>()
				break
		}
	}

	read({
		collection: adapterCollection,
		kind: 'find-unique',
		where: { id: '0198c000-0000-7000-8000-000000000001' },
	})
	// @ts-expect-error -- A unique read always requires its exact selector.
	read({ collection: adapterCollection, kind: 'find-unique' })
	read({
		collection: adapterCollection,
		// @ts-expect-error -- Query-like scans are outside the closed protocol.
		kind: 'find-many',
	})
})
