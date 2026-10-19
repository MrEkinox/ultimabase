interface Decl<T> { readonly '~rule': 'access'; readonly options: T }
interface BaseCtor {
	new (): { readonly id: string }
	access(options: { read?: boolean }): Decl<{ read?: boolean }>
	hooks(options: { beforeSave?: () => void }): Decl<{ beforeSave?: () => void }>
}
declare const Base: BaseCtor
// 1. same name, this.
export class A extends Base {
	static access = this.access({ read: true })
}
// 2. same name, super.
export class B extends Base {
	static access = super.access({ read: true })
}
// 3. different name
export class C extends Base {
	static accessRules = this.access({ read: true })
}
