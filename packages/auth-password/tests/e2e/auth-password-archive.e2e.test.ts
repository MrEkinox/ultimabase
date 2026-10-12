import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'

const packages = path.resolve(import.meta.dirname, '../../..')

const readPackage = async (name: string) => {
	const directory = path.join(packages, name)
	const manifest: unknown = JSON.parse(
		await readFile(path.join(directory, 'package.json'), 'utf8'),
	)
	const surfaces = await Promise.all([
		readFile(path.join(directory, 'dist', 'index.js'), 'utf8'),
		readFile(path.join(directory, 'dist', 'index.js.map'), 'utf8'),
	])
	const dependencies: unknown =
		typeof manifest === 'object' && manifest !== null
			? Reflect.get(manifest, 'dependencies')
			: undefined
	return {
		dependencies,
		includes: (text: string) =>
			surfaces.some((surface) => surface.includes(text)),
	}
}

it('publishes the reviewed Argon2id method and the session foundation', async () => {
	const method = await readPackage('auth-password')
	expect(method.dependencies).toMatchObject({
		'@ultimabase/auth-plugin': 'workspace:^',
		argon2: '0.45.1',
	})
	expect(method.includes('argon2')).toBe(true)
	expect(method.includes('createNormalizedPasswordVerifier')).toBe(true)

	const foundation = await readPackage('auth-plugin')
	expect(foundation.dependencies).toMatchObject({
		'@ultimabase/http-plugin': 'workspace:^',
	})
	expect(foundation.dependencies).not.toHaveProperty('argon2')
	for (const evidence of [
		'ub_s1.',
		'AUTH_INVALID_SESSION',
		'AUTH_TOO_MANY_ATTEMPTS',
		'Set-Cookie',
		'__Host-',
	]) {
		expect(foundation.includes(evidence), evidence).toBe(true)
	}
})
