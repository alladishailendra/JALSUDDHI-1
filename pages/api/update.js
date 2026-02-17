// Proxy API route to forward requests to the external update server
export default async function handler(req, res) {
  const target = 'https://jalsuddhi-1.onrender.com/update';
  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    };

    const response = await fetch(target, fetchOptions);

    // Forward response headers
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers that Next may manage
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const status = response.status;

    // If upstream returns 404, provide a local fallback response so the site can continue
    if (status === 404) {
      const text = await response.text();
      return res.status(200).json({
        ok: true,
        fallback: true,
        upstreamStatus: status,
        upstreamBody: text.slice(0, 1000),
        message: 'Upstream update endpoint returned 404 — using local fallback.'
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
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Bad gateway', details: err.message });
  }
}
