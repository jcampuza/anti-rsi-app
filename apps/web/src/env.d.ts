/// <reference types="vite-plus/client" />

declare global {
  interface Window {
    api?: import('@antirsi/contracts').AntiRsiWindowApi;
  }
}

export {};
