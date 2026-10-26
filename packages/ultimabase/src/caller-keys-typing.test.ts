// A plugin's caller keys are typed by declaring them (D-121): an application
// declaring one compiles, kernel included, and reads it on a user caller.
// The program is its own, so its declaration reaches no other test.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'

const root = join(import.meta.dirname, '../../..')

const app = `import type { Caller, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'

declare module 'ultimabase' {
	interface UserCallerKeys {
		readonly roles: readonly string[]
	}
}

export const admin = (caller: Caller): boolean =>
	caller.kind === 'user' && caller.roles.includes('admin')

// @ts-expect-error -- an anonymous caller or Master has no roles.
export const any = (caller: Caller): boolean => caller.roles.length > 0

interface Roles extends PluginTypes {
	readonly name: 'roles'
}
export const roles = definePlugin<Roles>({
	name: 'roles',
	manifest: { name: 'roles', version: '1.0.0' },
	caller: async () => ({ roles: ['admin'] }),
})
export const wrong = definePlugin<Roles>({
	name: 'roles',
	manifest: { name: 'roles', version: '1.0.0' },
	// @ts-expect-error -- roles are strings.
	caller: () => ({ roles: [1] }),
})
`

test('a declared caller key compiles, and is read on a user caller', () => {
	const copy = mkdtempSync(join(root, 'node_modules/.caller-keys-'))
	try {
		writeFileSync(join(copy, 'app.ts'), app)
		writeFileSync(
			join(copy, 'tsconfig.json'),
			JSON.stringify({
				extends: relative(copy, join(root, 'tsconfig.json')),
				include: ['app.ts'],
				exclude: [],
			}),
		)
		const result = spawnSync(
			join(root, 'node_modules/.bin/tsc'),
			['-p', 'tsconfig.json', '--pretty', 'false'],
			{ cwd: copy, encoding: 'utf8' },
		)
		expect(result.stdout).toBe('')
	} finally {
		rmSync(copy, { recursive: true })
	}
})
