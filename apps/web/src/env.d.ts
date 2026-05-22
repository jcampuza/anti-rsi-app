/// <reference types="vite/client" />

declare global {
  interface Window {
    api?: import('@antirsi/contracts').AntiRsiWindowApi;
  }
}

export {};
