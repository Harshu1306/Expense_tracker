import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.harshitha.spendwise',
  appName: 'SpendWise',
  webDir: 'out',
  server: {
    url: 'https://expensetracker-21fz.vercel.app',
    cleartext: false,
  },
};

export default config;