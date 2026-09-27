function getCookie(header, name) {
  const match = (header || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function sessionCookie(value, maxAge) {
  return `tarotai_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const configured = Boolean(process.env.TAROTAI_ACCESS_CODE);

  if (req.method === 'GET') {
    return res.status(200).json({
      configured,
      authenticated: !configured || getCookie(req.headers.cookie, 'tarotai_session') === 'authorized'
    });
  }

  if (req.method === 'POST') {
    const code = req.body && typeof req.body === 'object' ? req.body.code : undefined;
    if (!configured) return res.status(200).json({ authenticated: true, configured: false });
    if (code !== process.env.TAROTAI_ACCESS_CODE) return res.status(401).json({ error: 'Invalid access code' });
    res.setHeader('Set-Cookie', sessionCookie('authorized', 60 * 60 * 24 * 30));
    return res.status(200).json({ authenticated: true, configured: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return res.status(200).json({ authenticated: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
