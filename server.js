// server.js — static file server + TruckersMP partners & events proxy
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT   = 8000;
const ROOT   = __dirname;
const VTC_ID = 87827;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webp': 'image/webp'
};

// Fetch a single TruckersMP API endpoint; resolves with parsed JSON or null
function fetchJSON(endpoint) {
  return new Promise((resolve) => {
    const url = `https://api.truckersmp.com/v2/${endpoint}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'TruckersMP-API-Client/1.0',
        'Accept': 'application/json'
      }
    }, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

// Merge hosted + attending events, deduplicate by id, sort by start_at
async function fetchMergedEvents() {
  const [hosted, attending] = await Promise.all([
    fetchJSON(`vtc/${VTC_ID}/events`),
    fetchJSON(`vtc/${VTC_ID}/events/attending`),
  ]);

  const seenIds  = new Set();
  const combined = [];

  for (const src of [hosted, attending]) {
    const list = src?.response;
    if (!Array.isArray(list)) continue;
    for (const ev of list) {
      if (ev.id == null || seenIds.has(ev.id)) continue;
      seenIds.add(ev.id);
      combined.push(ev);
    }
  }

  combined.sort((a, b) =>
    (a.start_at || '').localeCompare(b.start_at || '')
  );

  return { error: false, response: combined };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const urlPath   = parsedUrl.pathname;
  const eventId   = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('event_id');

  // ── Clean URL Redirects ──────────────────────────────────────────────────
  if (urlPath === '/index.html' || urlPath === '/index') {
    res.writeHead(301, { 'Location': '/' });
    res.end();
    return;
  }

  // ── /partners.php proxy ──────────────────────────────────────────────────
  if (urlPath === '/partners.php') {
    const data = await fetchJSON(`vtc/${VTC_ID}/partners`);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=1800'
    });
    res.end(JSON.stringify(data ?? { error: true, response: [] }));
    return;
  }

  // ── /events.php proxy ─────────────────────────────────────────────────────
  // Returns merged events list or single event if ?id= is specified
  if (urlPath === '/events.php') {
    try {
      if (eventId) {
        // Fetch specific event: GET /v2/events/{event_id} or GET /v2/vtc/{id}/events/{event_id}
        let eventData = await fetchJSON(`events/${eventId}`);
        if (!eventData?.response || eventData?.error) {
          eventData = await fetchJSON(`vtc/${VTC_ID}/events/${eventId}`);
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=900'
        });
        res.end(JSON.stringify(eventData ?? { error: true, response: null }));
      } else {
        const merged = await fetchMergedEvents();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=900'
        });
        res.end(JSON.stringify(merged));
      }
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: true, response: [] }));
    }
    return;
  }

  // ── /api/team endpoint (Discord API — reuses api/team.js) ─────────────────
  if (urlPath === '/api/team') {
    try {
      const teamHandler = require('./api/team');
      const mockReq = { query: {} };
      const mockRes = {
        _headers: {},
        _statusCode: 200,
        setHeader(k, v) { this._headers[k] = v; },
        status(code) { this._statusCode = code; return this; },
        json(data) {
          res.writeHead(this._statusCode, this._headers);
          res.end(JSON.stringify(data));
        }
      };
      await teamHandler(mockReq, mockRes);
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: true, response: [] }));
    }
    return;
  }

  // ── Static file serving (with clean URL fallback e.g. /event -> event.html) ──────
  let targetFile = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  let filePath = path.join(ROOT, targetFile);

  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    }
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      const page404 = path.join(ROOT, '404.html');
      if (fs.existsSync(page404)) {
        fs.readFile(page404, (err404, content404) => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(content404);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/html' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`✓ Orvion server running at http://localhost:${PORT}`);
  console.log(`  Proxying TruckersMP VTC ${VTC_ID} hosted + attending events`);
});
