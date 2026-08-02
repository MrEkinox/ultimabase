import {
	hookDiagnosticsObserverServiceToken,
	type HookDiagnosticEvent,
	type HookDiagnosticsObserver,
	type ServiceToken,
} from '../../index.js'
import { expectTypeOf, test } from 'vitest'

test('exports one precise redacted diagnostic observer contract', () => {
	expectTypeOf(hookDiagnosticsObserverServiceToken).toEqualTypeOf<
		ServiceToken<HookDiagnosticsObserver>
	>()

	const observer: HookDiagnosticsObserver = (event) => {
		expectTypeOf(event).toEqualTypeOf<HookDiagnosticEvent>()
		expectTypeOf(event.requestId).toBeString()
		expectTypeOf(event.transactionId).toEqualTypeOf<string | undefined>()
		expectTypeOf(event.durationMs).toBeNumber()
		expectTypeOf(event.declarationBranch).toBeString()
		expectTypeOf(event.handlerIndex).toBeNumber()
		// @ts-expect-error -- Redacted diagnostics never expose business inputs.
		void event.input
		// @ts-expect-error -- Redacted diagnostics never expose raw errors.
		void event.error
		// @ts-expect-error -- Redacted diagnostics never expose request metadata.
		void event.metadata
	}

	void observer
})
