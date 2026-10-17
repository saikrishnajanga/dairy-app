import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicediary.pro',
  appName: 'Dairy',
  webDir: 'dist',
  server: {
    url: 'https://voicediary-pro.vercel.app',
    cleartext: true,
    androidScheme: 'https',
  },
};

export default config;
