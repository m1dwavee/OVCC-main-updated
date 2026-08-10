const https = require('https');

const VTC_ID = 87827;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  return new Promise((resolve) => {
    const reqApi = https.get(`https://api.truckersmp.com/v2/vtc/${VTC_ID}/partners`, {
      headers: {
        'User-Agent': 'TruckersMP-API-Client/1.0',
        'Accept': 'application/json'
      }
    }, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          res.status(200).json(json);
        } catch {
          res.status(200).json({ error: true, response: [] });
        }
        resolve();
      });
    });
    reqApi.on('error', () => {
      res.status(200).json({ error: true, response: [] });
      resolve();
    });
  });
};
