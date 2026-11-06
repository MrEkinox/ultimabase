// A full buffer takes changes that cost less than the window they save (D-254).
import { describe, expect, it } from 'vitest'
import { Backlog } from './backlog.ts'

const window = (count: number) => ({
	kind: 'reset',
	rows: Array.from({ length: count }, () => ({})),
})
const changes = (count: number) => ({
	kind: 'changes',
	changes: Array.from({ length: count }, () => ({})),
})

describe('a backlog', () => {
	it('takes everything while the buffer is not full', () => {
		const backlog = new Backlog()
		expect(backlog.takes(false, changes(100))).toBe(true)
		expect(backlog.takes(false, { kind: 'row' })).toBe(true)
	})

	it('takes changes on a full buffer up to the rows the window shows', () => {
		const backlog = new Backlog()
		backlog.takes(false, window(10))
		expect(backlog.takes(true, changes(4))).toBe(true)
		expect(backlog.takes(true, changes(4))).toBe(true)
		expect(backlog.takes(true, changes(1))).toBe(false)
	})

	it('counts each message, so that empty ones end too', () => {
		const backlog = new Backlog()
		backlog.takes(false, window(2))
		expect(backlog.takes(true, changes(0))).toBe(true)
		expect(backlog.takes(true, changes(0))).toBe(true)
		expect(backlog.takes(true, changes(0))).toBe(false)
	})

	it('starts over once the buffer is no longer full', () => {
		const backlog = new Backlog()
		backlog.takes(false, window(2))
		expect(backlog.takes(true, changes(2))).toBe(false)
		backlog.takes(false, changes(0))
		expect(backlog.takes(true, changes(1))).toBe(true)
	})

	it('takes no whole window, row or value on a full buffer', () => {
		const backlog = new Backlog()
		backlog.takes(false, window(10))
		expect(backlog.takes(true, window(10))).toBe(false)
		expect(backlog.takes(true, { kind: 'row' })).toBe(false)
		expect(backlog.takes(true, { kind: 'value' })).toBe(false)
	})

	it('takes the size of the last window sent', () => {
		const backlog = new Backlog()
		backlog.takes(false, window(10))
		backlog.takes(false, window(1))
		expect(backlog.takes(true, changes(1))).toBe(false)
	})
})
