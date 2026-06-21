# voidium-proxy

A lightweight HTTP proxy that routes requests based on the host name, with per-target ports, custom `yourname.voidium.uk` subdomains, safety warnings for proxied pages, verbose structured logging, and a small admin API.

## How It Routes

The proxy looks at the incoming `Host` header, removes a configured suffix (`domaincut`), and then matches the remaining prefix to a target name (or a target letter). It then extracts a port from the remainder and proxies to the configured target host.

Example with `domaincut: ".voidium.uk"`:

- `p3000.voidium.uk` -> target `pyro` (letter `p`), port `3000`
- `pyro3001.voidium.uk` -> target `pyro` (name match), port `3001`
- `byto-4002.voidium.uk` -> target `byto`, port `4002`

If only one target exists, you can also use just a port:

- `3005.voidium.uk` -> target `pyro`, port `3005`

Custom subdomains are checked before encoded-port routing:

- `demo.voidium.uk` -> configured/admin-created alias, for example target `pyro`, port `3000`

## Config

Create `config.json` (or use `eg.config.json`). You can use `targets` (preferred) or `pyro`/`delta` (legacy single target).

### Multi-target (recommended)

```json
{
  "domaincut": ".voidium.uk",
  "masterToken": "change-me",
  "customSubdomainsDb": "./custom-subdomains.json",
  "targets": {
    "pyro": { "letter": "p", "host": "192.168.1.100", "portStart": 3000, "portEnd": 3999 },
    "byto": { "host": "192.168.1.101", "portStart": 4000, "portEnd": 4999 }
  },
  "customSubdomains": {
    "demo": { "target": "pyro", "port": 3000 }
  }
}
```

### Single target (legacy)

```json
{
  "domaincut": ".voidium.uk",
  "masterToken": "change-me",
  "customSubdomainsDb": "./custom-subdomains.json",
  "pyro": { "letter": "p", "host": "192.168.1.100", "portStart": 3000, "portEnd": 3999 },
  "customSubdomains": {
    "demo": { "target": "pyro", "port": 3000 }
  }
}
```

### Domain DNS

For public `name.voidium.uk` aliases, create a wildcard DNS record for `*.voidium.uk` pointing at the machine or load balancer running this proxy. The proxy itself only handles HTTP routing after the request reaches it.

## Custom Subdomains API

You can create custom subdomains like `yourdomainname.voidium.uk` that map to a specific target and port. Dynamic aliases are stored in `customSubdomainsDb` as JSON, while aliases in `customSubdomains` are managed by config and cannot be overwritten by the API.

Set `masterToken` to enable the API. Requests must include:

```
Authorization: Bearer <masterToken>
```

### Add or update a subdomain

```
POST /__proxy-admin/subdomains
Authorization: Bearer <masterToken>
Content-Type: application/json

{ "subdomain": "yourdomainname", "target": "pyro", "port": 3007 }
```

Then route traffic to:

```
http://yourdomainname.voidium.uk/
```

### List subdomains

```
GET /__proxy-admin/subdomains
Authorization: Bearer <masterToken>
```

### Remove a dynamic subdomain

```
DELETE /__proxy-admin/subdomains/yourdomainname
Authorization: Bearer <masterToken>
```

## Safety Warning

For browser HTML requests, the proxy serves a one-time notice page before forwarding traffic. It only triggers for **HTML GET/HEAD** responses, so scripts, styles, and assets are not affected.

Users can continue via a one-click consent page. The consent is stored in a cookie for 30 days.

## Logging

Structured logging is on by default. Control verbosity with `LOG_LEVEL`:

```
LOG_LEVEL=debug
```

## Improvements

- Host parsing is normalized before routing, including mixed case, trailing dots, and port suffixes.
- Proxied request bodies are not parsed by the admin API middleware.
- Port ranges are validated consistently for HTTP, WebSocket, config-defined aliases, and dynamic aliases.
- Legacy `pyro` and `delta` single-target configs are both supported.

## Timeouts

Upstream fetches are aborted after `UPSTREAM_TIMEOUT_MS` (default 30000ms). Set it like:

```
UPSTREAM_TIMEOUT_MS=5000
```

## Run

```
npm install
npm start
```

Override the port with:

```
PORT=8080 npm start
```

## Notes

- This proxy does not terminate TLS. Run it behind a TLS terminator (like nginx or Caddy) if you need HTTPS.
- The routing logic assumes the target port is embedded in the host name unless using a custom subdomain mapping.
