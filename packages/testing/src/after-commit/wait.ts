import { waitForAfterCommitWork } from '@ultimabase/core/plugin'

/**
 * Resolves once the active application's pending after-commit work has run:
 * `afterCommit` hooks and event consumers, which the response does not wait
 * for (ADR-0318). Work they start is awaited too. It never rejects; failures
 * are logged by the application.
 *
 * @example
 * ```ts
 * await Todo.createOne({ data: { title: 'Ship' } })
 * await waitForAfterCommit()
 * expect(sentEmails).toHaveLength(1)
 * ```
 */
export const waitForAfterCommit = (): Promise<void> => waitForAfterCommitWork()
