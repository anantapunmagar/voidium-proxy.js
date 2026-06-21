const fs = require('fs');
const path = require('path');

const RESERVED_SUBDOMAINS = new Set([
    '__proxy-admin',
    '__proxy-notice',
    'admin',
    'api',
    'www'
]);

function isValidSubdomainName(value) {
    if (typeof value !== 'string') return false;
    if (value.length < 1 || value.length > 63) return false;
    if (value.startsWith('-') || value.endsWith('-')) return false;
    return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function loadConfig() {
    const candidates = ['config.json', 'eg.config.json'];
    for (const filename of candidates) {
        const fullPath = path.resolve(__dirname, '..', filename);
        if (fs.existsSync(fullPath)) {
            const raw = fs.readFileSync(fullPath, 'utf8');
            return { config: JSON.parse(raw), source: fullPath };
        }
    }
    throw new Error('Missing config.json (or eg.config.json).');
}

function normalizeConfig(config, source) {
    if (!config || typeof config !== 'object') {
        throw new Error(`Invalid config in ${source}.`);
    }
    if (typeof config.domaincut !== 'string' || config.domaincut.length === 0) {
        throw new Error(`Invalid domaincut in ${source}.`);
    }
    const targets = [];
    if (config.targets && typeof config.targets === 'object') {
        if (Array.isArray(config.targets)) {
            for (const entry of config.targets) {
                targets.push(entry);
            }
        } else {
            for (const [name, entry] of Object.entries(config.targets)) {
                targets.push({ name, ...entry });
            }
        }
    } else if (config.pyro && typeof config.pyro === 'object') {
        targets.push({ name: 'pyro', ...config.pyro });
    } else if (config.delta && typeof config.delta === 'object') {
        targets.push({ name: 'delta', ...config.delta });
    } else {
        throw new Error(`Missing targets config in ${source}.`);
    }

    for (const target of targets) {
        if (!target || typeof target !== 'object') {
            throw new Error(`Invalid target in ${source}.`);
        }
        if (typeof target.name !== 'string' || target.name.length === 0) {
            throw new Error(`Invalid target name in ${source}.`);
        }
        if (target.scheme !== undefined) {
            if (typeof target.scheme !== 'string' || !['http', 'https'].includes(target.scheme)) {
                throw new Error(`Invalid ${target.name}.scheme in ${source}.`);
            }
        }
        if (target.letter !== undefined) {
            if (typeof target.letter !== 'string' || target.letter.length !== 1) {
                throw new Error(`Invalid ${target.name}.letter in ${source}.`);
            }
        }
        if (typeof target.host !== 'string' || target.host.length === 0) {
            throw new Error(`Invalid ${target.name}.host in ${source}.`);
        }
        if (target.preserveHost !== undefined && typeof target.preserveHost !== 'boolean') {
            throw new Error(`Invalid ${target.name}.preserveHost in ${source}.`);
        }
        if (target.tlsInsecure !== undefined && typeof target.tlsInsecure !== 'boolean') {
            throw new Error(`Invalid ${target.name}.tlsInsecure in ${source}.`);
        }
        if (target.portStart !== undefined && !Number.isInteger(target.portStart)) {
            throw new Error(`Invalid ${target.name}.portStart in ${source}.`);
        }
        if (target.portEnd !== undefined && !Number.isInteger(target.portEnd)) {
            throw new Error(`Invalid ${target.name}.portEnd in ${source}.`);
        }
        if (Number.isInteger(target.portStart) && (target.portStart < 1 || target.portStart > 65535)) {
            throw new Error(`Invalid ${target.name}.portStart in ${source}.`);
        }
        if (Number.isInteger(target.portEnd) && (target.portEnd < 1 || target.portEnd > 65535)) {
            throw new Error(`Invalid ${target.name}.portEnd in ${source}.`);
        }
        if (Number.isInteger(target.portStart) && Number.isInteger(target.portEnd) && target.portStart > target.portEnd) {
            throw new Error(`Invalid ${target.name} port range in ${source}.`);
        }
    }

    const customSubdomains = {};
    const configuredSubdomains = config.customSubdomains || config.subdomains || {};
    if (configuredSubdomains !== undefined) {
        if (!configuredSubdomains || typeof configuredSubdomains !== 'object' || Array.isArray(configuredSubdomains)) {
            throw new Error(`Invalid customSubdomains in ${source}.`);
        }

        for (const [subdomain, entry] of Object.entries(configuredSubdomains)) {
            const name = subdomain.toLowerCase();
            if (!isValidSubdomainName(name) || RESERVED_SUBDOMAINS.has(name)) {
                throw new Error(`Invalid custom subdomain "${subdomain}" in ${source}.`);
            }
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new Error(`Invalid customSubdomains.${subdomain} in ${source}.`);
            }
            if (typeof entry.target !== 'string' || !targets.some((target) => target.name === entry.target)) {
                throw new Error(`Invalid customSubdomains.${subdomain}.target in ${source}.`);
            }
            if (!Number.isInteger(entry.port)) {
                throw new Error(`Invalid customSubdomains.${subdomain}.port in ${source}.`);
            }
            const target = targets.find((item) => item.name === entry.target);
            if (entry.port < 1 || entry.port > 65535) {
                throw new Error(`Invalid customSubdomains.${subdomain}.port in ${source}.`);
            }
            if (Number.isInteger(target.portStart) && entry.port < target.portStart) {
                throw new Error(`Invalid customSubdomains.${subdomain}.port in ${source}.`);
            }
            if (Number.isInteger(target.portEnd) && entry.port > target.portEnd) {
                throw new Error(`Invalid customSubdomains.${subdomain}.port in ${source}.`);
            }
            customSubdomains[name] = {
                target: entry.target,
                port: entry.port
            };
        }
    }

    const masterToken = typeof config.masterToken === 'string' ? config.masterToken : '';
    const customSubdomainsDb = typeof config.customSubdomainsDb === 'string' && config.customSubdomainsDb.trim()
        ? path.resolve(path.dirname(source), config.customSubdomainsDb)
        : null;

    return {
        domaincut: config.domaincut,
        targets,
        targetNames: new Set(targets.map((target) => target.name)),
        customSubdomains,
        customSubdomainsDb,
        masterToken
    };
}

module.exports = {
    RESERVED_SUBDOMAINS,
    isValidSubdomainName,
    loadConfig,
    normalizeConfig
};
