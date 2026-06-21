const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CustomSubdomainStore, validatePortForTarget } = require('../lib/custom-subdomains');

const targets = [
    {
        name: 'pyro',
        host: '127.0.0.1',
        portStart: 3000,
        portEnd: 3999
    }
];

test('CustomSubdomainStore creates, persists, reloads, and deletes dynamic subdomains', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voidium-subdomains-'));
    const filePath = path.join(dir, 'subdomains.json');
    const store = new CustomSubdomainStore({
        filePath,
        configuredSubdomains: {},
        targets
    });

    const created = store.set('demo', 'pyro', 3000);
    assert.equal(created.subdomain, 'demo');
    assert.equal(created.target, 'pyro');
    assert.equal(created.port, 3000);
    assert.equal(store.get('demo').source, 'dynamic');

    const reloaded = new CustomSubdomainStore({
        filePath,
        configuredSubdomains: {},
        targets
    });
    assert.equal(reloaded.get('demo').port, 3000);
    assert.deepEqual(reloaded.remove('demo'), { deleted: true });
    assert.equal(reloaded.get('demo'), null);
});

test('configured subdomains override file-backed dynamic mappings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voidium-subdomains-'));
    const filePath = path.join(dir, 'subdomains.json');
    fs.writeFileSync(filePath, JSON.stringify({
        subdomains: {
            demo: { target: 'pyro', port: 3000 }
        }
    }));

    const store = new CustomSubdomainStore({
        filePath,
        configuredSubdomains: {
            demo: { target: 'pyro', port: 3001 }
        },
        targets
    });

    assert.equal(store.get('demo').source, 'config');
    assert.equal(store.get('demo').port, 3001);
    assert.equal(store.set('demo', 'pyro', 3000).error, 'That subdomain is managed by config.');
});

test('CustomSubdomainStore validates names, targets, and ports', () => {
    const store = new CustomSubdomainStore({
        filePath: null,
        configuredSubdomains: {},
        targets
    });

    assert.match(store.set('Bad.Name', 'pyro', 3000).error, /Subdomain/);
    assert.equal(store.set('admin', 'pyro', 3000).error, 'That subdomain is reserved.');
    assert.equal(store.set('demo', 'missing', 3000).error, 'Unknown target.');
    assert.equal(store.set('demo', 'pyro', 4000).error, 'Port must be at most 3999 for target pyro.');
});

test('validatePortForTarget handles missing ranges and basic port bounds', () => {
    assert.equal(validatePortForTarget({ name: 'open' }, 80), null);
    assert.equal(validatePortForTarget({ name: 'open' }, 0), 'Port must be an integer from 1 to 65535.');
    assert.equal(validatePortForTarget({ name: 'open' }, 65536), 'Port must be an integer from 1 to 65535.');
});
