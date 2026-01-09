import { Router, Request, Response } from 'express';

const router = Router();

const DIGILOCKER_BASE_URL =
  process.env.DIGILOCKER_BASE_URL || 'https://digilocker.meripehchaan.gov.in/public';
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002'
const DIGILOCKER_REDIRECT_URI =
  process.env.DIGILOCKER_REDIRECT_URI || `${apiBaseUrl}/api/digilocker/callback`;
const DIGILOCKER_CLIENT_ID = process.env.DIGILOCKER_CLIENT_ID;
const DIGILOCKER_CLIENT_SECRET = process.env.DIGILOCKER_CLIENT_SECRET;

router.get('/authorize', (req: Request, res: Response) => {
  console.log('[digilocker] /authorize hit with query:', req.query);

  if (!DIGILOCKER_CLIENT_ID) {
    console.error('[digilocker] Missing DIGILOCKER_CLIENT_ID env');
    return res
      .status(500)
      .json({ success: false, message: 'DIGILOCKER_CLIENT_ID is not configured' });
  }

  const state = (req.query.state as string | undefined) || '';
  const scope = (req.query.scope as string | undefined) || 'openid';

  const authUrl = new URL(`${DIGILOCKER_BASE_URL}/oauth2/1/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', DIGILOCKER_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', DIGILOCKER_REDIRECT_URI);
  authUrl.searchParams.set('scope', scope);
  if (state) authUrl.searchParams.set('state', state);

  // Pass through optional PKCE inputs if provided by the caller
  const codeChallenge = req.query.code_challenge as string | undefined;
  const codeChallengeMethod = req.query.code_challenge_method as string | undefined;
  if (codeChallenge && codeChallengeMethod) {
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
  }

  console.log('[digilocker] Redirecting to authorize URL:', authUrl.toString());
  res.redirect(authUrl.toString());
});

function parseAttribute(xml: string, attr: string): string | undefined {
  const match = xml.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return match ? match[1] : undefined;
}

function parseEaadhaarXml(xml: string) {
  const fields = [
    'name',
    'dob',
    'gender',
    'uid',
    'gname',
    'co',
    'house',
    'street',
    'loc',
    'vtc',
    'subdist',
    'dist',
    'state',
    'pc',
    'po',
    'lm',
    'country',
  ];
  const parsed: Record<string, string | undefined> = {};
  for (const f of fields) {
    parsed[f] = parseAttribute(xml, f);
  }

  const addressParts = [
    parsed.house,
    parsed.street,
    parsed.loc,
    parsed.vtc,
    parsed.subdist,
    parsed.dist,
    parsed.state,
    parsed.pc,
  ].filter(Boolean);

  return {
    name: parsed.name,
    dob: parsed.dob,
    gender: parsed.gender,
    maskedUid: parsed.uid,
    careOf: parsed.co || parsed.gname,
    address: addressParts.length ? addressParts.join(', ') : undefined,
    rawFields: parsed,
  };
}

async function handleCallback(req: Request, res: Response) {
  try {
    console.log('[digilocker] /callback hit with query/body:', { query: req.query, body: req.body });
    const code =
      (req.query.code as string | undefined) ||
      (typeof req.body?.code === 'string' ? (req.body.code as string) : undefined);
    const state =
      (req.query.state as string | undefined) ||
      (typeof req.body?.state === 'string' ? (req.body.state as string) : undefined);
    const error =
      (req.query.error as string | undefined) ||
      (typeof req.body?.error === 'string' ? (req.body.error as string) : undefined);
    const error_description =
      (req.query.error_description as string | undefined) ||
      (typeof req.body?.error_description === 'string'
        ? (req.body.error_description as string)
        : undefined);

    if (error) {
      console.warn('[digilocker] Error returned from provider:', { error, error_description, state });
      return res.status(400).json({
        success: false,
        message: error_description || error,
        state,
      });
    }

    if (!code) {
      console.warn('[digilocker] Missing authorization code');
      return res.status(400).json({ success: false, message: 'Missing authorization code' });
    }

    if (!DIGILOCKER_CLIENT_ID || !DIGILOCKER_CLIENT_SECRET) {
      console.error('[digilocker] Missing client env vars');
      return res.status(500).json({
        success: false,
        message: 'DIGILOCKER_CLIENT_ID or DIGILOCKER_CLIENT_SECRET is not configured',
      });
    }

    const tokenPayload = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: DIGILOCKER_CLIENT_ID,
      client_secret: DIGILOCKER_CLIENT_SECRET,
      redirect_uri: DIGILOCKER_REDIRECT_URI,
    });

    // Optional PKCE support: accept code_verifier if caller set code_challenge in /authorize
    const codeVerifier =
      (req.query.code_verifier as string | undefined) ||
      (typeof req.body?.code_verifier === 'string' ? (req.body.code_verifier as string) : undefined);
    if (codeVerifier) {
      tokenPayload.set('code_verifier', codeVerifier);
    }

    console.log('[digilocker] Exchanging code for token at', `${DIGILOCKER_BASE_URL}/oauth2/2/token`);
    const tokenRes = await fetch(`${DIGILOCKER_BASE_URL}/oauth2/2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenPayload,
    });

    const tokenJson = await tokenRes.json().catch(async () => ({ raw: await tokenRes.text() }));
    if (!tokenRes.ok) {
      console.warn('[digilocker] Token exchange failed', {
        status: tokenRes.status,
        body: tokenJson,
      });
      return res.status(tokenRes.status).json({
        success: false,
        message: tokenJson?.error_description || 'Failed to exchange authorization code',
        error: tokenJson,
        state,
      });
    }

    console.log('[digilocker] Token exchange success; keys:', Object.keys(tokenJson || {}));
    const accessToken = tokenJson.access_token as string | undefined;
    let user = null;

    if (accessToken) {
      console.log('[digilocker] Fetching user details with access token');
      const userRes = await fetch(`${DIGILOCKER_BASE_URL}/oauth2/1/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (userRes.ok) {
        user = await userRes.json();
        console.log('[digilocker] User details fetched');
      } else {
        const details = await userRes.text();
        console.warn('[digilocker] Failed to fetch user details', { status: userRes.status, details });
        user = { error: details || 'Unable to fetch user details' };
      }
    }

    // Fetch eAadhaar XML (demographics/address) if access token is available
    let eaadhaar: any = null;
    if (accessToken) {
      console.log('[digilocker] Fetching eAadhaar XML');
      const eaRes = await fetch(`${DIGILOCKER_BASE_URL}/oauth2/3/xml/eaadhaar`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const hmac = eaRes.headers.get('hmac') || eaRes.headers.get('x-digilocker-hmac');

      if (eaRes.ok) {
        const xml = await eaRes.text();
        const parsed = parseEaadhaarXml(xml);
        eaadhaar = {
          parsed,
          hmac,
          rawXml: xml,
        };
        console.log('[digilocker] eAadhaar XML fetched and parsed');
      } else {
        const details = await eaRes.text();
        console.warn('[digilocker] Failed to fetch eAadhaar XML', { status: eaRes.status, details });
        eaadhaar = { error: details || 'Unable to fetch eAadhaar XML', status: eaRes.status, hmac };
      }
    }

    console.log('[digilocker] Callback success; returning token and user');
    return res.status(200).json({
      success: true,
      token: tokenJson,
      user,
      eaadhaar,
      state,
    });
  } catch (err: any) {
    console.error('[digilocker] Callback error:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Unexpected error handling DigiLocker callback',
    });
  }
}

router.get('/callback', handleCallback);
router.post('/callback', handleCallback);

export default router;
