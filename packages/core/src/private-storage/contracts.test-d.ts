import { expectTypeOf, test } from 'vitest'

import {
	plugin as createPlugin,
	contributeDeclarations,
	definePrivateCollection,
	privateStore,
	stringField,
	uuidField,
	type PrivateCollectionHandle,
} from '../index.js'

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
	void store.update({
		// @ts-expect-error -- Immutable fields cannot be updated.
		data: { id: '0198c000-0000-7000-8000-000000000002' },
		where: { secret: 'digest' },
	})
	// @ts-expect-error -- Undeclared selectors are unavailable.
	void store.findUnique({ where: { label: 'public' } })
	expectTypeOf(store).not.toHaveProperty('findMany')
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
