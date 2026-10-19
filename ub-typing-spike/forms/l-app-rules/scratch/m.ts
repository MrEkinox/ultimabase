interface S<N extends string, F> { readonly className: N; readonly f: F }
declare const A: S<'A', { a: string }>
declare const B: S<'B', { b: number }>
type NameOf<T> = T extends { readonly className: infer N extends string } ? N : never
interface Rules<T> { readonly read?: (ctx: { schema: T }) => void }
// 1: key remapping
declare function app1<const TS extends readonly unknown[]>(o: { schemas: TS; rules?: { readonly [T in TS[number] as NameOf<T>]?: Rules<T> } }): TS
app1({ schemas: [A, B], rules: { A: { read: ({ schema }) => { schema.f.a } } } })
// 2: keys by name + Extract
declare function app2<const TS extends readonly unknown[]>(o: { schemas: TS; rules?: { readonly [K in NameOf<TS[number]>]?: Rules<Extract<TS[number], { readonly className: K }>> } }): TS
app2({ schemas: [A, B], rules: { A: { read: ({ schema }) => { schema.f.a } } } })
// 3: two arguments
declare function app3<const TS extends readonly unknown[]>(schemas: TS, rules?: { readonly [T in TS[number] as NameOf<T>]?: Rules<T> }): TS
app3([A, B], { A: { read: ({ schema }) => { schema.f.a } } })
// 4: without const
declare function app4<TS extends readonly unknown[]>(o: { schemas: TS; rules?: { readonly [T in TS[number] as NameOf<T>]?: Rules<T> } }): TS
app4({ schemas: [A, B], rules: { A: { read: ({ schema }) => { schema.f.a } } } })
// 5: lookup table, then keyof
type ByName<TS extends readonly unknown[]> = { readonly [T in TS[number] as NameOf<T>]: T }
declare function app5<const TS extends readonly unknown[]>(o: { schemas: TS; rules?: { readonly [K in keyof ByName<TS>]?: Rules<ByName<TS>[K]> } }): TS
app5({ schemas: [A, B], rules: { A: { read: ({ schema }) => { schema.f.a } } } })
app5({ schemas: [A, B], rules: { C: { read: ({ schema }) => { schema.f.a } } } })
