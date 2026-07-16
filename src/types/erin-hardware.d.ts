export {};

declare global {
  interface Window {
    erinHardware?: {
      state: () => Promise<{
        desktop: true;
        platform: string;
        appVersion: string;
        displayCount: number;
        rawEscPosConfigured: boolean;
        paymentTerminalConfigured: boolean;
        note: string;
      }>;
      printers: () => Promise<Array<{
        name: string;
        displayName?: string;
        description?: string;
        status?: number;
        isDefault?: boolean;
      }>>;
      openCustomerDisplay: () => Promise<{ ok: boolean; reused: boolean; displayCount: number; usingSecondary?: boolean }>;
    };
  }
}
