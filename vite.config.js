import { defineConfig } from 'vite';

export default defineConfig({
    base: '/LocalDePizza/',
    server: {
        host: '0.0.0.0',
        port: 3000,
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    },
});
