const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'generate.js'), 'utf8');

function createGenerator(fetch) {
    const files = new Map();
    const logs = [];
    const context = vm.createContext({
        require: () => ({ writeFileSync: (name, content) => files.set(name, content) }),
        module: { exports: {} },
        process: { env: { METRICS_TOKEN: 'test-token' } },
        console: { log: (message) => logs.push(message) },
        fetch,
        URL,
    });
    vm.runInContext(source, context);
    return { context, files, logs };
}

function response(status, body) {
    return { ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('an empty repository does not prevent later repositories from being counted', async () => {
    const requested = [];
    const generator = createGenerator(async (url) => {
        const endpoint = new URL(url).pathname;
        requested.push(endpoint);
        switch (endpoint) {
            case '/user/repos':
                return response(200, [{ full_name: 'Renakoni/empty' }, { full_name: 'Renakoni/active' }]);
            case '/repos/Renakoni/empty/languages':
                return response(200, {});
            case '/repos/Renakoni/empty/commits':
                return response(409, { message: 'Git Repository is empty.' });
            case '/repos/Renakoni/active/languages':
                return response(200, { JavaScript: 1234 });
            case '/repos/Renakoni/active/commits':
                return response(200, [{ sha: 'abc', commit: { author: { date: new Date().toISOString() } } }]);
            case '/repos/Renakoni/active/commits/abc':
                return response(200, { commit: { author: { date: new Date().toISOString() } }, stats: { additions: 42, deletions: 7 } });
            default:
                throw new Error(`Unexpected request: ${url}`);
        }
    });

    await vm.runInContext('generateTelemetry()', generator.context);

    assert.ok(requested.includes('/repos/Renakoni/active/commits/abc'));
    const svg = generator.files.get('lab-telemetry.svg');
    assert.match(svg, />\+42</);
    assert.match(svg, />-7</);
    assert.match(svg, /JavaScript 100\.0%/);
    assert.ok(generator.logs.some((line) => line.includes('Skipping empty repository')));
});

for (const [status, message, endpoint] of [
    [409, 'Repository access blocked', '/repos/Renakoni/active/commits'],
    [401, 'Bad credentials', '/repos/Renakoni/active/commits'],
    [403, 'API rate limit exceeded', '/repos/Renakoni/active/commits'],
    [409, 'Git Repository is empty.', '/repos/Renakoni/active/languages'],
]) {
    test(`${status} ${message} from ${endpoint} still fails`, async () => {
        const generator = createGenerator(async () => response(status, { message }));
        await assert.rejects(
            vm.runInContext(`fetchJson('https://api.github.com${endpoint}')`, generator.context),
            (error) => error.message.includes(`GitHub API ${status}`) && error.message.includes(message)
        );
        assert.equal(generator.files.size, 0);
    });
}
