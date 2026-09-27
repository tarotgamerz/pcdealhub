import { serialize, parse } from 'cookie';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const configured = Boolean(process.env.TAROTAI_ACCESS_CODE);

  if (req.method === 'GET') {
    const cookies = parse(req.headers.cookie || '');
    return res.status(200).json({
      configured,
      authenticated: !configured || cookies.tarotai_session === 'authorized'
    });
  }

  if (req.method === 'POST') {
    const { code } = typeof req.body === 'object' ? req.body : {};
    if (!configured) {
      return res.status(200).json({ authenticated: true, configured: false });
    }
    if (code !== process.env.TAROTAI_ACCESS_CODE) {
      return res.status(401).json({ error: 'Invalid access code' });
    }
    res.setHeader('Set-Cookie', serialize('tarotai_session', 'authorized', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    }));
    return res.status(200).json({ authenticated: true, configured: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', serialize('tarotai_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    }));
    return res.status(200).json({ authenticated: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
