import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { type AntiRsiEvent, type AntiRsiSnapshot } from '@antirsi/core';
import { IPC_EVENTS, type MainEvent } from '@antirsi/contracts';

import { buildRendererUrl } from './renderer-runtime';

export { resolveResourcePath } from '../resource-path';

export const loadRenderer = (
  window: BrowserWindow,
  options?: { overlay?: boolean; route?: string },
): void => {
  const url = buildRendererUrl(options?.route);
  void window.loadURL(url);
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
