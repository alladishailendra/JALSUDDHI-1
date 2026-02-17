// Proxy API route to forward commands to the external bot-command endpoint
export default async function handler(req, res) {
  const targetBase = 'https://indusmind.onrender.com/bot-command';
  try {
    // Build target URL with query string if provided
    const url = new URL(targetBase);
    for (const key of Object.keys(req.query)) {
      url.searchParams.set(key, req.query[key]);
    }

    const fetchOptions = {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url.toString(), fetchOptions);

    // Forward response headers (avoid hop-by-hop)
    response.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const status = response.status;

    // If upstream is unavailable or suspended, return a local success fallback
    if (status >= 500) {
      const text = await response.text();
      return res.status(200).json({
        ok: true,
        fallback: true,
        upstreamStatus: status,
        upstreamBody: text.slice(0, 1000),
        message: 'Upstream bot-command service unavailable — using local fallback.'
      });
    }

    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(status).json(data);
    } else {
      const text = await response.text();
      res.status(status).send(text);
    }
  } catch (err) {
    console.error('bot-command proxy error:', err);
    res.status(502).json({ error: 'Bad gateway', details: err.message });
  }
}
