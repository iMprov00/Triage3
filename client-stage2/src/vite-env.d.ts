/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STAGE1_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@rails/actioncable" {
  export function createConsumer(url?: string): {
    subscriptions: {
      create: (name: string, mixin: Record<string, unknown>) => { unsubscribe: () => void };
    };
    disconnect: () => void;
  };
}
