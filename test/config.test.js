const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { normalizeConfig } = require('../lib/config');

const source = path.join(process.cwd(), 'config.json');

test('normalizeConfig accepts legacy pyro target and custom subdomains', () => {
    const config = normalizeConfig({
        domaincut: '.voidium.uk',
        masterToken: 'secret',
        customSubdomainsDb: './custom-subdomains.json',
        pyro: {
            letter: 'p',
            host: '127.0.0.1',
            portStart: 3000,
            portEnd: 3999
        },
        customSubdomains: {
            demo: { target: 'pyro', port: 3000 }
        }
    }, source);

    assert.equal(config.targets.length, 1);
    assert.equal(config.targets[0].name, 'pyro');
    assert.equal(config.masterToken, 'secret');
    assert.equal(config.customSubdomains.demo.target, 'pyro');
    assert.equal(config.customSubdomains.demo.port, 3000);
    assert.equal(config.customSubdomainsDb, path.join(process.cwd(), 'custom-subdomains.json'));
});

test('normalizeConfig validates configured subdomain target and port range', () => {
    assert.throws(() => normalizeConfig({
        domaincut: '.voidium.uk',
        pyro: {
            host: '127.0.0.1',
            portStart: 3000,
            portEnd: 3001
        },
        customSubdomains: {
            demo: { target: 'pyro', port: 4000 }
        }
    }, source), /customSubdomains\.demo\.port/);

    assert.throws(() => normalizeConfig({
        domaincut: '.voidium.uk',
        pyro: {
            host: '127.0.0.1',
            portStart: 3000,
            portEnd: 3001
        },
        customSubdomains: {
            demo: { target: 'missing', port: 3000 }
        }
    }, source), /customSubdomains\.demo\.target/);
});

test('normalizeConfig reserves admin-facing hostnames', () => {
    assert.throws(() => normalizeConfig({
        domaincut: '.voidium.uk',
        pyro: {
            host: '127.0.0.1',
            portStart: 3000,
            portEnd: 3001
        },
        customSubdomains: {
            admin: { target: 'pyro', port: 3000 }
        }
    }, source), /Invalid custom subdomain/);
});
