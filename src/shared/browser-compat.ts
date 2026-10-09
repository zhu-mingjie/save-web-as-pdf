// Chrome 120 has ReadableStream but not its async iterator. PDF.js legacy
// supplies JS polyfills; this Web API adapter is needed in both worker and
// window contexts before PDF.js consumes a stream. No prototype is replaced
// when the browser already implements the standard API.
const prototype = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
if (!prototype[Symbol.asyncIterator]) {
  Object.defineProperty(prototype, Symbol.asyncIterator, {
    configurable: true, writable: true,
    value: function(this: ReadableStream, options: { preventCancel?: boolean } = {}) {
      const reader = this.getReader();
      let finished = false;
      return {
        async next() {
          if (finished) return { value: undefined, done: true };
          try {
            const value = await reader.read();
            if (value.done) { finished = true; reader.releaseLock(); }
            return value;
          } catch (error) { finished = true; reader.releaseLock(); throw error; }
        },
        async return(value: unknown) {
          if (!finished) {
            finished = true;
            try { if (!options.preventCancel) await reader.cancel(value); }
            finally { reader.releaseLock(); }
          }
          return { value, done: true };
        },
        [Symbol.asyncIterator]() { return this; }
      };
    }
  });
}
