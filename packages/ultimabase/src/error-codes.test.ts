// `ErrorCodeOf<typeof app>` (D-206) and `IssueCodeOf<typeof app>` (D-231):
// the codes of the application's plugins, for a client's table of messages.
import { describe, expectTypeOf, it } from 'vitest'
import type {
	ErrorCode,
	ErrorCodeOf,
	IssueCodeOf,
	PluginTypes,
} from './index.ts'
import { defineApp, definePlugin, memory } from './index.ts'

interface Shop extends PluginTypes {
	readonly name: 'shop'
	readonly errors: 'OUT_OF_STOCK' | 'CLOSED'
	readonly issues: 'SKU_FORMAT'
}
const shop = definePlugin<Shop>({
	name: 'shop',
	manifest: { name: 'shop', version: '1.0.0' },
})

interface Quiet extends PluginTypes {
	readonly name: 'quiet'
}
const quiet = definePlugin<Quiet>({
	name: 'quiet',
	manifest: { name: 'quiet', version: '1.0.0' },
})

describe('ErrorCodeOf', () => {
	it("is the kernel's codes and its plugins'", () => {
		const app = defineApp({
			database: memory(),
			plugins: [shop.plugin(), quiet.plugin()],
			models: [],
		})
		expectTypeOf<ErrorCodeOf<typeof app>>().toEqualTypeOf<
			ErrorCode | 'OUT_OF_STOCK' | 'CLOSED'
		>()
	})

	it("is the kernel's codes without plugins", () => {
		const app = defineApp({ database: memory(), models: [] })
		expectTypeOf<ErrorCodeOf<typeof app>>().toEqualTypeOf<ErrorCode>()
	})

	it('refuses a table that misses a code', () => {
		const app = defineApp({
			database: memory(),
			plugins: [shop.plugin()],
			models: [],
		})
		type Messages = Record<ErrorCodeOf<typeof app>, string>
		expectTypeOf<{ OUT_OF_STOCK: string }>().not.toExtend<Messages>()
	})
})

describe('IssueCodeOf', () => {
	it("is its plugins' issue codes, not their error codes", () => {
		const app = defineApp({
			database: memory(),
			plugins: [shop.plugin(), quiet.plugin()],
			models: [],
		})
		expectTypeOf<IssueCodeOf<typeof app>>().toEqualTypeOf<'SKU_FORMAT'>()
	})

	it('is none without a plugin that declares one', () => {
		const app = defineApp({
			database: memory(),
			plugins: [quiet.plugin()],
			models: [],
		})
		expectTypeOf<IssueCodeOf<typeof app>>().toBeNever()
		expectTypeOf<ErrorCodeOf<typeof app>>().toEqualTypeOf<ErrorCode>()
	})
})
