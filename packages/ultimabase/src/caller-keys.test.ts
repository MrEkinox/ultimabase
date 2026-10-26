// Plugins complete a user caller (D-121): once per object, each plugin's
// `caller` in the order of `plugins`, a key given by one plugin only.
import { describe, expect, it } from 'vitest'
import type { Caller, Identity, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { completer } from './complete.ts'
import type { PluginValue } from './plugin.ts'

const calls: string[] = []
const seen: Caller[] = []

interface Roles extends PluginTypes {
	readonly name: 'roles'
}
const roles = definePlugin<Roles>({
	name: 'roles',
	manifest: { name: 'roles', version: '1.0.0' },
	caller: async ({ user }) => {
		calls.push(`roles ${user.id}`)
		return { roles: ['admin'] }
	},
})

interface Tenant extends PluginTypes {
	readonly name: 'tenant'
	readonly appOptions: { readonly id: string }
}
const tenant = definePlugin<Tenant>({
	name: 'tenant',
	manifest: { name: 'tenant', version: '1.0.0' },
	caller: ({ user }, { options }) => {
		calls.push(`tenant ${user.id}`)
		return { tenant: options.id }
	},
})

interface Rival extends PluginTypes {
	readonly name: 'rival'
}
const rival = definePlugin<Rival>({
	name: 'rival',
	manifest: { name: 'rival', version: '1.0.0' },
	caller: () => ({ roles: [] }),
})

interface Thief extends PluginTypes {
	readonly name: 'thief'
}
const thief = definePlugin<Thief>({
	name: 'thief',
	manifest: { name: 'thief', version: '1.0.0' },
	caller: () => ({ kind: 'master' }),
})

/** A key no other code can name (D-126). */
const hidden = Symbol('hidden')
interface Secret extends PluginTypes {
	readonly name: 'secret'
}
const secret = definePlugin<Secret>({
	name: 'secret',
	manifest: { name: 'secret', version: '1.0.0' },
	caller: () => {
		// Built apart: a key no interface declares is not an excess one.
		const keys = { [hidden]: 'kept' }
		return keys
	},
})

let failures = 0
interface Flaky extends PluginTypes {
	readonly name: 'flaky'
}
const flaky = definePlugin<Flaky>({
	name: 'flaky',
	manifest: { name: 'flaky', version: '1.0.0' },
	caller: async () => {
		if (failures > 0) {
			failures -= 1
			throw new Error('The roles store is down.')
		}
		return { up: true }
	},
})

let identify: ((request: Request) => Promise<Caller>) | undefined
interface Transport extends PluginTypes {
	readonly name: 'transport'
}
const transport = definePlugin<Transport>({
	name: 'transport',
	manifest: { name: 'transport', version: '1.0.0' },
	identify: async (request) =>
		request.headers.has('x-who')
			? { kind: 'user', user: { id: 'ada' } }
			: undefined,
	start: (context) => {
		identify = context.identify
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ title: f.string() }),
}).with({
	access: ({ caller }) => {
		seen.push(caller)
		return true
	},
})

const whoami = defineFunction({
	name: 'whoami',
	run: async ({ caller }) => {
		seen.push(caller)
		await Note.findMany({}, { as: caller })
	},
}).with({ access: () => true })

/** Runs `run` in an application of `plugins`, cleared of earlier calls. */
async function using(
	plugins: readonly PluginValue<string, string>[],
	run: () => Promise<void>,
): Promise<void> {
	calls.length = 0
	seen.length = 0
	const app = defineApp({
		database: memory(),
		plugins,
		models: [Note],
		functions: [whoami],
	})
	await app.start()
	try {
		await run()
	} finally {
		await app.stop()
	}
}

const userOf = (id: string): Identity => ({ kind: 'user', user: { id } })

describe('a user caller', () => {
	it('holds each plugin’s keys in rules and functions, given in plugins order', async () => {
		await using([tenant.plugin({ id: 'acme' }), roles.plugin()], async () => {
			await Note.findMany({}, { as: userOf('ada') })
			await whoami.run({ as: userOf('bob') })
		})
		const ada = { kind: 'user', user: { id: 'ada' } }
		const bob = { kind: 'user', user: { id: 'bob' } }
		const keys = { tenant: 'acme', roles: ['admin'] }
		expect(seen).toStrictEqual([
			{ ...ada, ...keys },
			{ ...bob, ...keys },
			{ ...bob, ...keys },
		])
		expect(Object.isFrozen(seen[0])).toBe(true)
		// bob's completed caller, queried again by whoami, is not completed again.
		expect(calls).toStrictEqual([
			'tenant ada',
			'roles ada',
			'tenant bob',
			'roles bob',
		])
	})

	it('is completed once per object, at once or in turn', async () => {
		const ada = userOf('ada')
		await using([roles.plugin()], async () => {
			await Promise.all([
				Note.findMany({}, { as: ada }),
				Note.findMany({}, { as: ada }),
			])
			await Note.count({}, { as: ada })
			await Note.count({}, { as: userOf('ada') })
		})
		expect(calls).toStrictEqual(['roles ada', 'roles ada'])
		expect(seen[0]).toBe(seen[2])
	})

	it('is kept as given without a plugin to complete it', async () => {
		const ada = userOf('ada')
		await using([], async () => {
			await Note.findMany({}, { as: ada })
		})
		expect(seen[0]).toBe(ada)
	})

	it('is completed from a plugin’s identify, once', async () => {
		await using([transport.plugin(), roles.plugin()], async () => {
			const request = new Request('http://localhost/', {
				headers: { 'x-who': 'ada' },
			})
			const caller = await identify?.(request)
			expect(caller).toStrictEqual({
				kind: 'user',
				user: { id: 'ada' },
				roles: ['admin'],
			})
			if (caller !== undefined) await Note.findMany({}, { as: caller })
			const anonymous = await identify?.(new Request('http://localhost/'))
			expect(anonymous).toStrictEqual({ kind: 'anonymous' })
		})
		expect(calls).toStrictEqual(['roles ada'])
	})

	it('stops the request when two plugins give one key, naming both', async () => {
		await using([roles.plugin(), rival.plugin()], async () => {
			await expect(Note.findMany({}, { as: userOf('ada') })).rejects.toThrow(
				'rival.caller gives the caller roles, which roles gives; a key has one plugin.',
			)
		})
	})

	it('refuses the keys the kernel gives, and keys not in an object', async () => {
		// A plugin written in JavaScript can return anything.
		const complete = completer([
			{ plugin: 'broken', caller: async () => 'admin' },
		])
		await expect(complete(userOf('ada'))).rejects.toThrow(
			'broken.caller returns an object of keys.',
		)
		await using([thief.plugin()], async () => {
			await expect(Note.findMany({}, { as: userOf('ada') })).rejects.toThrow(
				'thief.caller gives the caller kind, which the kernel gives; a key has one plugin.',
			)
		})
	})

	it('holds a plugin’s symbol keys, given by one plugin only', async () => {
		await using([secret.plugin()], async () => {
			await Note.findMany({}, { as: userOf('ada') })
		})
		expect(Reflect.get(seen[0] ?? {}, hidden)).toBe('kept')
		const twice = completer([
			{ plugin: 'secret', caller: async () => ({ [hidden]: 1 }) },
			{ plugin: 'copy', caller: async () => ({ [hidden]: 2 }) },
		])
		await expect(twice(userOf('ada'))).rejects.toThrow(
			'copy.caller gives the caller Symbol(hidden), which secret gives; a key has one plugin.',
		)
	})

	it('is tried again after a plugin fails', async () => {
		const ada = userOf('ada')
		failures = 1
		await using([flaky.plugin()], async () => {
			await expect(Note.findMany({}, { as: ada })).rejects.toThrow(
				'The roles store is down.',
			)
			await Note.findMany({}, { as: ada })
		})
		expect(seen).toStrictEqual([{ ...ada, up: true }])
	})
})

describe('an anonymous or Master caller', () => {
	it('is not given to the plugins', async () => {
		await using([roles.plugin()], async () => {
			await Note.findMany({})
			await Note.findMany({}, { as: master })
		})
		expect(calls).toStrictEqual([])
		expect(seen).toStrictEqual([{ kind: 'anonymous' }])
	})
})
