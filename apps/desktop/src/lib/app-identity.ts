export const APP_PRODUCT_NAME = 'Anti RSI';
export const APP_DEV_NAME = 'Anti RSI (Dev)';
export const APP_BUNDLE_ID = 'com.antirsi.app';

export const getAppDisplayName = (isDevelopment: boolean): string => {
  return isDevelopment ? APP_DEV_NAME : APP_PRODUCT_NAME;
};
