/**
 * Digilocker Credential Provider
 *
 * OAuth-based provider for fetching eAadhaar and other documents from DigiLocker.
 * Supports PKCE for secure authorization.
 */

import {
    BaseCredentialProvider,
    CredentialAttributes,
    ProviderConfig,
    SchemaDefinition,
    VerificationResult
} from '../CredentialProvider';

interface DigilockerConfig extends ProviderConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    baseUrl: string;
}

interface EaadhaarParsed {
    name?: string;
    dob?: string;
    gender?: string;
    maskedUid?: string;
    careOf?: string;
    address?: string;
    rawFields: Record<string, string | undefined>;
}

export class DigilockerProvider extends BaseCredentialProvider {
    readonly providerId = 'digilocker';
    readonly name = 'DigiLocker';
    readonly type = 'oauth' as const;

    protected config: DigilockerConfig = {
        clientId: '',
        clientSecret: '',
        redirectUri: '',
        baseUrl: 'https://digilocker.meripehchaan.gov.in/public'
    };

    async initialize(config: ProviderConfig): Promise<void> {
        this.config = {
            clientId: config.clientId || process.env.DIGILOCKER_CLIENT_ID || '',
            clientSecret: config.clientSecret || process.env.DIGILOCKER_CLIENT_SECRET || '',
            redirectUri: config.redirectUri || process.env.DIGILOCKER_REDIRECT_URI || '',
            baseUrl: (config.endpoints?.base as string) || process.env.DIGILOCKER_BASE_URL || 'https://digilocker.meripehchaan.gov.in/public'
        };
    }

    /**
     * Get OAuth authorization URL with state encoding csrf:oobId
     */
    getAuthorizationUrl(oobId: string, csrfToken: string, options?: Record<string, unknown>): string {
        if (!this.config.clientId) {
            throw new Error('Digilocker client ID not configured');
        }

        const state = this.encodeState(csrfToken, oobId);
        const scope = (options?.scope as string) || 'openid';

        const authUrl = new URL(`${this.config.baseUrl}/oauth2/1/authorize`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', this.config.clientId);
        authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('state', state);

        // PKCE support
        if (options?.codeChallenge) {
            authUrl.searchParams.set('code_challenge', options.codeChallenge as string);
            authUrl.searchParams.set('code_challenge_method', (options.codeChallengeMethod as string) || 'S256');
        }

        // Additional optional params
        if (options?.acr) {
            authUrl.searchParams.set('acr', options.acr as string);
        }
        if (options?.reqDoctype) {
            authUrl.searchParams.set('req_doctype', options.reqDoctype as string);
        }

        return authUrl.toString();
    }

    /**
     * Handle OAuth callback - exchange code for token and fetch user data
     */
    async handleCallback(code: string, state: string, codeVerifier?: string): Promise<VerificationResult> {
        try {
            const { csrfToken, oobId } = this.parseState(state);

            // Exchange code for token
            const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier);
            if (!tokenResponse.access_token) {
                return {
                    success: false,
                    error: tokenResponse.error_description || 'Token exchange failed'
                };
            }

            // Fetch user details
            const user = await this.fetchUserDetails(tokenResponse.access_token);

            // Fetch eAadhaar data
            const eaadhaar = await this.fetchEaadhaar(tokenResponse.access_token);

            // Determine credential type from available data
            const credentialType = this.detectCredentialType(eaadhaar, user);

            return {
                success: true,
                data: {
                    oobId,
                    csrfToken,
                    user,
                    eaadhaar,
                    accessToken: tokenResponse.access_token,
                    tokenResponse
                },
                credentialType
            };
        } catch (error: any) {
            console.error('[DigilockerProvider] handleCallback error:', error);
            return {
                success: false,
                error: error.message || 'Failed to handle Digilocker callback'
            };
        }
    }

    /**
     * Exchange authorization code for access token
     */
    private async exchangeCodeForToken(code: string, codeVerifier?: string): Promise<any> {
        const tokenPayload = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uri: this.config.redirectUri
        });

        if (codeVerifier) {
            tokenPayload.set('code_verifier', codeVerifier);
        }

        const tokenRes = await fetch(`${this.config.baseUrl}/oauth2/2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenPayload
        });

        return tokenRes.json().catch(async () => ({ raw: await tokenRes.text(), error: true }));
    }

    /**
     * Fetch user details from Digilocker
     */
    private async fetchUserDetails(accessToken: string): Promise<any> {
        const userRes = await fetch(`${this.config.baseUrl}/oauth2/1/user`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (userRes.ok) {
            return userRes.json();
        }
        const details = await userRes.text();
        return { error: details || 'Unable to fetch user details' };
    }

    /**
     * Fetch eAadhaar XML and parse it
     */
    private async fetchEaadhaar(accessToken: string): Promise<any> {
        const eaRes = await fetch(`${this.config.baseUrl}/oauth2/3/xml/eaadhaar`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const hmac = eaRes.headers.get('hmac') || eaRes.headers.get('x-digilocker-hmac');

        if (eaRes.ok) {
            const xml = await eaRes.text();
            const parsed = this.parseEaadhaarXml(xml);
            return {
                parsed,
                hmac,
                rawXml: xml
            };
        }

        const details = await eaRes.text();
        return { error: details || 'Unable to fetch eAadhaar XML', status: eaRes.status, hmac };
    }

    /**
     * Parse eAadhaar XML to extract fields
     */
    private parseEaadhaarXml(xml: string): EaadhaarParsed {
        const parseAttribute = (attr: string): string | undefined => {
            const match = xml.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
            return match ? match[1] : undefined;
        };

        const fields = [
            'name', 'dob', 'gender', 'uid', 'gname', 'co',
            'house', 'street', 'loc', 'vtc', 'subdist',
            'dist', 'state', 'pc', 'po', 'lm', 'country'
        ];

        const parsed: Record<string, string | undefined> = {};
        for (const f of fields) {
            parsed[f] = parseAttribute(f);
        }

        const addressParts = [
            parsed.house, parsed.street, parsed.loc, parsed.vtc,
            parsed.subdist, parsed.dist, parsed.state, parsed.pc
        ].filter(Boolean);

        return {
            name: parsed.name,
            dob: parsed.dob,
            gender: parsed.gender,
            maskedUid: parsed.uid,
            careOf: parsed.co || parsed.gname,
            address: addressParts.length ? addressParts.join(', ') : undefined,
            rawFields: parsed
        };
    }

    /**
     * Detect credential type from fetched data
     */
    private detectCredentialType(eaadhaar: any, user: any): string {
        // For now, if we have eaadhaar data, return 'aadhaar'
        if (eaadhaar?.parsed?.maskedUid) {
            return 'aadhaar';
        }
        // Default to aadhaar for Digilocker
        return 'aadhaar';
    }

    /**
     * Map provider data to AnonCreds attributes
     */
    mapToCredentialAttributes(data: Record<string, unknown>, credentialType: string): CredentialAttributes {
        const eaadhaar = data.eaadhaar as any;
        const user = data.user as any;

        switch (credentialType) {
            case 'aadhaar':
                return this.mapAadhaarAttributes(eaadhaar, user);
            case 'pan':
                return this.mapPanAttributes(data);
            case 'driving_license':
                return this.mapDrivingLicenseAttributes(data);
            default:
                // Generic mapping
                return {
                    name: eaadhaar?.parsed?.name || user?.name || '',
                    issuanceDate: new Date().toISOString()
                };
        }
    }

    private mapAadhaarAttributes(eaadhaar: any, user: any): CredentialAttributes {
        const parsed = eaadhaar?.parsed || {};
        return {
            name: parsed.name || user?.name || '',
            dob: parsed.dob || '',
            gender: parsed.gender || '',
            address: parsed.address || '',
            maskedAadhaar: parsed.maskedUid || '',
            careOf: parsed.careOf || '',
            district: parsed.rawFields?.dist || '',
            state: parsed.rawFields?.state || '',
            pincode: parsed.rawFields?.pc || '',
            issuanceDate: new Date().toISOString()
        };
    }

    private mapPanAttributes(data: Record<string, unknown>): CredentialAttributes {
        // PAN card mapping - to be implemented when Digilocker supports it
        return {
            name: '',
            panNumber: '',
            fatherName: '',
            dob: '',
            issuanceDate: new Date().toISOString()
        };
    }

    private mapDrivingLicenseAttributes(data: Record<string, unknown>): CredentialAttributes {
        // Driving license mapping - to be implemented
        return {
            name: '',
            licenseNumber: '',
            dob: '',
            validFrom: '',
            validTo: '',
            vehicleClass: '',
            issuanceDate: new Date().toISOString()
        };
    }

    /**
     * Get supported credential types
     */
    getSupportedCredentialTypes(): string[] {
        return ['aadhaar']; // Start with just Aadhaar, extend later
    }

    /**
     * Get AnonCreds schema definition for credential type
     */
    getSchemaDefinition(credentialType: string): SchemaDefinition {
        const schemas: Record<string, SchemaDefinition> = {
            aadhaar: {
                name: 'AadhaarCredential',
                version: '1.0',
                attributes: [
                    'name',
                    'dob',
                    'gender',
                    'address',
                    'maskedAadhaar',
                    'careOf',
                    'district',
                    'state',
                    'pincode',
                    'issuanceDate'
                ]
            },
            pan: {
                name: 'PANCredential',
                version: '1.0',
                attributes: ['name', 'panNumber', 'fatherName', 'dob', 'issuanceDate']
            },
            driving_license: {
                name: 'DrivingLicenseCredential',
                version: '1.0',
                attributes: ['name', 'licenseNumber', 'dob', 'validFrom', 'validTo', 'vehicleClass', 'issuanceDate']
            }
        };

        return schemas[credentialType] || {
            name: 'GenericCredential',
            version: '1.0',
            attributes: ['name', 'issuanceDate']
        };
    }
}
