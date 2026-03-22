import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicediary.pro',
  appName: 'Dairy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
