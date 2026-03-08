import { BrowserWindow } from 'electron';
import { join } from 'path';
import { type AntiRsiEvent, type AntiRsiSnapshot } from '@antirsi/core';
import { IPC_EVENTS, type MainEvent } from '@antirsi/contracts';

export { resolveResourcePath } from '../resource-path';

export const loadRenderer = (
  window: BrowserWindow,
  options?: { overlay?: boolean; route?: string },
): void => {
  if (process.env['VITE_DEV_SERVER_URL']) {
    const url = options?.route
      ? `${process.env['VITE_DEV_SERVER_URL']}#${options.route}`
      : process.env['VITE_DEV_SERVER_URL'];
    window.loadURL(url);
  } else {
    const hash = options?.route;
    window.loadFile(join(__dirname, '../../web/dist/index.html'), hash ? { hash } : undefined);
  }
};

export const getPreloadPath = (): string => {
  return join(__dirname, 'preload.js');
};

export const broadcastAntiRsiEvent = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot): void => {
  const payload: MainEvent = { type: 'antirsi', event, snapshot };
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_EVENTS.EVENT, payload);
  });
};
