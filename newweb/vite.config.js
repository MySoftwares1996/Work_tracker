import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The Report tab shares the phone app's report engine (../src/workingDashboardReport.js and friends); the one thing those files
// import that a website lacks is React Native's AsyncStorage, which is replaced by an empty stand-in.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@react-native-async-storage/async-storage': fileURLToPath(new URL('./src/stubs/asyncStorage.js', import.meta.url)) } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', sourcemap: false },
});
