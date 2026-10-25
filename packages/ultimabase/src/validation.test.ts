// A field's `validate` (D-23, D-88): a Standard Schema or a function, run on
// the data sent and on defaults; its output is the stored value.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'
import { resolve } from './schema.ts'
import { validated } from './validation.ts'

const M = { as: master }

const Form = defineModel({
	name: 'Form',
	fields: (f) => ({
		slug: f.string({
			optional: true,
			validate: (value) => {
				if (!/^[a-z-]+$/.test(value)) throw new Error('Lowercase letters only.')
				return value
			},
		}),
		name: f.string({ optional: true, validate: z.string().trim().min(1) }),
		meta: f.json({ optional: true, validate: z.object({ size: z.number() }) }),
		code: f.string({
			default: 'none',
			validate: async (value) => {
				await Promise.resolve()
				if (value === 'none') throw 'Pick a code.'
				return value.toUpperCase()
			},
		}),
	}),
})

let app: ReturnType<typeof started>
const started = () => defineApp({ database: memory(), models: [Form] })

beforeEach(async () => {
	app = started()
	await app.start()
})
afterEach(async () => {
	await app.stop()
})

// Asymmetric matchers are typed `any`.
const aMessage: unknown = expect.any(String)

const refused = (issues: readonly object[]) => ({
	code: 'VALIDATION_FAILED',
	details: { issues },
})

describe('validate', () => {
	it('stores its output', async () => {
		const form = await Form.create(
			{ data: { code: 'x', name: '  Ada ', meta: { size: 2 } } },
			M,
		)
		expect(form).toMatchObject({ code: 'X', name: 'Ada', meta: { size: 2 } })
	})

	it('refuses with the message a function throws (D-88)', async () => {
		const data = { code: 'x', slug: 'Bad Slug' }
		await expect(Form.create({ data }, M)).rejects.toMatchObject(
			refused([{ path: ['slug'], message: 'Lowercase letters only.' }]),
		)
	})

	it('validates defaults, and awaits an async function', async () => {
		await expect(Form.create({ data: {} }, M)).rejects.toMatchObject(
			refused([{ path: ['code'], message: 'Pick a code.' }]),
		)
	})

	it("puts the field's name in front of a schema's issue path", async () => {
		const data = { code: 'x', meta: { size: 'big' } }
		await expect(query('Form', 'create', { data }, M)).rejects.toMatchObject(
			refused([{ path: ['meta', 'size'], message: aMessage }]),
		)
	})

	it('reports the issues of every field', async () => {
		const data = { code: 'x', slug: 'A', name: '  ' }
		await expect(Form.create({ data }, M)).rejects.toMatchObject(
			refused([
				{ path: ['slug'], message: 'Lowercase letters only.' },
				{ path: ['name'], message: aMessage },
			]),
		)
	})

	it('runs on update, and skips null', async () => {
		const form = await Form.create({ data: { code: 'x', name: 'Ada' } }, M)
		const where = { id: form.id }
		const blank = Form.update({ where, data: { name: '  ' } }, M)
		await expect(blank).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const cleared = await Form.update({ where, data: { name: null } }, M)
		expect(cleared.name).toBeNull()
	})
})

const schema = (validate: () => unknown) => ({
	'~standard': { version: 1, vendor: 'test', validate },
})

describe('a validate the types would refuse', () => {
	const Probe = defineModel({
		name: 'Probe',
		fields: (f) => ({ n: f.string() }),
	})
	const model = resolve([Probe]).models.get('Probe')
	const field = model?.fields.get('n')
	const probe = async (validate: unknown) => {
		if (model === undefined || field === undefined) {
			throw new Error('Probe.n is missing.')
		}
		return validated(model, { ...field, options: { validate } }, 'v')
	}

	it('reads any issue path segment and a missing message', async () => {
		const issues = [{ path: [Symbol('s'), { key: 0 }, 'k'] }, 'oops']
		expect(await probe(schema(() => ({ issues })))).toEqual({
			issues: [
				{ path: ['n', 'Symbol(s)', 0, 'k'], message: 'Invalid value.' },
				{ path: ['n'], message: 'Invalid value.' },
			],
		})
	})

	it('runs a schema with `this` as its ~standard', async () => {
		const standard = {
			version: 1,
			validate(this: unknown, value: unknown) {
				return { value: this === standard ? value : 'unbound' }
			},
		}
		expect(await probe({ '~standard': standard })).toEqual({ value: 'v' })
	})

	it('fails with a TypeError on a result that is not one', async () => {
		await expect(probe(schema(() => ({})))).rejects.toThrow(
			new TypeError('Probe.n: the schema returned no Standard Schema result.'),
		)
	})

	it('fails with a TypeError on a value that is neither form', async () => {
		const message = 'Probe.n: validate is a Standard Schema or a function.'
		for (const validate of [3, null, { '~standard': {} }]) {
			await expect(probe(validate)).rejects.toThrow(new TypeError(message))
		}
	})
})
