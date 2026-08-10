const https = require('https');

const VTC_ID = 87827;

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const eventId = req.query.id || req.query.event_id;
  if (eventId) {
    let eventData = await fetchJSON(`events/${eventId}`);
    if (!eventData?.response || eventData?.error) {
      eventData = await fetchJSON(`vtc/${VTC_ID}/events/${eventId}`);
    }
    return res.status(200).json(eventData ?? { error: true, response: null });
  }

  const [hosted, attending] = await Promise.all([
    fetchJSON(`vtc/${VTC_ID}/events`),
    fetchJSON(`vtc/${VTC_ID}/events/attending`)
  ]);

  const seenIds = new Set();
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

  combined.sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));
  return res.status(200).json({ error: false, response: combined });
};
