/// <reference types="vite/client" />

declare module "@rails/actioncable" {
  export function createConsumer(url?: string): {
    subscriptions: {
      create: (name: string, mixin: Record<string, unknown>) => { unsubscribe: () => void };
    };
    disconnect: () => void;
  };
}
