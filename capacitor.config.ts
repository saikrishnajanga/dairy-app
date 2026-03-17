import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicediary.pro',
  appName: 'VoiceDiary Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
