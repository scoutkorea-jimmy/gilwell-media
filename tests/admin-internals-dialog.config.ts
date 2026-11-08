import base from './admin-reorganization.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, testMatch: 'admin-internals-dialog.spec.ts', outputDir: '../test-results/admin-internals-dialog' });
