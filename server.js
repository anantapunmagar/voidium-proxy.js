const http = require('http');
const net = require('net');
const express = require('express');
const { loadConfig, normalizeConfig } = require('./lib/config');
const { CustomSubdomainStore, validatePortForTarget } = require('./lib/custom-subdomains');
const { getDomainPrefix, matchTarget, normalizeHost } = require('./lib/routing');
const { log, maskHeaders } = require('./lib/logger');
const { parseCookies } = require('./lib/suspicion');
const { proxyRequest } = require('./lib/proxy');

const app = express();

const CONSENT_COOKIE = 'proxy_site_notice';
const CONSENT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

let requestCounter = 0;

const { config, source: configSource } = loadConfig();
const normalizedConfig = normalizeConfig(config, configSource);
const subdomainStore = new CustomSubdomainStore({
    filePath: normalizedConfig.customSubdomainsDb,
    configuredSubdomains: normalizedConfig.customSubdomains,
    targets: normalizedConfig.targets
});
const targetsByName = new Map(normalizedConfig.targets.map((target) => [target.name, target]));

function wantsJson(req) {
    return req.accepts(['json', 'text']) === 'json';
}

function sendAdminError(res, status, message) {
    return res.status(status).json({ error: message });
}

function requireAdmin(req, res, next) {
    if (!normalizedConfig.masterToken) {
        return sendAdminError(res, 503, 'Admin API disabled: masterToken is not configured.');
    }

    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== normalizedConfig.masterToken) {
        return sendAdminError(res, 401, 'Unauthorized.');
    }

    return next();
}

function resolveTarget(hostHeader) {
    const hostname = normalizeHost(hostHeader);
    const domainPrefix = getDomainPrefix(hostname, normalizedConfig.domaincut);
    if (domainPrefix === null) {
        return { error: `Host must end with ${normalizedConfig.domaincut}.` };
    }

    const customMapping = subdomainStore.get(domainPrefix);
    if (customMapping) {
        const target = targetsByName.get(customMapping.target);
        if (!target) return { error: 'Custom subdomain target not found.' };

        return {
            target,
            port: customMapping.port,
            subdomain: domainPrefix,
            routeType: 'custom-subdomain'
        };
    }

    const matched = matchTarget(domainPrefix, normalizedConfig.targets);
    if (matched.error) return matched;
    return { ...matched, routeType: 'encoded-port' };
}

const adminRouter = express.Router();

adminRouter.use(express.json({ limit: '32kb' }));

adminRouter.get('/subdomains', requireAdmin, (req, res) => {
    return res.json({
        domain: normalizedConfig.domaincut,
        subdomains: subdomainStore.list()
    });
});

adminRouter.post('/subdomains', requireAdmin, (req, res) => {
    const body = req.body || {};
    const subdomain = typeof body.subdomain === 'string'
        ? body.subdomain.toLowerCase().trim()
        : '';
    const targetName = typeof body.target === 'string' ? body.target : '';
    const port = Number(body.port);

    const result = subdomainStore.set(subdomain, targetName, port);
    if (result.error) return sendAdminError(res, 400, result.error);

    log('info', 'Custom subdomain saved', {
        subdomain: result.subdomain,
        target: result.target,
        port: result.port
    });
    return res.status(201).json(result);
});

adminRouter.delete('/subdomains/:subdomain', requireAdmin, (req, res) => {
    const result = subdomainStore.remove(req.params.subdomain);
    if (result.error) return sendAdminError(res, 400, result.error);
    if (!result.deleted) return sendAdminError(res, 404, 'Subdomain not found.');

    log('info', 'Custom subdomain deleted', { subdomain: req.params.subdomain });
    return res.status(204).end();
});

app.use('/__proxy-admin', adminRouter);

app.use(async (req, res) => {
    const reqId = ++requestCounter;
    const start = Date.now();

    log('info', 'Incoming request', {
        id: reqId,
        method: req.method,
        url: req.originalUrl,
        host: req.get('host'),
        ip: req.ip
    });
    log('debug', 'Request headers', { id: reqId, headers: maskHeaders(req.headers) });

    const match = resolveTarget(req.get('host'));
    if (match.error) {
        log('warn', 'Target error', { id: reqId, error: match.error, host: req.get('host') });
        if (wantsJson(req)) return res.status(404).json({ error: match.error });
        return res.status(404).type('text/plain').send(match.error);
    }

    const { target, port, routeType, subdomain } = match;
    const portError = validatePortForTarget(target, port);
    if (portError) {
        log('warn', 'Port out of range', { id: reqId, port, target: target.name, error: portError });
        if (wantsJson(req)) return res.status(400).json({ error: portError });
        return res.status(400).type('text/plain').send(portError);
    }

    log('info', 'Routing decision', {
        id: reqId,
        target: target.name,
        host: target.host,
        port,
        routeType,
        subdomain
    });

    if (req.path === '/__proxy-notice' && req.method === 'GET') {
        const nextParam = req.query?.next;
        const nextUrl = typeof nextParam === 'string' && nextParam.startsWith('/') ? nextParam : '/';
        log('info', 'Notice accepted', { id: reqId, target: target.name, next: nextUrl });
        res.cookie(CONSENT_COOKIE, '1', {
            maxAge: CONSENT_MAX_AGE,
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
        });
        return res.redirect(302, nextUrl);
    }

    const cookies = parseCookies(req.headers.cookie || '');
    const hasConsent = cookies[CONSENT_COOKIE] === '1';

    res.on('finish', () => {
        log('info', 'Response sent', { id: reqId, status: res.statusCode, ms: Date.now() - start });
    });

    const scheme = target.scheme || 'http';
    return await proxyRequest(
        `${scheme}://${target.host}:${port}${req.originalUrl}`,
        req,
        res,
        reqId,
        { target, hasConsent }
    );
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    const match = resolveTarget(req.headers.host);
    if (match.error) {
        log('warn', 'WebSocket target error', { error: match.error, host: req.headers.host });
        socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
    }

    const { target, port, routeType, subdomain } = match;
    const portError = validatePortForTarget(target, port);
    if (portError) {
        socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
    }

    log('info', 'WebSocket upgrade', {
        url: req.url,
        target: target.name,
        host: target.host,
        port,
        routeType,
        subdomain
    });

    const upstream = net.connect(port, target.host, () => {
        let reqHead = `${req.method} ${req.url} HTTP/1.1\r\n`;
        for (const [key, val] of Object.entries(req.headers)) {
            if (key.toLowerCase() === 'host') {
                reqHead += `host: ${target.host}:${port}\r\n`;
            } else {
                reqHead += `${key}: ${val}\r\n`;
            }
        }
        reqHead += '\r\n';
        upstream.write(reqHead);
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
    });

    upstream.on('error', (err) => {
        log('error', 'WebSocket upstream error', { error: String(err), target: target.name, port });
        try { socket.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'); } catch (_) {}
        socket.destroy();
    });

    socket.on('error', () => upstream.destroy());
});

const PORT = Number(process.env.PORT) || 1234;
server.listen(PORT, () => {
    log('info', `Proxy listening on port ${PORT} using ${configSource}`);
});
