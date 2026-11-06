import type { ValidationRule } from 'graphql'
import { GraphQLError, parse, Source } from 'graphql'
import { describe, expect, it, vi } from 'vitest'
import { parsedOnce, validatedOnce } from './documents.ts'

describe('parsedOnce', () => {
	it('answers a document it has read with the same tree', () => {
		const reading = vi.fn<typeof parse>(parse)
		const read = parsedOnce(reading)
		expect(read('{ a }')).toBe(read('{ a }'))
		expect(read('{ b }')).not.toBe(read('{ a }'))
		expect(reading).toHaveBeenCalledTimes(2)
	})

	it('keeps no document it could not read', () => {
		const read = parsedOnce(parse)
		expect(() => read('{')).toThrow(GraphQLError)
		expect(() => read('{')).toThrow(GraphQLError)
	})

	it('forgets the least recently asked past 500 documents', () => {
		const reading = vi.fn<typeof parse>(parse)
		const read = parsedOnce(reading)
		const asked = read('{ asked }')
		const old = read('{ old }')
		for (let at = 0; at < 498; at += 1) read(`{ a${at} }`)
		expect(read('{ asked }')).toBe(asked)
		read('{ past }')
		expect(read('{ asked }')).toBe(asked)
		expect(read('{ old }')).not.toBe(old)
	})

	it('holds no document too long, as a source or as text', () => {
		const reading = vi.fn<typeof parse>(parse)
		const read = parsedOnce(reading)
		const long = `{ ${'a '.repeat(2100)}}`
		const source = new Source('{ a }')
		// Not `not.toBe`, whose message prints both trees whatever the outcome.
		expect(read(long) === read(long)).toBe(false)
		expect(read(source) === read(source)).toBe(false)
		expect(reading).toHaveBeenCalledTimes(4)
	})
})

describe('validatedOnce', () => {
	const document = parse('{ a }')
	const user: readonly ValidationRule[] = []
	const master: readonly ValidationRule[] = []

	it('validates a document once by its rules', () => {
		const validating = vi.fn<() => GraphQLError[]>(() => [])
		const validate = validatedOnce(validating)
		expect(validate(document, user)).toEqual([])
		expect(validate(document, user)).toEqual([])
		expect(validating).toHaveBeenCalledTimes(1)
	})

	it('does not take what passed under some rules for others', () => {
		const refusal = new GraphQLError('Too deep.')
		const validate = validatedOnce((_, rules) =>
			rules === user ? [refusal] : [],
		)
		expect(validate(document, master)).toEqual([])
		expect(validate(document, user)).toEqual([refusal])
		expect(validate(document, user)).toEqual([refusal])
		expect(validate(document, master)).toEqual([])
	})

	it('remembers each set of rules a document passed', () => {
		const validating = vi.fn<() => GraphQLError[]>(() => [])
		const validate = validatedOnce(validating)
		validate(document, user)
		validate(document, master)
		validate(document, user)
		validate(document, master)
		expect(validating).toHaveBeenCalledTimes(2)
	})

	it('validates every time without rules', () => {
		const validating = vi.fn<() => GraphQLError[]>(() => [])
		const validate = validatedOnce(validating)
		validate(document)
		validate(document)
		expect(validating).toHaveBeenCalledTimes(2)
	})
})
