interface P<T> { readonly '~target': T }
interface Base<F> { new (): { readonly id: string }; readonly '~fields': F }
declare const make: <const N extends string, const F>(name: N, fields: F) => Base<F>
declare const pa: <const T extends object>(t: T) => P<T>
declare const pb: <T extends object>(t: T) => P<T>
declare const pc: <T>(t: T) => P<T>
declare const pd: <const T extends object>(o: { readonly target: T }) => P<T>
declare const pe: <T extends object>(t: T, o?: { readonly x?: boolean }) => P<T>
export class A extends make('A', { self: pa(() => A) }) {}
export class B extends make('B', { self: pb(() => B) }) {}
export class C extends make('C', { self: pc(() => C) }) {}
export class D extends make('D', { self: pd({ target: () => D }) }) {}
export class E extends make('E', { self: pe(() => E) }) {}
