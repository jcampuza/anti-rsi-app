export type Unsubscribe = () => void;

export class Emitter<T> {
  private readonly listeners = new Set<(payload: T) => void>();

  subscribe(listener: (payload: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(payload: T): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}
