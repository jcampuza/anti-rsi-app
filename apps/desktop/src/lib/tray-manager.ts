import { Tray, nativeImage, Menu } from 'electron';
import { resolveResourcePath } from './window-utils';
import { APP_PRODUCT_NAME } from './app-identity';

export type TrayManagerCallbacks = {
  showOrCreateMainWindow: () => void;
  pauseMonitoring: () => void;
  resumeMonitoring: () => void;
};

export class TrayManager {
  private tray: Tray | null = null;

  constructor(private readonly callbacks: TrayManagerCallbacks) {
    const trayTemplateIconPath = resolveResourcePath('icon-menubarTemplate.png');
    const trayTemplateIcon = trayTemplateIconPath
      ? nativeImage.createFromPath(trayTemplateIconPath)
      : nativeImage.createEmpty();
    const fallbackTrayIconPath = resolveResourcePath('icon.png');
    const fallbackTrayIcon = fallbackTrayIconPath
      ? nativeImage.createFromPath(fallbackTrayIconPath)
      : nativeImage.createEmpty();
    const trayIcon = trayTemplateIcon.isEmpty() ? fallbackTrayIcon : trayTemplateIcon;

    if (!trayIcon.isEmpty()) {
      trayIcon.setTemplateImage(true);
    }

    const tray = new Tray(trayIcon);
    tray.setToolTip(APP_PRODUCT_NAME);
    tray.on('click', () => {
      callbacks.showOrCreateMainWindow();
    });

    const trayMenu = [
      {
        label: `Show ${APP_PRODUCT_NAME}`,
        click: () => {
          callbacks.showOrCreateMainWindow();
        },
      },
      { type: 'separator' as const },
      {
        label: 'Pause Monitoring',
        click: () => {
          callbacks.pauseMonitoring();
        },
      },
      {
        label: 'Resume Monitoring',
        click: () => {
          callbacks.resumeMonitoring();
        },
      },
      { type: 'separator' as const },
      {
        label: `Quit ${APP_PRODUCT_NAME}`,
        role: 'quit' as const,
      },
    ];

    tray.setContextMenu(Menu.buildFromTemplate(trayMenu));
    this.tray = tray;
  }

  dispose(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
