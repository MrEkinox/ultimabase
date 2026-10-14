import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0032: updating a single embedded object is a deep patch, omitted
// children keep their stored values; updating a list replaces it whole.
const App = UltimaBase.use(hooksPlugin(), validationPlugin())

const observed: {
	readonly phase: 'after' | 'before'
	readonly changes: unknown
	readonly item: unknown
	readonly originalItem: unknown
}[] = []

const Profile = App.Schema.define({
	className: 'PatchProfile',
	fields: (field) => ({
		code: field.string({ indexed: 'unique' }),
		box: field.object({
			fields: (child) => ({
				a: child.string(),
				b: child.string({
					validation: (value) => value !== 'bad' || 'b must not be bad',
				}),
			}),
		}),
		address: field.object({
			required: true,
			fields: (child) => ({
				line1: child.string({ required: true }),
				line2: child.string(),
				city: child.string({ required: true }),
				visits: child.bigint(),
				tags: child.string({ list: true }),
				geo: child.object({
					fields: (grandchild) => ({
						lat: grandchild.float({ required: true }),
						lng: grandchild.float({ required: true }),
						label: grandchild.object({
							fields: (leaf) => ({
								text: leaf.string({ required: true }),
								lang: leaf.string(),
							}),
						}),
					}),
				}),
			}),
		}),
		location: field.object({
			fields: (child) => ({
				lat: child.float({ required: true }),
				lng: child.float({ required: true }),
			}),
		}),
		history: field.object({
			list: true,
			fields: (child) => ({
				line1: child.string({ required: true }),
				city: child.string({ required: true }),
			}),
		}),
		metadata: field.json(),
	}),
}).with({
	// The schema check sees the complete item as it would be stored.
	validation: ({ item }) => {
		const { box } = item
		return (
			box === null ||
			box.a !== box.b || {
				code: 'box.distinct',
				message: 'a and b must differ',
				path: ['box'],
			}
		)
	},
	hooks: {
		beforeOperation: {
			update: ({ changes: { address, box }, item, originalItem }) => {
				const changes = { address, box }
				observed.push({ changes, item, originalItem, phase: 'before' })
			},
		},
		afterOperation: {
			update: ({ changes: { address, box }, item, originalItem }) => {
				const changes = { address, box }
				observed.push({ changes, item, originalItem, phase: 'after' })
			},
		},
	},
})

const Owner = App.Schema.define({
	className: 'PatchOwner',
	fields: (field) => ({
		name: field.string({ required: true }),
		profile: field.pointer({ target: () => Profile }),
	}),
})

const createApplication = (fixture: PostgresWorkerFixture) =>
	new (UltimaBase.use(
		hooksPlugin(),
		validationPlugin(),
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ schemas: [Profile, Owner] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'deep_patch' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

beforeEach(() => {
	observed.length = 0
})

let sequence = 0

const createProfile = () => {
	sequence += 1
	return Profile.createOne({
		data: {
			code: `profile-${String(sequence)}`,
			box: { a: '1', b: '2' },
			address: {
				line1: '1 Rue',
				line2: 'Suite 1',
				city: 'Paris',
				visits: 10n,
				tags: ['home', 'main'],
				geo: { lat: 48.85, lng: 2.35, label: { text: 'Home', lang: 'fr' } },
			},
			history: [
				{ line1: '2 Rue', city: 'Nice' },
				{ line1: '3 Rue', city: 'Lille' },
			],
			metadata: { kept: true, removed: true },
		},
	})
}

const storedAddress = {
	line1: '1 Rue',
	line2: 'Suite 1',
	city: 'Paris',
	visits: 10n,
	tags: ['home', 'main'],
	geo: { lat: 48.85, lng: 2.35, label: { text: 'Home', lang: 'fr' } },
}

const read = (id: string) =>
	Profile.findOneOrThrow({ where: { id: { eq: id } } })

describe('embedded object deep patch on PostgreSQL (ADR-0032)', () => {
	it('keeps omitted optional children', async () => {
		const created = await createProfile()

		const updated = await Profile.updateOne({
			where: { id: created.id },
			data: { box: { b: '3' } },
		})

		expect(updated?.box).toStrictEqual({ a: '1', b: '3' })
		expect((await read(created.id)).box).toStrictEqual({ a: '1', b: '3' })
	})

	it('keeps omitted required children without failing', async () => {
		const created = await createProfile()

		const updated = await Profile.updateOne({
			where: { id: created.id },
			data: { address: { city: 'Lyon' } },
		})

		expect(updated?.address).toStrictEqual({ ...storedAddress, city: 'Lyon' })
		expect((await read(created.id)).address).toStrictEqual({
			...storedAddress,
			city: 'Lyon',
		})
	})

	it('patches nested objects deeply at every depth', async () => {
		const created = await createProfile()

		const updated = await Profile.updateOne({
			where: { id: created.id },
			data: { address: { geo: { lat: 45.76, label: { lang: 'en' } } } },
		})

		expect(updated?.address).toStrictEqual({
			...storedAddress,
			geo: { lat: 45.76, lng: 2.35, label: { text: 'Home', lang: 'en' } },
		})
	})

	it('clears an optional child with an explicit null and replaces child lists', async () => {
		const created = await createProfile()

		const updated = await Profile.updateOne({
			where: { id: created.id },
			data: {
				address: {
					line2: null,
					visits: 11n,
					tags: ['work'],
					geo: { label: null },
				},
			},
		})

		expect(updated?.address).toStrictEqual({
			...storedAddress,
			line2: null,
			visits: 11n,
			tags: ['work'],
			geo: { lat: 48.85, lng: 2.35, label: null },
		})
	})

	it('clears an optional object with null, then patches the empty value', async () => {
		const created = await createProfile()

		const cleared = await Profile.updateOne({
			where: { id: created.id },
			data: { box: null },
		})
		const patched = await Profile.updateOne({
			where: { id: created.id },
			data: { box: { a: '9' } },
		})

		expect(cleared?.box).toBeNull()
		expect(patched?.box).toStrictEqual({ a: '9', b: null })
	})

	it('requires every required child when the stored object is null', async () => {
		const created = await createProfile()
		const missing = (path: readonly (number | string)[]) => ({
			code: 'VALIDATION_ERROR',
			publicDetails: {
				issues: [{ code: 'field.required', path: ['update', 0, ...path] }],
			},
		})

		// A top-level optional object has nothing to keep yet.
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				data: { location: { lat: 1 } },
			}),
		).rejects.toMatchObject(missing(['location', 'value', 'lng']))
		expect((await read(created.id)).location).toBeNull()
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				data: { location: { lat: 1, lng: 2 } },
				select: { location: true },
			}),
		).resolves.toMatchObject({ location: { lat: 1, lng: 2 } })

		// So has a nested optional object stored as null.
		await Profile.updateOne({
			where: { id: created.id },
			data: { address: { geo: null } },
		})
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				data: { address: { city: 'Lyon', geo: { lat: 1 } } },
			}),
		).rejects.toMatchObject(missing(['address', 'value', 'geo', 'lng']))
		expect((await read(created.id)).address).toStrictEqual({
			...storedAddress,
			geo: null,
		})
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				data: { address: { geo: { lat: 1, lng: 2 } } },
				select: { address: true },
			}),
		).resolves.toMatchObject({
			address: { ...storedAddress, geo: { lat: 1, lng: 2, label: null } },
		})
	})

	it('replaces object lists and JSON values whole', async () => {
		const created = await createProfile()

		const updated = await Profile.updateOne({
			where: { id: created.id },
			data: {
				history: [{ line1: '4 Rue', city: 'Lyon' }],
				metadata: { kept: false },
			},
		})

		expect(updated).toMatchObject({
			history: [{ line1: '4 Rue', city: 'Lyon' }],
			metadata: { kept: false },
		})
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				// @ts-expect-error A replacement list item needs its required children.
				data: { history: [{ city: 'Lyon' }] },
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('patches every item of updateMany', async () => {
		const first = await createProfile()
		const second = await createProfile()

		const updated = await Profile.updateMany({
			data: [
				{
					where: { id: { eq: first.id } },
					data: { address: { city: 'Lyon' } },
				},
				{ where: { id: { eq: second.id } }, data: { box: { a: '7' } } },
			],
			select: { address: true, box: true },
		})

		expect(updated.map(({ address, box }) => ({ address, box }))).toStrictEqual(
			[
				{
					address: { ...storedAddress, city: 'Lyon' },
					box: { a: '1', b: '2' },
				},
				{ address: storedAddress, box: { a: '7', b: '2' } },
			],
		)
	})

	it('patches in the update branch of an upsert', async () => {
		const created = await createProfile()

		const upserted = await Profile.upsertOne({
			where: { code: { eq: created.code ?? '' } },
			create: { address: { line1: 'unused', city: 'unused' } },
			update: { address: { line1: '5 Rue' } },
		})

		expect(upserted.id).toBe(created.id)
		expect(upserted.address).toStrictEqual({ ...storedAddress, line1: '5 Rue' })
	})

	it('patches a related row through a nested update', async () => {
		const profile = await createProfile()
		const owner = await Owner.createOne({
			data: { name: 'Ada', profile: { connect: profile.id } },
		})

		await Owner.updateOne({
			where: { id: owner.id },
			data: { profile: { update: { address: { city: 'Marseille' } } } },
		})

		expect((await read(profile.id)).address).toStrictEqual({
			...storedAddress,
			city: 'Marseille',
		})
	})

	it('validates the merged value and only the supplied children', async () => {
		const created = await createProfile()

		// The schema check compares the patched `b` with the stored `a`.
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				data: { box: { b: '1' } },
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: { issues: [{ code: 'box.distinct', path: ['box'] }] },
		})
		await expect(
			Profile.updateOne({
				where: { id: created.id },
				data: { box: { b: 'bad' } },
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: {
				issues: [
					{
						message: 'b must not be bad',
						path: ['update', 0, 'box', 'value', 'b'],
					},
				],
			},
		})
		expect((await read(created.id)).box).toStrictEqual({ a: '1', b: '2' })
	})

	it('shows Hooks the patch as changes and the merged object as item', async () => {
		const created = await createProfile()

		await Profile.updateOne({
			where: { id: created.id },
			data: { box: { b: '3' }, address: { geo: { lng: 3 } } },
		})

		const expectedAddress = {
			...storedAddress,
			geo: { ...storedAddress.geo, lng: 3 },
		}
		expect(observed).toHaveLength(2)
		for (const entry of observed) {
			// `changes` holds each patch as written.
			expect(entry.changes).toStrictEqual({
				box: { b: '3' },
				address: { geo: { lng: 3 } },
			})
			expect(entry.item).toMatchObject({
				box: { a: '1', b: '3' },
				address: expectedAddress,
			})
			expect(entry.originalItem).toMatchObject({
				box: { a: '1', b: '2' },
				address: storedAddress,
			})
		}
	})
})
