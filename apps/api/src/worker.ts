/**
 * Placeholder worker process. Reserved for Phase 5+ (Provider webhook/async job processors
 * via BullMQ). Intentionally does nothing beyond staying alive — no queues are wired yet,
 * so there is nothing unsafe or fake to process. Keeps `docker compose up` truthful about
 * what actually runs today vs. what's scaffolded for later.
 */
// eslint-disable-next-line no-console
console.log('VAYRO worker: no queues registered yet (Phase 5+). Idling.');
setInterval(() => {}, 1 << 30);
