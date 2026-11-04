// A `many`'s `size` (D-242): each parent a transaction touches holds `min`
// to `max` rows at its end, whatever write touched it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory, transaction } from './index.ts'
import { resolve } from './schema.ts'
import { sizeNote } from './sizes.ts'

const M = { as: master }

const Album = defineModel({
	name: 'Album',
	fields: (f) => ({
		title: f.string(),
		photos: f.many(() => Photo, {
			inverse: 'album',
			size: { min: 1, max: 3 },
		}),
	}),
})

const Shoot = defineModel({
	name: 'Shoot',
	fields: (f) => ({
		name: f.string(),
		photos: f.many(() => Photo, { inverse: 'shoot' }),
	}),
})

const Photo = defineModel({
	name: 'Photo',
	fields: (f) => ({
		name: f.string(),
		album: f.one(() => Album, { onDelete: 'cascade' }),
		shoot: f.one(() => Shoot, { optional: true, onDelete: 'cascade' }),
	}),
})

const Folder = defineModel({
	name: 'Folder',
	fields: (f) => ({
		files: f.many(() => File, { inverse: 'folder', size: { max: 2 } }),
	}),
})

const File = defineModel({
	name: 'File',
	fields: (f) => ({ folder: f.one(() => Folder, { optional: true }) }),
})

const models = [Album, Shoot, Photo, Folder, File]

const codeOf = async (write: Promise<unknown>): Promise<string> =>
	write.then(
		() => 'written',
		(error: unknown) => String(Reflect.get(Object(error), 'code')),
	)

/** An album holding `count` photos. */
const album = async (title: string, count: number) =>
	Album.create(
		{
			data: {
				title,
				photos: {
					create: Array.from({ length: count }, (_, i) => ({
						name: `${title}${String(i)}`,
					})),
				},
			},
			include: { photos: true },
		},
		M,
	)

const sizes = async () => {
	const albums = await Album.findMany(
		{ include: { _count: { select: { photos: true } } } },
		M,
	)
	return Object.fromEntries(
		albums.map((found) => [found.title, found._count.photos]),
	)
}

/** A box whose items hold `size`, to resolve. */
const bounded = (size: { min?: number; max?: number }) => {
	const Box = defineModel({
		name: 'Box',
		fields: (f) => ({
			items: f.many(() => Item, { inverse: 'box', size }),
		}),
	})
	const Item = defineModel({
		name: 'Item',
		fields: (f) => ({ box: f.one(() => Box) }),
	})
	return () => resolve([Box, Item])
}

/** Moves photo `id` to album `to`. */
const moved = (id: string | undefined, to: string) =>
	Photo.update(
		{ where: { id: id ?? '' }, data: { album: { connect: { id: to } } } },
		M,
	)

describe('a many with a size (D-242)', () => {
	it('stops startup on bounds out of order or on a many-to-many', () => {
		const message =
			'Box.items: size takes whole numbers, min from 0 and max from 1, as { min: 1, max: 10 }.'
		for (const size of [{ min: -1 }, { max: 0 }, { min: 3, max: 2 }]) {
			expect(bounded(size)).toThrow(message)
		}
		expect(bounded({ min: 1.5 })).toThrow(message)
		expect(bounded({ min: 2, max: 2 })).not.toThrow()

		const Tag = defineModel({
			name: 'Tag',
			fields: (f) => ({
				posts: f.many(() => Post, { inverse: 'tags', size: { max: 2 } }),
			}),
		})
		const Post = defineModel({
			name: 'Post',
			fields: (f) => ({ tags: f.many(() => Tag, { inverse: 'posts' }) }),
		})
		expect(() => resolve([Tag, Post])).toThrow(
			'Tag.posts: size bounds a one-to-many relation only.',
		)
	})

	it('stops startup on a size on a view', () => {
		const Box = defineModel({
			name: 'Box',
			fields: (f) => ({
				items: f.many(() => Item, { inverse: 'box' }),
				// @ts-expect-error: a view takes no size.
				some: f.many(() => Item, { from: 'items', size: { max: 1 } }),
			}),
		}).with({ relations: { some: { where: () => true } } })
		const Item = defineModel({
			name: 'Item',
			fields: (f) => ({ box: f.one(() => Box) }),
		})
		expect(() => resolve([Box, Item])).toThrow(
			'Box.some: size bounds a one-to-many relation only.',
		)
	})

	it('states the bound in the description, one row in the singular', () => {
		const notes = [
			{ min: 1 },
			{ min: 2 },
			{ max: 1 },
			{ min: 2, max: 2 },
			{ min: 1, max: 10 },
			{ min: 0 },
		].map((size) => {
			const box = bounded(size)().models.get('Box')
			const items = box?.fields.get('items')
			return items === undefined ? 'none' : sizeNote('Box', items)
		})
		expect(notes).toEqual([
			'Holds at least 1 row.',
			'Holds at least 2 rows.',
			'Holds at most 1 row.',
			'Holds exactly 2 rows.',
			'Holds 1 to 10 rows.',
			undefined,
		])
		const title = resolve(models).models.get('Album')?.fields.get('title')
		expect(title === undefined ? 'none' : sizeNote('Album', title)).toBe(
			undefined,
		)
	})

	describe('on a running application', () => {
		let app: ReturnType<typeof defineApp>
		beforeEach(async () => {
			app = defineApp({ database: memory(), models })
			await app.start()
		})
		afterEach(async () => app.stop())

		it('refuses a parent created under min, and keeps nothing', async () => {
			const refused = Album.create({ data: { title: 'empty' } }, M)
			await expect(refused).rejects.toMatchObject({
				code: 'RELATION_SIZE',
				message: 'Album.photos holds 1 to 3 rows: this write leaves 0.',
				details: { model: 'Album', field: 'photos', min: 1, max: 3, size: 0 },
			})
			expect(await codeOf(album('many', 4))).toBe('RELATION_SIZE')
			expect(await Album.count({}, M)).toBe(0)
			expect(await Photo.count({}, M)).toBe(0)
			expect((await album('two', 2)).photos).toHaveLength(2)
		})

		it('creates a parent and its first rows in one transaction', async () => {
			await transaction(async () => {
				const made = await Album.create({ data: { title: 'later' } }, M)
				await Photo.create(
					{ data: { name: 'p', album: { connect: { id: made.id } } } },
					M,
				)
			})
			expect(await sizes()).toEqual({ later: 1 })
		})

		it('refuses a row added to a full parent', async () => {
			const full = await album('full', 3)
			const into = { album: { connect: { id: full.id } } }
			const added = Photo.create({ data: { name: 'p', ...into } }, M)
			await expect(added).rejects.toMatchObject({
				code: 'RELATION_SIZE',
				details: { id: full.id, size: 4 },
			})
			const nested = Album.update(
				{
					where: { id: full.id },
					data: { photos: { create: [{ name: 'q' }] } },
				},
				M,
			)
			expect(await codeOf(nested)).toBe('RELATION_SIZE')
			expect(await sizes()).toEqual({ full: 3 })
		})

		it('checks both parents of a row that moves', async () => {
			const one = await album('one', 1)
			const two = await album('two', 2)
			const [last] = one.photos
			const [first, second] = two.photos
			expect(await codeOf(moved(last?.id, two.id))).toBe('RELATION_SIZE')
			expect(await codeOf(moved(first?.id, one.id))).toBe('written')
			expect(await sizes()).toEqual({ one: 2, two: 1 })
			expect(await codeOf(moved(second?.id, one.id))).toBe('RELATION_SIZE')
		})

		it('refuses deleting the last row, and lets the parent’s delete through', async () => {
			const one = await album('one', 1)
			const two = await album('two', 2)
			const last = Photo.delete({ where: { id: one.photos[0]?.id ?? '' } }, M)
			expect(await codeOf(last)).toBe('RELATION_SIZE')
			await Photo.delete({ where: { id: two.photos[0]?.id ?? '' } }, M)
			await Album.delete({ where: { id: one.id } }, M)
			expect(await sizes()).toEqual({ two: 1 })
			expect(await Photo.count({}, M)).toBe(1)
		})

		it('refuses a cascade from another model that empties a parent', async () => {
			const shoot = await Shoot.create({ data: { name: 's' } }, M)
			const one = await album('one', 1)
			await Photo.update(
				{
					where: { id: one.photos[0]?.id ?? '' },
					data: { shoot: { connect: { id: shoot.id } } },
				},
				M,
			)
			const cascaded = Shoot.delete({ where: { id: shoot.id } }, M)
			expect(await codeOf(cascaded)).toBe('RELATION_SIZE')
			expect(await sizes()).toEqual({ one: 1 })
		})

		it('bounds a bulk write by max only', async () => {
			const folder = await Folder.create({ data: {} }, M)
			const into = { folder: { connect: { id: folder.id } } }
			const many = File.createMany({ data: [into, into, into] }, M)
			await expect(many).rejects.toMatchObject({
				code: 'RELATION_SIZE',
				message: 'Folder.files holds at most 2 rows: this write leaves 3.',
				details: { min: 0, max: 2, size: 3 },
			})
			await File.createMany({ data: [into, into, {}] }, M)
			expect(await File.count({ where: { folder: { is: null } } }, M)).toBe(1)
		})
	})
})
