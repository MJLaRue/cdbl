import { test, expect } from '@playwright/test';
import paths from '../data/paths.json';
import path from 'path';
import fs from 'fs';

// If testing staging, use the authenticated state
const authFile = path.join(__dirname, '../.auth/user.json');
const isStaging = process.env.TEST_ENV === 'staging';

if (isStaging && fs.existsSync(authFile)) {
    test.use({ storageState: authFile });
}

// Ensure the environment variables are set
const baseURL = isStaging ? process.env.STAGING_URL : process.env.PROD_URL;

if (!baseURL) {
    throw new Error(`Base URL is not defined for the current environment. 
    Make sure PROD_URL or STAGING_URL is set in your .env file.`);
}

test.describe('Visual Regression Tests', () => {

    paths.forEach((p) => {
        test(`Visual test for path: ${p}`, async ({ page }) => {

            const errors = [];
            const debugLogs = [];

            // Listen for unhandled exceptions on the page
            page.on('pageerror', (exception) => {
                errors.push(`Page Error: ${exception.message}`);
            });

            // Listen for console messages
            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    errors.push(`Console Error: ${msg.text()} (Location: ${msg.location().url})`);
                }
                if (msg.type() === 'debug' || msg.type() === 'trace') {
                    debugLogs.push(`Debug Log: ${msg.text()} (Location: ${msg.location().url})`);
                }
            });

            console.log(`Testing ${baseURL}${p}`);

            // Navigate to the full URL
            const response = await page.goto(`${baseURL}${p}`, { waitUntil: 'networkidle' });

            // Log failed network requests (like 404s or 500s) on the main document
            if (response && !response.ok()) {
                errors.push(`Failed to load page: ${response.status()} ${response.statusText()}`);
            }

            // Hide specific dynamic elements to prevent false positives (e.g., ad containers, animations)
            // await page.addStyleTag({ content: '.dynamic-ad { display: none !important; }' });

            // Allow some time for fonts/images to finish rendering
            await page.waitForTimeout(2000);

            // Fail the test if any console errors or debug messages were captured
            if (errors.length > 0 || debugLogs.length > 0) {
                let errorMessage = `Test failed due to terminal messages on ${p}:\n`;
                if (errors.length > 0) errorMessage += `\nErrors:\n- ${errors.join('\n- ')}`;
                if (debugLogs.length > 0) errorMessage += `\n\nDebug Logs:\n- ${debugLogs.join('\n- ')}`;

                throw new Error(errorMessage);
            }

            // Take a full page screenshot and compare it to the baseline
            // The suffix will be automatically appended by playwright (e.g. -chromium-darwin)
            await expect(page).toHaveScreenshot(`screenshot-${p.replace(/\//g, '_') || 'home'}.png`, {
                fullPage: true,
            });
        });
    });
});
