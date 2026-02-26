/**
 * Wails injects go and runtime on window at runtime.
 * Use the bindings from wailsjs/go/main/App and wailsjs/runtime/runtime for typed calls.
 */
declare global {
  interface Window {
    go?: { main?: { App?: Record<string, (...args: unknown[]) => unknown> } };
    runtime?: Record<string, (...args: unknown[]) => unknown>;
  }
}

export {};
