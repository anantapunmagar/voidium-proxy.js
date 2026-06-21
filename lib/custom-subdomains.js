const fs = require('fs');
const path = require('path');
const { RESERVED_SUBDOMAINS, isValidSubdomainName } = require('./config');

function validatePortForTarget(target, port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return 'Port must be an integer from 1 to 65535.';
    }
    if (Number.isInteger(target.portStart) && port < target.portStart) {
        return `Port must be at least ${target.portStart} for target ${target.name}.`;
    }
    if (Number.isInteger(target.portEnd) && port > target.portEnd) {
        return `Port must be at most ${target.portEnd} for target ${target.name}.`;
    }
    return null;
}

function cloneMapping(mapping) {
    return {
        target: mapping.target,
        port: mapping.port,
        source: mapping.source,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt
    };
}

class CustomSubdomainStore {
    constructor({ filePath, configuredSubdomains, targets }) {
        this.filePath = filePath;
        this.configuredSubdomains = new Map();
        this.dynamicSubdomains = new Map();
        this.targets = new Map(targets.map((target) => [target.name, target]));

        for (const [name, mapping] of Object.entries(configuredSubdomains || {})) {
            this.configuredSubdomains.set(name, {
                target: mapping.target,
                port: mapping.port,
                source: 'config'
            });
        }

        this.load();
    }

    load() {
        if (!this.filePath || !fs.existsSync(this.filePath)) return;

        const raw = fs.readFileSync(this.filePath, 'utf8').trim();
        if (!raw) return;

        const data = JSON.parse(raw);
        const subdomains = data.subdomains && typeof data.subdomains === 'object'
            ? data.subdomains
            : data;

        for (const [name, mapping] of Object.entries(subdomains)) {
            if (!mapping || typeof mapping !== 'object') continue;
            const normalized = name.toLowerCase();
            const target = this.targets.get(mapping.target);
            if (!target) continue;
            if (this.validate(normalized, target.name, mapping.port, { allowConfigured: false })) continue;

            this.dynamicSubdomains.set(normalized, {
                target: target.name,
                port: mapping.port,
                source: 'dynamic',
                createdAt: mapping.createdAt,
                updatedAt: mapping.updatedAt
            });
        }
    }

    list() {
        const merged = new Map();
        for (const [name, mapping] of this.dynamicSubdomains.entries()) {
            merged.set(name, cloneMapping(mapping));
        }
        for (const [name, mapping] of this.configuredSubdomains.entries()) {
            merged.set(name, cloneMapping(mapping));
        }
        return Array.from(merged.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([subdomain, mapping]) => ({ subdomain, ...mapping }));
    }

    get(subdomain) {
        const name = String(subdomain || '').toLowerCase();
        const configured = this.configuredSubdomains.get(name);
        if (configured) return cloneMapping(configured);

        const dynamic = this.dynamicSubdomains.get(name);
        return dynamic ? cloneMapping(dynamic) : null;
    }

    validate(subdomain, targetName, port, options = {}) {
        const name = String(subdomain || '').toLowerCase();
        if (!isValidSubdomainName(name)) {
            return 'Subdomain must be 1-63 characters and contain only lowercase letters, numbers, and hyphens.';
        }
        if (RESERVED_SUBDOMAINS.has(name)) {
            return 'That subdomain is reserved.';
        }
        if (options.allowConfigured !== true && this.configuredSubdomains.has(name)) {
            return 'That subdomain is managed by config.';
        }

        const target = this.targets.get(targetName);
        if (!target) return 'Unknown target.';

        return validatePortForTarget(target, port);
    }

    set(subdomain, targetName, port) {
        const name = String(subdomain || '').toLowerCase();
        const error = this.validate(name, targetName, port);
        if (error) return { error };

        const now = new Date().toISOString();
        const existing = this.dynamicSubdomains.get(name);
        const mapping = {
            target: targetName,
            port,
            source: 'dynamic',
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };

        this.dynamicSubdomains.set(name, mapping);
        this.save();
        return { subdomain: name, ...cloneMapping(mapping) };
    }

    remove(subdomain) {
        const name = String(subdomain || '').toLowerCase();
        if (this.configuredSubdomains.has(name)) {
            return { error: 'That subdomain is managed by config.' };
        }

        const deleted = this.dynamicSubdomains.delete(name);
        if (deleted) this.save();
        return { deleted };
    }

    save() {
        if (!this.filePath) return;

        const dir = path.dirname(this.filePath);
        fs.mkdirSync(dir, { recursive: true });

        const subdomains = {};
        for (const [name, mapping] of this.dynamicSubdomains.entries()) {
            subdomains[name] = {
                target: mapping.target,
                port: mapping.port,
                createdAt: mapping.createdAt,
                updatedAt: mapping.updatedAt
            };
        }

        const tmpPath = `${this.filePath}.${process.pid}.tmp`;
        fs.writeFileSync(tmpPath, `${JSON.stringify({ subdomains }, null, 2)}\n`);
        fs.renameSync(tmpPath, this.filePath);
    }
}

module.exports = {
    CustomSubdomainStore,
    validatePortForTarget
};
