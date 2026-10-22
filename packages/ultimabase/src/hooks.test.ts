// The fixed hooks at run time (D-67, D-71, D-88): their order and facts,
// values a hook or a default writes, and their failures.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Caller, Logger } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const M = { as: master }
const log: string[] = []
const facts = new Map<string, unknown>()
let patch: object = {}
let failing: string | undefined
let bump = false

/** Records a hook's run and facts, and fails when the test asks. */
const step = (name: string, given: object): void => {
	log.push(name)
	facts.set(name, given)
	if (failing === name) throw new Error(`${name} failed.`)
}

const Order = defineModel({
	name: 'Order',
	fields: (f) => ({
		code: f
			.string({
				default: () => {
					log.push('default')
					return 'a'
				},
				validate: (value) => {
					log.push(`validate ${value}`)
					return value.toUpperCase()
				},
			})
			.with({ access: { create: () => false, update: () => false } }),
		note: f.string({ optional: true }).with({
			access: {
				create: () => {
					log.push('field rule')
					return true
				},
				update: () => true,
			},
		}),
		total: f.number({ default: 0 }),
	}),
}).with({
	access: {
		read: () => true,
		create: ({ value }) => {
			log.push(`model rule ${Object.keys(value).join()}`)
			return true
		},
		update: () => {
			log.push('model rule')
			return true
		},
		delete: () => true,
	},
	hooks: {
		beforeCreate: ({ caller, data }) => {
			step('beforeCreate', { caller, data: { ...data } })
			Object.assign(data, patch)
		},
		afterCreate: async ({ record }) => {
			step('afterCreate', { record })
			if (!bump) return
			const where = { id: record.id }
			await query('Order', 'update', { where, data: { total: 99 } }, M)
		},
		afterCreateCommit: ({ record }) => {
			step('afterCreateCommit', { record })
		},
		beforeUpdate: ({ record, data }) => {
			step('beforeUpdate', { record, data: { ...data } })
			Object.assign(data, patch)
		},
		afterUpdate: ({ record, previous }) => {
			step('afterUpdate', { record, previous })
		},
		afterUpdateCommit: ({ record, previous }) => {
			step('afterUpdateCommit', { record, previous })
		},
		beforeDelete: ({ record }) => {
			step('beforeDelete', { record })
		},
		afterDelete: ({ record }) => {
			step('afterDelete', { record })
		},
		afterDeleteCommit: ({ record }) => {
			step('afterDeleteCommit', { record })
		},
	},
})

// A required field a hook fills.
const Ticket = defineModel({
	name: 'Ticket',
	fields: (f) => ({ title: f.string() }),
}).with({
	hooks: {
		beforeCreate: ({ data }) => {
			Object.assign(data, patch)
		},
	},
})

const logged: { level: string; first: unknown; message: unknown }[] = []
const sink =
	(level: string) =>
	(first: string | object, message?: string): void => {
		logged.push({ level, first, message })
	}
const logger: Logger = {
	info: sink('info'),
	warn: sink('warn'),
	error: sink('error'),
	child: () => logger,
}

let app: {
	readonly start: () => Promise<void>
	readonly stop: () => Promise<void>
}

// The kernel reads only the user's id.
const isCaller = (value: unknown): value is Caller =>
	typeof value === 'object' && value !== null
function user(id: string): { readonly as: Caller } {
	const as: unknown = { kind: 'user', user: { id } }
	if (!isCaller(as)) throw new Error('A caller is an object.')
	return { as }
}
const ada = user('ada')

// Asymmetric matchers are typed `any`.
const anId: unknown = expect.stringMatching(/^[0-9a-f-]{36}$/)
const aMessage: unknown = expect.any(String)
const containing = (fields: object): unknown => expect.objectContaining(fields)

beforeEach(async () => {
	log.length = 0
	facts.clear()
	patch = {}
	failing = undefined
	bump = false
	app = defineApp({ database: memory(), models: [Order, Ticket], logger })
	await app.start()
	// Leaves out "Application started." (D-91).
	logged.length = 0
})
afterEach(async () => {
	await app.stop()
})

const orders = async () => Order.count({}, M)
const created = async () => {
	const order = await Order.create({ data: { note: 'n' } }, M)
	log.length = 0
	facts.clear()
	return order
}

describe('create', () => {
	it('runs in the order of D-67, its rules on the data sent', async () => {
		const order = await Order.create({ data: { note: 'n' } }, ada)
		expect(log).toEqual([
			'model rule note',
			'field rule',
			'default',
			'validate a',
			'beforeCreate',
			'afterCreate',
			'afterCreateCommit',
		])
		expect(order).toMatchObject({ code: 'A', note: 'n', total: 0 })
	})

	it('gives the hooks their facts', async () => {
		const order = await Order.create({ data: { note: 'n' } }, ada)
		expect(facts.get('beforeCreate')).toEqual({
			caller: ada.as,
			data: { note: 'n', code: 'A', total: 0 },
		})
		expect(facts.get('afterCreate')).toEqual({ record: order })
		expect(facts.get('afterCreateCommit')).toEqual({ record: order })
	})

	it('writes a hook value without its rules or validate', async () => {
		patch = { code: 'raw' }
		const order = await Order.create({ data: {} }, ada)
		expect(order.code).toBe('raw')
		expect(log).not.toContain('validate raw')
	})

	it('lets a hook fill a required field', async () => {
		patch = { title: 'Untitled' }
		const ticket = await query('Ticket', 'create', { data: {} }, M)
		expect(ticket).toMatchObject({ title: 'Untitled' })
	})

	it('refuses a required field a hook empties', async () => {
		patch = { total: null }
		await expect(Order.create({ data: {} }, M)).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['total'], message: 'Required.' }] },
		})
	})

	it('fails with a TypeError on a hook value of the wrong type', async () => {
		patch = { total: 'many' }
		await expect(Order.create({ data: {} }, M)).rejects.toThrow(
			new TypeError(
				'Order.total: Expected a finite number. A before hook or validate wrote it (D-88).',
			),
		)
	})

	it('fails with a TypeError on hook data the kernel cannot read', async () => {
		patch = { nope: 1 }
		await expect(Order.create({ data: {} }, M)).rejects.toThrow(
			/^Order: a before hook wrote invalid data \(D-88\)\./,
		)
	})

	it('writes nothing when a before hook throws', async () => {
		failing = 'beforeCreate'
		await expect(Order.create({ data: {} }, M)).rejects.toThrow(
			'beforeCreate failed.',
		)
		expect(await orders()).toBe(0)
	})

	it('rolls back when an after hook throws, and skips the commit hook', async () => {
		failing = 'afterCreate'
		await expect(Order.create({ data: {} }, M)).rejects.toThrow(
			'afterCreate failed.',
		)
		expect(await orders()).toBe(0)
		expect(log).not.toContain('afterCreateCommit')
	})

	it('keeps the write when a commit hook throws, and logs it', async () => {
		failing = 'afterCreateCommit'
		const order = await Order.create({ data: {} }, M)
		expect(await orders()).toBe(1)
		expect(logged).toEqual([
			{
				level: 'error',
				first: {
					correlationId: anId,
					err: new Error('afterCreateCommit failed.'),
				},
				message: 'A commit hook failed; the write is kept.',
			},
		])
		expect(order.code).toBe('A')
	})

	it('returns the row as an after hook left it', async () => {
		bump = true
		const order = await Order.create({ data: {} }, M)
		expect(order.total).toBe(99)
	})
})

describe('update', () => {
	it('runs its rules, then validate, then the hooks', async () => {
		const order = await created()
		const where = { id: order.id }
		await Order.update({ where, data: { note: 'm' } }, ada)
		expect(log).toEqual([
			'model rule',
			'beforeUpdate',
			'afterUpdate',
			'afterUpdateCommit',
		])
	})

	it('gives the hooks the record, the data and the previous record', async () => {
		const order = await created()
		const where = { id: order.id }
		const changed = await Order.update({ where, data: { note: 'm' } }, M)
		expect(facts.get('beforeUpdate')).toEqual({
			record: order,
			data: { note: 'm' },
		})
		expect(facts.get('afterUpdate')).toEqual({
			record: changed,
			previous: order,
		})
		expect(facts.get('afterUpdateCommit')).toEqual({
			record: changed,
			previous: order,
		})
	})

	it('writes what a before hook adds', async () => {
		const order = await created()
		patch = { total: 5 }
		const where = { id: order.id }
		const changed = await Order.update({ where, data: {} }, M)
		expect(changed.total).toBe(5)
	})

	it('reports a missing row before invalid values (D-88)', async () => {
		const where = { id: 'missing' }
		const updated = query('Order', 'update', { where, data: { total: 'x' } }, M)
		await expect(updated).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})
})

describe('delete', () => {
	it('runs the delete hooks with the record', async () => {
		const order = await created()
		await Order.delete({ where: { id: order.id } }, M)
		expect(log).toEqual(['beforeDelete', 'afterDelete', 'afterDeleteCommit'])
		expect(facts.get('afterDeleteCommit')).toEqual({ record: order })
	})

	it('keeps the row when beforeDelete throws', async () => {
		const order = await created()
		failing = 'beforeDelete'
		const removed = Order.delete({ where: { id: order.id } }, M)
		await expect(removed).rejects.toThrow('beforeDelete failed.')
		expect(await orders()).toBe(1)
	})
})

describe('access', () => {
	it('logs ACCESS_DENIED at warn with the caller id (D-82, D-88)', async () => {
		const sent = Order.create({ data: { code: 'b' } }, ada)
		await expect(sent).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(logged).toEqual([
			{
				level: 'warn',
				first: containing({ callerId: 'ada' }),
				message: aMessage,
			},
		])
	})
})

/** An application of one model whose `hooks` its types would refuse. */
const odd = async (
	hooks: unknown,
	operation: 'create' | 'count' = 'create',
) => {
	await app.stop()
	const Odd = defineModel({ name: 'Odd', fields: (f) => ({ n: f.number() }) })
	Reflect.apply(Reflect.get(Odd, 'with'), Odd, [{ hooks }])
	app = defineApp({ database: memory(), models: [Odd], logger })
	await app.start()
	const args = operation === 'create' ? { data: { n: 1 } } : {}
	return query('Odd', operation, args, M)
}

describe('hooks the types would refuse', () => {
	it('fails with a TypeError when hooks is not an object', async () => {
		await expect(odd(3)).rejects.toThrow(
			new TypeError('Odd: hooks is an object (D-71).'),
		)
	})

	it('fails with a TypeError when a hook is not a function', async () => {
		await expect(odd({ beforeCreate: 1 })).rejects.toThrow(
			new TypeError('Odd.hooks.beforeCreate is a function (D-71).'),
		)
	})

	it('fails with a TypeError when beforeFind returns no filter', async () => {
		await expect(odd({ beforeFind: () => ({}) }, 'count')).rejects.toThrow(
			new TypeError(
				'Odd.hooks.beforeFind returns where({ ... }) or nothing (D-71).',
			),
		)
	})
})
