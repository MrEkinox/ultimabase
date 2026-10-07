import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'

const packageDirectory = path.resolve(import.meta.dirname, '../..')

it('publishes the reviewed Password Auth native hashing implementation', async () => {
	const manifest: unknown = JSON.parse(
		await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
	)
	const dependencies: unknown =
		typeof manifest === 'object' && manifest !== null
			? Reflect.get(manifest, 'dependencies')
			: undefined
	const implementation = await Promise.all([
		readFile(path.join(packageDirectory, 'dist', 'index.js'), 'utf8'),
		readFile(path.join(packageDirectory, 'dist', 'index.js.map'), 'utf8'),
	])

	expect(dependencies).toMatchObject({
		'@ultimabase/http-plugin': 'workspace:^',
		argon2: '0.45.1',
	})
	expect(implementation.some((surface) => surface.includes('argon2'))).toBe(
		true,
	)
	expect(
		implementation.some((surface) =>
			surface.includes('createNormalizedPasswordVerifier'),
		),
	).toBe(true)
	expect(implementation.some((surface) => surface.includes('ub_s1.'))).toBe(
		true,
	)
	expect(
		implementation.some((surface) =>
			surface.includes('PASSWORD_AUTH_INVALID_SESSION'),
		),
	).toBe(true)
	expect(
		implementation.some((surface) => surface.includes('/auth/v1/refresh')),
	).toBe(true)
	expect(implementation.some((surface) => surface.includes('Set-Cookie'))).toBe(
		true,
	)
})
