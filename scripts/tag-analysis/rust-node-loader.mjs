// Adapt the same Workers Wasm module for the offline Node analysis script.
import * as nodeModule from 'node:module';
import { readFileSync } from 'node:fs';

globalThis.addEventListener ??= () => {};
nodeModule.registerHooks?.({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: specifier, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'cloudflare:workers') return {
      format: 'module', shortCircuit: true,
      source: 'export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }',
    };
    if (url.endsWith('.wasm')) return {
      format: 'module', shortCircuit: true,
      source: `export default new WebAssembly.Module(new Uint8Array(${JSON.stringify([...readFileSync(new URL(url))])}));`,
    };
    return next(url, context);
  },
});
