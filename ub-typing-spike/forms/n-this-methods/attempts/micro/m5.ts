interface FB { string(): { kind: 'string'; v: string }; boolean(): { kind: 'boolean'; v: boolean } }
// field hooks keyed by the inferred fields, methods using `this`
type FieldHooksA<F> = { readonly [K in keyof F]?: { readonly resolveInput?: (this: { value: F[K] extends { v: infer V } ? V : never }) => unknown } }
declare function defineA<const N extends string, const F>(d: { className: N; fields: (f: FB) => F; hooks?: { fields?: FieldHooksA<F> } }): F
export const a = defineA({ className: 'A', fields: (f) => ({ title: f.string() }), hooks: { fields: { title: { resolveInput() { return this.value.trim() } } } } })
// same with arrow + parameter instead of `this`
type FieldHooksB<F> = { readonly [K in keyof F]?: { readonly resolveInput?: (args: { value: F[K] extends { v: infer V } ? V : never }) => unknown } }
declare function defineB<const N extends string, const F>(d: { className: N; fields: (f: FB) => F; hooks?: { fields?: FieldHooksB<F> } }): F
export const b = defineB({ className: 'B', fields: (f) => ({ title: f.string() }), hooks: { fields: { title: { resolveInput: ({ value }) => value.trim() } } } })
// fields as Readonly<F & System>
type FieldHooksC<F> = { readonly [K in keyof Readonly<F & { id: { kind: 'string'; v: string } }>]?: { readonly resolveInput?: (this: { value: string }) => unknown } }
declare function defineC<const N extends string, const F>(d: { className: N; fields: (f: FB) => F; hooks?: { fields?: FieldHooksC<F> } }): F
export const c = defineC({ className: 'C', fields: (f) => ({ title: f.string() }), hooks: { fields: { title: { resolveInput() { return this.value.trim() } } } } })
