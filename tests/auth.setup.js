import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate against staging', async ({ page }) => {
    // Only authenticate if we are running against staging
    if (!process.env.STAGING_URL) {
        console.log('No STAGING_URL provided, skipping authentication setup.');
        return;
    }

    console.log(`Authenticating against WordPress at: ${process.env.STAGING_URL}`);

    // Navigate to WordPress login page
    await page.goto(`${process.env.STAGING_URL}/wp-login.php`, { waitUntil: 'networkidle' });

    // Wait for the login form to be visible
    await page.waitForSelector('#wp-submit');

    // Fill in the credentials
    await page.locator('#user_login').fill(process.env.WP_USERNAME || '');
    await page.locator('#user_pass').fill(process.env.WP_PASSWORD || '');

    // Click the login button and wait for navigation
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }), // Wait for the redirect after login
        page.locator('#wp-submit').click(),
    ]);

    // Optionally, you can assert that you are on the dashboard to ensure login was successful
    // await expect(page).toHaveURL(/.*wp-admin.*/);

    console.log('Authentication successful. Saving session state...');

    // Save the authentication state (cookies, local storage) so other tests can reuse it
    await page.context().storageState({ path: authFile });
});
