import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createPostgresForeignKeyName } from '../naming.js'

describe('PostgreSQL foreign-key naming', () => {
	it('distinguishes relationship boundaries deterministically', () => {
		const name = createPostgresForeignKeyName('posts', 'author', 'users', 'id')

		expect(name).toMatch(/^posts_author_users_id_fk_[a-f0-9]{16}$/u)
		expect(createPostgresForeignKeyName('posts', 'author', 'users', 'id')).toBe(
			name,
		)
		expect(
			createPostgresForeignKeyName('posts_author', 'user', 'users', 'id'),
		).not.toBe(
			createPostgresForeignKeyName('posts', 'author_user', 'users', 'id'),
		)
	})

	it('keeps long Unicode identifiers within PostgreSQL limits', () => {
		const name = createPostgresForeignKeyName(
			'😀'.repeat(30),
			'auteur'.repeat(20),
			'utilisateurs'.repeat(20),
			'id',
		)

		expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63)
		expect(name).toMatch(/_[a-f0-9]{16}$/u)
		expect(name).not.toContain('�')
	})
})
