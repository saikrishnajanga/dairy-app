// Shared utility functions

export const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

/** Safe localStorage write — returns false if storage is full */
export function safeLSWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error('localStorage write failed:', e);
    return false;
  }
}

/** Haptic tap feedback — uses Capacitor Haptics on native, no-op on web */
export async function hapticTap() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch { /* no-op on web */ }
}

