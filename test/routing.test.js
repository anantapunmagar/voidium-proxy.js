const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getDomainPrefix,
    matchTarget,
    normalizeHost,
    parsePortFromSuffix
} = require('../lib/routing');

test('normalizeHost strips ports, case, and trailing dots', () => {
    assert.equal(normalizeHost('Demo.Voidium.UK:443.'), 'demo.voidium.uk');
    assert.equal(normalizeHost('[::1]:1234'), '::1');
});

test('getDomainPrefix supports leading-dot public suffixes', () => {
    assert.equal(getDomainPrefix('demo.voidium.uk', '.voidium.uk'), 'demo');
    assert.equal(getDomainPrefix('p3000.voidium.uk', '.voidium.uk'), 'p3000');
    assert.equal(getDomainPrefix('voidium.uk', '.voidium.uk'), null);
});

test('getDomainPrefix supports bare domain suffixes', () => {
    assert.equal(getDomainPrefix('demo.voidium.uk', 'voidium.uk'), 'demo');
    assert.equal(getDomainPrefix('voidium.uk', 'voidium.uk'), '');
    assert.equal(getDomainPrefix('demo.example.net', 'voidium.uk'), null);
});

test('parsePortFromSuffix accepts only full numeric suffixes', () => {
    assert.equal(parsePortFromSuffix('-3000'), 3000);
    assert.equal(parsePortFromSuffix('_3000'), 3000);
    assert.equal(parsePortFromSuffix('3000abc'), null);
});

test('matchTarget preserves encoded-port hostname routing', () => {
    const targets = [
        { name: 'pyro', letter: 'p', host: '127.0.0.1' },
        { name: 'byto', host: '127.0.0.2' }
    ];

    assert.deepEqual(matchTarget('p3000', targets), {
        target: targets[0],
        port: 3000
    });
    assert.deepEqual(matchTarget('byto-4000', targets), {
        target: targets[1],
        port: 4000
    });
    assert.deepEqual(matchTarget('demo', targets), {
        error: 'Target not matched.'
    });
});
