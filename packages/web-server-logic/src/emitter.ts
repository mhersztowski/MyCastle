/**
 * Tiny typed event emitter — no dependency on minislib (keeps the browser
 * bundle free of the `mqtt` import minislib pulls in).
 */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<(arg: never) => void>>();

  on<K extends keyof Events>(event: K, handler: (arg: Events[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(handler as (arg: never) => void);
    return () => { this.handlers.get(event)?.delete(handler as (arg: never) => void); };
  }

  emit<K extends keyof Events>(event: K, arg: Events[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as (a: Events[K]) => void)(arg));
  }
}
