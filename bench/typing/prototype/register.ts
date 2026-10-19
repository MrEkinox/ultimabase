// What the application and its plugins declare to the kernel's types.

/** The project declares its application here once (D-24). */
export interface Register {}

/**
 * Each plugin adds its key of a model's `.with` here, named after it (D-42).
 * `F` is the model's fields.
 */
// oxlint-disable-next-line eslint/no-unused-vars -- plugins read `F`
export interface ModelWithKeys<F> {}

/** Each plugin adds its key of `defineModel` here (D-07, D-42). */
export interface ModelOptionKeys {}

/**
 * Each plugin adds, named after it, what its `defineModel` key adds to the
 * model (D-15 commands). `F` is the model's fields, `O` its options.
 */
// oxlint-disable-next-line eslint/no-unused-vars -- plugins read `F` and `O`
export interface ModelCommands<F, O> {}
