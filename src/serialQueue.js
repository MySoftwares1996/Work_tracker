/**
 * Runs jobs one at a time, in order - and never lets one job that hangs block every later one. A native call
 * that never answers (an alarm or notification API stuck on a busy phone) used to leave the whole queue waiting
 * for ever: no alert after it was ever booked again until the app was restarted. After `ms` the job is given up
 * on (its caller gets an error) and the next one starts.
 */
export function withTimeout(promise, ms, what = 'job', onTimeout = null) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => { if (onTimeout) onTimeout(); reject(new Error(`${what} timed out after ${ms} ms`)); }, ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

export function makeSerial(ms = 60000, what = 'job') {
  let queue = Promise.resolve();
  return (fn) => {
    // The job gets { cancelled }: set when it is given up on, so a job that is still running (it cannot be stopped)
    // checks it before booking or cancelling anything and does not collide with the job that has started after it.
    const ctx = { cancelled: false };
    const run = queue.then(() => withTimeout(Promise.resolve().then(() => fn(ctx)), ms, what, () => { ctx.cancelled = true; }));
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
}
