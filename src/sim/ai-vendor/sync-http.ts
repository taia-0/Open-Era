import { Worker } from "node:worker_threads";

/**
 * A synchronous POST for the synchronous seams (section 3). The real
 * transport runs `fetch` in a worker thread and blocks the main thread on
 * `Atomics.wait` for at most the role's timeout. Tests inject a transport.
 */
export interface SyncRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export type SyncResponse =
  | { kind: "response"; status: number; body: string }
  | { kind: "timeout" }
  | { kind: "error" };

export type SyncTransport = (request: SyncRequest) => SyncResponse;

/** Room for the response body. A larger body is treated as an error. */
export const RESPONSE_MAX_BYTES = 256 * 1024;

/**
 * The worker body. It sends one POST and writes `[length + 1, status]` and
 * the body into the shared buffer, then notifies. Status -1 is a transport
 * failure. It aborts its own fetch at the timeout.
 */
const FETCH_WORKER = `
const { workerData } = require("node:worker_threads");
const { url, headers, body, timeoutMs, shared } = workerData;
const view = new Int32Array(shared, 0, 2);
const data = new Uint8Array(shared, 8);
function write(status, text) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > data.length) { status = -1; }
  else data.set(bytes);
  view[1] = status;
  Atomics.store(view, 0, status === -1 ? 1 : bytes.length + 1);
  Atomics.notify(view, 0);
}
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
fetch(url, { method: "POST", headers, body, signal: controller.signal })
  .then(async (response) => write(response.status, await response.text()))
  .catch(() => write(-1, ""))
  .finally(() => clearTimeout(timer));
`;

/**
 * The real transport. `workerSource` is for tests only: a worker body that
 * never touches the network, to exercise the wait and the timeout offline.
 */
export function workerTransport(workerSource: string = FETCH_WORKER): SyncTransport {
  return (request) => {
    const shared = new SharedArrayBuffer(8 + RESPONSE_MAX_BYTES);
    const view = new Int32Array(shared, 0, 2);
    let worker: Worker;
    try {
      worker = new Worker(workerSource, { eval: true, workerData: { ...request, shared } });
    } catch {
      return { kind: "error" };
    }
    worker.unref();
    worker.on("error", () => undefined);
    const waited = Atomics.wait(view, 0, 0, request.timeoutMs);
    if (waited === "timed-out") {
      void worker.terminate();
      return { kind: "timeout" };
    }
    void worker.terminate();
    const length = Atomics.load(view, 0) - 1;
    const status = view[1];
    if (status === -1) return { kind: "error" };
    const body = Buffer.from(new Uint8Array(shared, 8, length)).toString("utf8");
    return { kind: "response", status, body };
  };
}
