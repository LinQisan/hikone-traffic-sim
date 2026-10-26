import type {ModelJob, ModelResult, WorkerResponse} from '../../types/assets.ts';
// A bounded pool: each worker constructs one model at a time, while independent models can
// progress on separate CPU cores. Failed workers reject their own jobs and are replaced lazily.
export class ModelWorkerPool {
  declare createWorker: () => Worker; declare limit: number;
  declare workers: {worker: Worker; requests: Map<number, {resolve: (value: ModelResult) => void; reject: (error: Error) => void}>; index: number}[];
  declare sequence: number; declare workerSequence: number;
  constructor(createWorker: () => Worker, limit = 1) {
    this.createWorker = createWorker; this.limit = limit;
    this.workers = []; this.sequence = 0; this.workerSequence = 0;
  }

  addWorker() {
    const slot = { worker: this.createWorker(), requests: new Map<number, {resolve: (value: ModelResult) => void; reject: (error: Error) => void}>(), index: this.workerSequence++ };
    slot.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const request = slot.requests.get(data.id);
      if (!request) return;
      slot.requests.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve({ ...data, workerIndex: slot.index });
    };
    slot.worker.onerror = event => {
      for (const request of slot.requests.values()) request.reject(new Error(event.message || 'Native model worker failed'));
      slot.requests.clear(); slot.worker.terminate();
      this.workers = this.workers.filter(worker => worker !== slot);
    };
    this.workers.push(slot);
    return slot;
  }

  run(job: ModelJob): Promise<ModelResult> {
    let slot = this.workers.reduce<(typeof this.workers)[number] | null>((best, worker) => !best || worker.requests.size < best.requests.size ? worker : best, null);
    if (!slot || slot.requests.size && this.workers.length < this.limit) slot = this.addWorker();
    return new Promise<ModelResult>((resolve, reject) => {
      const id = ++this.sequence;
      slot.requests.set(id, { resolve, reject });
      try { slot.worker.postMessage({ ...job, id }); }
      catch (error) { slot.requests.delete(id); reject(error); }
    });
  }

  dispose() {
    for (const slot of this.workers) {
      slot.worker.terminate();
      for (const request of slot.requests.values()) request.reject(new Error('Model worker pool disposed'));
      slot.requests.clear();
    }
    this.workers.length = 0;
  }
}
