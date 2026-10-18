import {
	defineOperationTransport,
	type ApplicationExposurePlan,
	type ApplicationOperationTransportPlanner,
	type ExposedWriteMethod,
	type ExposurePlanningOptions,
	type OperationTransportProtocol,
} from '@ultimabase/core'
import {
	defineOperation,
	defineOperationValue,
	nativeCommandCatalog,
} from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { definePluginOptionsParser } from './plugin-options.js'
import {
	assertPublicWrites,
	parseTransportExposureOptions,
	readExposurePlan,
	transportExposureOptionKeys,
	type NormalizedTransportExposureOptions,
} from './transport-exposure.js'

// ADR-0347 decision 3: every transport shares `default`, `hide`,
// `pagination` and `publicWrites`; each keeps its own wording.
const readingTime = defineOperation({
	input: defineOperationValue(() => null),
	name: 'fixture.reading-time',
	result: defineOperationValue(() => 1),
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

const parseFixture = definePluginOptionsParser({
	name: 'Fixture transport options',
	keys: [...transportExposureOptionKeys, 'basePath'] as const,
	normalize: ({ basePath, ...values }) => ({
		...parseTransportExposureOptions(values, { name: 'Fixture plugin' }),
		basePath: typeof basePath === 'string' ? basePath : '/',
	}),
})

const parseUntyped = (input: unknown): unknown =>
	Reflect.apply(parseFixture, undefined, [input])

describe('shared transport exposure options', () => {
	it('lists the four shared keys', () => {
		expect(transportExposureOptionKeys).toStrictEqual([
			'default',
			'hide',
			'pagination',
			'publicWrites',
		])
	})

	it('applies the defaults inside a transport parser', () => {
		expect(parseFixture({})).toStrictEqual({
			basePath: '/',
			default: undefined,
			hide: [],
			pagination: { defaultTake: 100, maxTake: 1000 },
			publicWrites: false,
		})
	})

	it('normalizes every shared option', () => {
		const parsed = parseFixture({
			default: { write: false, createOne: true },
			hide: [readingTime],
			pagination: { defaultTake: 20, maxTake: 200 },
			publicWrites: true,
		})
		expect(parsed).toStrictEqual({
			basePath: '/',
			default: { write: false, createOne: true },
			hide: [readingTime],
			pagination: { defaultTake: 20, maxTake: 200 },
			publicWrites: true,
		})
		expect(Object.isFrozen(parsed.default)).toBe(true)
		expect(Object.isFrozen(parsed.hide)).toBe(true)
		expect(Object.isFrozen(parsed.pagination)).toBe(true)
	})

	it.each([
		[
			{ default: 'all' },
			'Fixture plugin default must be a boolean or plain object',
		],
		[
			{ default: { softDelete: true } },
			'Fixture plugin default contains unknown method: softDelete; use all, read, write, find, count, exists, create, update, upsert, delete, findMany, findOne, createOne, createMany, updateOne, updateMany, upsertOne, upsertMany, deleteOne, deleteMany',
		],
		[{ hide: readingTime }, 'Fixture plugin hide must be an array'],
		[
			{ hide: ['refresh'] },
			'Fixture plugin hide[0] must be an operation token',
		],
		[
			{ hide: [readingTime, readingTime] },
			'Fixture plugin hide repeats fixture.reading-time',
		],
		[{ pagination: 20 }, 'Fixture plugin pagination must be a plain object'],
		[
			{ pagination: { size: 1 } },
			'Fixture plugin pagination has an unknown option: size',
		],
		[
			{ pagination: { maxTake: 1.5 } },
			'Fixture plugin pagination.maxTake must be a positive safe integer',
		],
		[
			{ pagination: { defaultTake: 0 } },
			'Fixture plugin pagination.defaultTake must be a positive safe integer',
		],
		[
			{ pagination: { defaultTake: 11, maxTake: 10 } },
			'Fixture plugin pagination.defaultTake must not exceed pagination.maxTake',
		],
		[{ publicWrites: 'yes' }, 'Fixture plugin publicWrites must be a boolean'],
	])('names the transport in each message %#', (input, message) => {
		expect(() => parseUntyped(input)).toThrow(new TypeError(message))
	})

	it('refuses a __proto__ pagination key instead of reading a prototype', () => {
		const input: unknown = JSON.parse('{"pagination":{"__proto__":{}}}')
		expect(() => parseUntyped(input)).toThrow(
			'Fixture plugin pagination has an unknown option: __proto__',
		)
	})

	it('caps the page window at the transport maximum', () => {
		const parse = (pagination: unknown) =>
			parseTransportExposureOptions(
				{ pagination },
				{ maximumTake: 500, name: 'Fixture plugin' },
			)
		expect(parse({ defaultTake: 500, maxTake: 500 }).pagination).toStrictEqual({
			defaultTake: 500,
			maxTake: 500,
		})
		expect(() => parse({ maxTake: 501 })).toThrow(
			new TypeError('Fixture plugin pagination.maxTake must not exceed 500'),
		)
		expect(() => parse({ defaultTake: 501 })).toThrow(
			new TypeError(
				'Fixture plugin pagination.defaultTake must not exceed 500',
			),
		)
	})
})

const protocol = defineOperationTransport({
	name: 'fixture.transport-exposure.wire',
	version: '1.0.0',
})

const recordingPlanner = (requests: unknown[]) => {
	const unsupported = (): never => {
		throw new TypeError('unexpected planner call')
	}
	const planner: ApplicationOperationTransportPlanner = {
		plan: unsupported,
		planSchemaMutations: unsupported,
		planExposure: <const TTransport extends OperationTransportProtocol>(
			options: ExposurePlanningOptions<TTransport>,
		): ApplicationExposurePlan<TTransport> => {
			requests.push(options)
			return {
				operations: [],
				schemas: [],
				transport: options.transport,
				writes: [],
			}
		},
	}
	return planner
}

const normalized = (
	values: Partial<NormalizedTransportExposureOptions>,
): NormalizedTransportExposureOptions => ({
	default: undefined,
	hide: [],
	pagination: { defaultTake: 100, maxTake: 1000 },
	publicWrites: false,
	...values,
})

describe('the exposure plan reader', () => {
	it('asks Core for the plan with the parsed default and hide', () => {
		const requests: unknown[] = []
		const plan = readExposurePlan(recordingPlanner(requests), {
			factory: 'fixturePlugin',
			label: 'Fixture',
			options: normalized({ default: { read: true }, hide: [readingTime] }),
			schemaKey: 'wire',
			transport: protocol,
		})
		expect(plan.transport).toBe(protocol)
		expect(requests).toStrictEqual([
			{
				default: { read: true },
				factory: 'fixturePlugin',
				hide: [readingTime],
				label: 'Fixture',
				schemaKey: 'wire',
				transport: protocol,
			},
		])
	})

	it('leaves default out when the transport sets none', () => {
		const requests: unknown[] = []
		readExposurePlan(recordingPlanner(requests), {
			factory: 'fixturePlugin',
			label: 'Fixture',
			options: normalized({}),
			schemaKey: 'wire',
			transport: protocol,
		})
		expect(requests).toStrictEqual([
			{
				factory: 'fixturePlugin',
				hide: [],
				label: 'Fixture',
				schemaKey: 'wire',
				transport: protocol,
			},
		])
	})
})

const nativeWrite = (schema: string, method: string): ExposedWriteMethod => {
	const entry = nativeCommandCatalog.find(
		(candidate) => candidate.method === method,
	)
	if (entry === undefined) throw new TypeError(`No native method ${method}`)
	return { method: { entry, kind: 'native' }, schema }
}

const describeWrite = ({ method, schema }: ExposedWriteMethod): string =>
	`${schema}.${method.entry.method}`

const check =
	(
		writes: readonly ExposedWriteMethod[],
		values: Readonly<{ hasProtectedPolicy?: boolean; publicWrites?: boolean }>,
	) =>
	() => {
		assertPublicWrites({
			describe: describeWrite,
			hasProtectedPolicy: values.hasProtectedPolicy ?? false,
			hint: 'fixturePlugin({ publicWrites: true })',
			label: 'Fixture',
			publicWrites: values.publicWrites ?? false,
			writes,
		})
	}

describe('the shared publicWrites check (ADR-0294)', () => {
	const writes = [
		nativeWrite('Todo', 'createOne'),
		nativeWrite('Todo', 'updateOne'),
		nativeWrite('Todo', 'deleteOne'),
		nativeWrite('Note', 'createOne'),
	]

	it('refuses writes without a protected policy, naming the first three', () => {
		expect(check(writes, {})).toThrow(
			new TypeError(
				'Fixture exposes writes (Todo.createOne, Todo.updateOne, Todo.deleteOne, …) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass fixturePlugin({ publicWrites: true }) to let every client write.',
			),
		)
		expect(check(writes.slice(0, 1), {})).toThrow(
			'Fixture exposes writes (Todo.createOne) but no protected policy',
		)
	})

	it('accepts no writes, a protected policy, or the publicWrites opt-in', () => {
		expect(check([], {})).not.toThrow()
		expect(check(writes, { hasProtectedPolicy: true })).not.toThrow()
		expect(check(writes, { publicWrites: true })).not.toThrow()
	})
})
