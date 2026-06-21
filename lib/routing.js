function normalizeHost(hostHeader) {
    if (!hostHeader) return '';

    const raw = String(hostHeader).trim().toLowerCase().replace(/\.$/, '');
    if (!raw) return '';

    try {
        return new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1');
    } catch {
        if (raw.startsWith('[')) {
            const close = raw.indexOf(']');
            return close === -1 ? raw : raw.slice(1, close);
        }
        return raw.split(':')[0].replace(/\.$/, '');
    }
}

function normalizeDomaincut(domaincut) {
    return String(domaincut || '').trim().toLowerCase().replace(/\.$/, '').replace(/:$/, '');
}

function getDomainPrefix(hostname, domaincut) {
    const host = normalizeHost(hostname);
    const suffix = normalizeDomaincut(domaincut);

    if (!host || !suffix) return null;

    if (suffix.startsWith('.')) {
        if (!host.endsWith(suffix)) return null;
        return host.slice(0, -suffix.length);
    }

    if (host === suffix) return '';

    const dottedSuffix = `.${suffix}`;
    if (!host.endsWith(dottedSuffix)) return null;
    return host.slice(0, -dottedSuffix.length);
}

function parsePortFromSuffix(suffix) {
    if (!suffix) return null;
    const trimmed = suffix.replace(/^[-_.]/, '');
    const port = parseInt(trimmed, 10);
    if (Number.isNaN(port)) return null;
    if (!/^\d+$/.test(String(trimmed))) return null;
    return port;
}

function matchTarget(domaincut, targets) {
    if (!domaincut) {
        return { error: 'No target specified.' };
    }

    for (const target of targets) {
        if (target.letter && domaincut.startsWith(target.letter)) {
            const port = parsePortFromSuffix(domaincut.slice(1));
            if (port !== null) {
                return { target, port };
            }
        }
        if (domaincut.startsWith(target.name)) {
            const port = parsePortFromSuffix(domaincut.slice(target.name.length));
            if (port !== null) {
                return { target, port };
            }
        }
    }

    if (targets.length === 1) {
        const target = targets[0];
        const port = parsePortFromSuffix(domaincut);
        if (port !== null) {
            return { target, port };
        }
    }

    return { error: 'Target not matched.' };
}

module.exports = {
    normalizeHost,
    normalizeDomaincut,
    getDomainPrefix,
    parsePortFromSuffix,
    matchTarget
};
