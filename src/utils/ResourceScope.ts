/** One ownership scope per mounted engine, including cancellation during asset loading. */
export class ResourceScope {
  private abort = new AbortController();
  private disposers: (() => void)[] = [];
  disposed = false;
  get signal() {return this.abort.signal;}
  own(dispose: () => void) {if (this.disposed) dispose(); else this.disposers.push(dispose);}
  check() {if (this.disposed) throw new DOMException('Engine unmounted', 'AbortError');}
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort();
    const errors: unknown[] = [];
    for (const dispose of this.disposers.splice(0).reverse()) {try {dispose();} catch (error) {errors.push(error);}}
    if (errors.length) throw new AggregateError(errors, 'Engine cleanup failed');
  }
}
