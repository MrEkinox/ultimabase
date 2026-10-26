// `rolesPlugin()` (D-123, D-126): each user caller completed with every role
// the user has, inherited ones included, under a key no other code names;
// `hasRole` asks it, `rolesOf` lists it.
import type {
	Caller,
	CallerRule,
	ExposedModel,
	ModelQueries,
	PluginOf,
	PluginTypes,
	UseOf,
} from 'ultimabase'
import { definePlugin, master, Refused } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }

/** The roles plugin's types (D-57). */
export interface Roles extends PluginTypes {
	readonly name: 'roles'
}

type Held = { readonly id: string; readonly name: string }

/** The models `defineRole` returned. */
export const roleModels: WeakSet<object> = new WeakSet()

/** The caller's key holding its roles, which `@ultimabase/roles` keeps (D-126). */
const rolesKey = Symbol('roles')
/** The lists of roles this plugin gave a caller. */
const given = new WeakSet<object>()

const M = { as: master }

/** The one role model among the application's models (D-123). */
function rolesModelOf(models: readonly ExposedModel[]): ModelQueries {
	const [first, second] = models.filter(({ queries }) =>
		roleModels.has(queries),
	)
	if (first === undefined) {
		throw new Refused(
			'rolesPlugin() needs a role model: declare it with defineRole.',
		)
	}
	if (second !== undefined) {
		throw new Refused(
			'models lists two models defineRole returned: an application has one role model.',
		)
	}
	return first.queries
}

/** The levels of inheritance one read follows (D-123). */
const depth = 5

/** A role's id and name, and its inherited roles `left` levels deep. */
const level = (left: number): object => ({
	id: true,
	name: true,
	inherits: { select: left === 0 ? { id: true } : level(left - 1) },
})

/**
 * Adds a read role and the roles it inherits to `held`; a role read past
 * the last level, its id alone, goes to `missing`. A role already held was
 * followed, which ends a cycle.
 */
function follow(
	row: unknown,
	held: Map<string, Held>,
	missing: Set<string>,
): void {
	const id: unknown = Reflect.get(Object(row), 'id')
	const name: unknown = Reflect.get(Object(row), 'name')
	if (typeof id !== 'string' || held.has(id)) return
	if (typeof name !== 'string') {
		missing.add(id)
		return
	}
	held.set(id, Object.freeze({ id, name }))
	const parents: unknown = Reflect.get(Object(row), 'inherits')
	for (const parent of Array.isArray(parents) ? parents : []) {
		follow(parent, held, missing)
	}
}

/**
 * Every role of a user: the roles it is a member of and those they inherit,
 * five levels per query (D-123).
 */
async function rolesOfUser(
	id: string,
	queries: ModelQueries,
): Promise<readonly Held[]> {
	const held = new Map<string, Held>()
	const select = level(depth)
	let where: object = { members: { some: { id } } }
	for (;;) {
		const missing = new Set<string>()
		for (const row of await queries.findMany({ where, select }, M)) {
			follow(row, held, missing)
		}
		const next = [...missing].filter((role) => !held.has(role))
		if (next.length === 0) break
		where = { id: { in: next } }
	}
	const roles = Object.freeze([...held.values()])
	given.add(roles)
	return roles
}

const isHeld = (value: unknown): value is readonly Held[] =>
	typeof value === 'object' && value !== null && given.has(value)

const roles = definePlugin<Roles>({
	name: 'roles',
	manifest,
	start: ({ models }) => {
		rolesModelOf(models)
	},
	caller: async ({ user }, { models }) => {
		// Built apart: a key no interface declares is not an excess one.
		const keys = {
			[rolesKey]: await rolesOfUser(user.id, rolesModelOf(models)),
		}
		return keys
	},
})

/** Each user caller's roles, read once per caller (D-123). */
export const rolesPlugin: PluginOf<Roles> = roles.plugin
/** The roles plugin's entry in the role model's `use`, which `defineRole` adds. */
export const rolesUse: UseOf<Roles> = roles.use

/**
 * The caller's roles, each `{ id, name }`, inherited ones included; `[]` for
 * a caller the roles plugin did not complete (D-126).
 */
export function rolesOf(
	caller: Caller,
): readonly { readonly id: string; readonly name: string }[] {
	const held: unknown = Reflect.get(caller, rolesKey)
	return isHeld(held) ? held : []
}

function holds(caller: Caller, names: readonly string[]): boolean {
	if (caller.kind !== 'user') return false
	const held: unknown = Reflect.get(caller, rolesKey)
	if (!isHeld(held)) {
		throw new Error(
			'hasRole reads the roles rolesPlugin() gives a caller: add rolesPlugin() to plugins.',
		)
	}
	return held.some(({ name }) => names.includes(name))
}

/**
 * Whether the caller has one of the roles, inherited ones included; false
 * for an anonymous or Master caller (D-126). Without the caller, the rule
 * asking it (D-10).
 */
export function hasRole(...names: readonly [string, ...string[]]): CallerRule
export function hasRole(
	caller: Caller,
	...names: readonly [string, ...string[]]
): boolean
export function hasRole(
	first: Caller | string,
	...names: readonly string[]
): CallerRule | boolean {
	if (typeof first !== 'string') {
		if (names.length === 0) throw new TypeError('hasRole takes a role name.')
		return holds(first, names)
	}
	const wanted = [first, ...names]
	return ({ caller }) => holds(caller, wanted)
}
