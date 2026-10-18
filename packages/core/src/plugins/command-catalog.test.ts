import { describe, expect, it } from 'vitest'

import {
	nativeCommandCatalog,
	readPluginCommandOperation,
	resolveCommandKey,
	type CommandCatalogEntry,
} from './command-catalog.js'

const native = (method: string): CommandCatalogEntry => {
	const entry = nativeCommandCatalog.find(
		(candidate) => candidate.method === method,
	)
	if (entry === undefined) throw new TypeError(`No native method ${method}`)
	return entry
}

describe('native command catalog', () => {
	it('places every transport method in one operation, group and cardinality (ADR-0347)', () => {
		expect(
			nativeCommandCatalog.map(
				({ cardinality, group, method, operation, operationKind }) => [
					method,
					operation,
					group,
					cardinality,
					operationKind,
				],
			),
		).toEqual([
			['findMany', 'find', 'read', 'many', 'find-many'],
			['findOne', 'find', 'read', 'one', 'find-one'],
			['count', 'count', 'read', 'aggregate', 'count'],
			['exists', 'exists', 'read', 'aggregate', 'exists'],
			['createOne', 'create', 'write', 'one', 'create-one'],
			['createMany', 'create', 'write', 'many', 'create-many'],
			['updateOne', 'update', 'write', 'one', 'update-one'],
			['updateMany', 'update', 'write', 'many', 'update-many'],
			['upsertOne', 'upsert', 'write', 'one', 'upsert-one'],
			['upsertMany', 'upsert', 'write', 'many', 'upsert-many'],
			['deleteOne', 'delete', 'write', 'one', 'delete-one'],
			['deleteMany', 'delete', 'write', 'many', 'delete-many'],
		])
	})

	it('opens the built-in default methods only', () => {
		expect(
			nativeCommandCatalog
				.filter(({ defaultExposed }) => defaultExposed)
				.map(({ method }) => method),
		).toEqual([
			'findMany',
			'findOne',
			'exists',
			'createOne',
			'updateOne',
			'deleteOne',
		])
	})
})

describe('plugin command names', () => {
	it('reads the operation a conforming name forms', () => {
		expect(readPluginCommandOperation('archiveOne', 'one')).toBe('archive')
		expect(readPluginCommandOperation('archiveMany', 'many')).toBe('archive')
		expect(readPluginCommandOperation('softDeleteOne', 'one')).toBe(
			'softDelete',
		)
	})

	it('names the expected form when the suffix does not match the target', () => {
		expect(() => readPluginCommandOperation('archive', 'one')).toThrow(
			'Command archive must be named <operation>One because its target is one: archiveOne',
		)
		expect(() => readPluginCommandOperation('archiveMany', 'one')).toThrow(
			'Command archiveMany must be named <operation>One because its target is one: archiveOne',
		)
		expect(() => readPluginCommandOperation('archiveOne', 'many')).toThrow(
			'Command archiveOne must be named <operation>Many because its target is many: archiveMany',
		)
		expect(() => readPluginCommandOperation('One', 'one')).toThrow(
			'Command One must be named <operation>One because its target is one',
		)
	})

	it.each([
		['createOne', 'create'],
		['deleteMany', 'delete'],
		['countOne', 'count'],
		['findOneOne', 'findOne'],
		['readOne', 'read'],
		['writeMany', 'write'],
		['allOne', 'all'],
	])('refuses %s, whose operation Core reserves', (name, operation) => {
		const target = name.endsWith('Many') ? 'many' : 'one'
		expect(() => readPluginCommandOperation(name, target)).toThrow(
			`Command ${name} names the operation ${operation}, which Core reserves: a plugin operation cannot be a native operation, a native method, read, write or all`,
		)
	})
})

describe('command key resolution', () => {
	it('lets the most precise key decide', () => {
		const createMany = native('createMany')
		expect(resolveCommandKey({}, createMany)).toBeUndefined()
		expect(resolveCommandKey({ read: true }, createMany)).toBeUndefined()
		expect(resolveCommandKey({ all: true }, createMany)).toBe(true)
		expect(resolveCommandKey({ all: true, write: false }, createMany)).toBe(
			false,
		)
		expect(resolveCommandKey({ create: true, write: false }, createMany)).toBe(
			true,
		)
		expect(
			resolveCommandKey(
				{ all: true, create: true, createMany: false, write: true },
				createMany,
			),
		).toBe(false)
	})

	it('treats count and exists as both operation and method', () => {
		expect(
			resolveCommandKey({ count: true, read: false }, native('count')),
		).toBe(true)
		expect(
			resolveCommandKey({ exists: false, read: true }, native('exists')),
		).toBe(false)
	})
})
