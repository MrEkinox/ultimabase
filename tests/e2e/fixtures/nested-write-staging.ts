/**
 * Keeps pre-2403 execution fixtures flat while issue 2402 exposes only the
 * canonical nested public input in generated declarations.
 */
export const stagedFlatPointerInput = (value: unknown): never => value as never
