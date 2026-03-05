const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Parse command line arguments
// Example usage: npm run crawl -- --url=https://example.com --depth=2 --limit=50
// Selector usage: npm run crawl -- --url=https://example.com --selector="nav.top-menu"
const args = process.argv.slice(2);
const params = {
    url: '',
    depth: 1,
    limit: 100,
    selector: null  // CSS selector to scope link extraction to a specific DOM element
};

args.forEach(arg => {
    if (arg.startsWith('--url=')) params.url = arg.split('=').slice(1).join('=');
    if (arg.startsWith('--depth=')) params.depth = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--limit=')) params.limit = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--selector=')) params.selector = arg.split('=').slice(1).join('=');
});

if (!params.url) {
    params.url = process.env.PROD_URL || process.env.STAGING_URL;
    if (!params.url) {
        console.error('Please provide a URL: npm run crawl -- --url=https://example.com');
        process.exit(1);
    }
}

const normalizeUrl = (u, base) => {
    try {
        const parsed = new URL(u, base);
        parsed.hash = ''; // Remove fragments
        return parsed.href;
    } catch (e) {
        return null;
    }
};

const getPath = (u) => {
    try {
        const parsed = new URL(u);
        return parsed.pathname + parsed.search;
    } catch (e) {
        return u; // fallback
    }
};

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const visited = new Set();
    const queue = [{ url: params.url, currentDepth: 0 }];
    const allPaths = new Set();

    let baseUrlObj;
    try {
        baseUrlObj = new URL(params.url);
    } catch (e) {
        console.error('Invalid base URL provided:', params.url);
        process.exit(1);
    }

    if (params.selector) {
        console.log(`Starting crawl at ${params.url} (Depth: ${params.depth}, Limit: ${params.limit}, Selector: "${params.selector}")`);
    } else {
        console.log(`Starting crawl at ${params.url} (Depth: ${params.depth}, Limit: ${params.limit})`);
    }

    while (queue.length > 0 && allPaths.size < params.limit) {
        const { url, currentDepth } = queue.shift();

        if (visited.has(url)) continue;
        visited.add(url);

        try {
            console.log(`Crawling: ${url} (Depth: ${currentDepth})`);

            // Go to the URL
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Add path if it's successful
            if (response && response.ok() && response.headers()['content-type']?.includes('text/html')) {
                const pathStr = getPath(url);
                allPaths.add(pathStr);
            } else if (response && response.ok()) {
                // Also add it if it's missing content-type but ok, just in case
                const pathStr = getPath(url);
                allPaths.add(pathStr);
            }

            // Find links — optionally scoped to a CSS selector
            if (params.selector) {
                // Selector mode: extract links only from within the matching element
                const { links, found } = await page.evaluate((selector) => {
                    const container = document.querySelector(selector);
                    if (!container) return { links: [], found: false };
                    return {
                        links: Array.from(container.querySelectorAll('a'))
                            .map(a => a.href)
                            .filter(href => href && href.startsWith('http')),
                        found: true
                    };
                }, params.selector);

                if (!found) {
                    console.warn(`  ⚠ Selector "${params.selector}" not found on ${url}`);
                } else {
                    console.log(`  Found ${links.length} link(s) inside "${params.selector}"`);
                    for (const link of links) {
                        const normalized = normalizeUrl(link, url);
                        if (normalized && normalized.startsWith(baseUrlObj.origin) && !visited.has(normalized)) {
                            // In selector mode, add matched links directly to allPaths without re-crawling
                            const pathStr = getPath(normalized);
                            allPaths.add(pathStr);
                        }
                    }
                }
            } else if (currentDepth < params.depth) {
                // Standard mode: recursively follow all links on the page
                const links = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('a'))
                        .map(a => a.href)
                        .filter(href => href && href.startsWith('http'));
                });

                for (const link of links) {
                    const normalized = normalizeUrl(link, url);
                    if (normalized && normalized.startsWith(baseUrlObj.origin) && !visited.has(normalized)) {
                        queue.push({ url: normalized, currentDepth: currentDepth + 1 });
                    }
                }
            }
        } catch (err) {
            console.error(`Failed to crawl ${url}: ${err.message}`);
        }
    }

    await browser.close();

    const pathsArray = Array.from(allPaths);
    pathsArray.sort(); // Sort cleanly

    const outputPath = path.join(__dirname, '../data/paths.json');

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(pathsArray, null, 2));
    console.log(`\nCrawling complete. Found ${pathsArray.length} paths.`);
    console.log(`Saved to ${outputPath}`);
})();
