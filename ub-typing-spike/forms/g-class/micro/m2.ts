interface Rules<S> { access(options: { where: (s: S) => void }): { readonly '~rule': 'access' } }
interface BaseCtor<F> {
	new (): { readonly id: string }
	readonly '~fields': F
	readonly rules: Rules<this>
	self(): this
}
declare const make: <const F>(f: F) => BaseCtor<F>
export class A extends make({ title: 'x' }) {
	static access = this.rules.access({ where: (s) => { const t: number = s } })
	static me = this.self()
}
const check: number = A.me
