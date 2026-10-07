import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createPostgresIndexName } from '../naming.js'

describe('PostgreSQL index naming', () => {
	it('is deterministic and distinguishes field boundaries and uniqueness', () => {
		const first = createPostgresIndexName(
			'audit_logs',
			['tenant', 'event'],
			false,
		)

		expect(
			createPostgresIndexName('audit_logs', ['tenant', 'event'], false),
		).toBe(first)
		expect(first).toMatch(/^audit_logs_tenant_event_idx_[a-f0-9]{16}$/u)
		expect(
			createPostgresIndexName('audit_logs', ['tenant_event'], false),
		).not.toBe(createPostgresIndexName('audit_logs_tenant', ['event'], false))
		expect(createPostgresIndexName('audit_logs', ['tenant'], true)).not.toBe(
			createPostgresIndexName('audit_logs', ['tenant'], false),
		)
	})

	it('truncates Unicode identifiers on complete code points within 63 bytes', () => {
		// PostgreSQL measures identifiers in encoded bytes rather than JavaScript code units.
		const name = createPostgresIndexName(
			'😀'.repeat(30),
			['événement'.repeat(20)],
			true,
		)

		expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63)
		expect(name).toMatch(/_[a-f0-9]{16}$/u)
		expect(name).not.toContain('�')
	})
})
