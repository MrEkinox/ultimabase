import type { ultimabase } from './ultimabase.ts';
declare module '../lib/types.ts' {
    interface Register {
        readonly app: typeof ultimabase;
    }
}
