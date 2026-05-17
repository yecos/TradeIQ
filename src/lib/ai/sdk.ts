/**
 * ZAI SDK Singleton — Avoids repeated ZAI.create() calls.
 * The SDK initialization is async and should be shared across all analysis modules.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSDK(): Promise<any> {
  if (sdkInstance) return sdkInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    sdkInstance = await ZAI.create();
    return sdkInstance;
  })();

  return initPromise;
}
