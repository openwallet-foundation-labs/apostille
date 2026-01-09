import { Router, Request, Response } from 'express';
import { createTenant } from '../services/agentService';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createUser, getUserByEmail } from '../db/quries';
import * as EmailValidator from 'email-validator';
import { jwtConfig, cookieConfig } from '../config/jwt';

const router = Router();

/**
 * Generate access token (short-lived, for API requests)
 */
const generateAccessToken = (payload: { email: string; tenantId: string }) => {
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.accessTokenExpiresIn });
};

/**
 * Generate refresh token (long-lived, stored in httpOnly cookie)
 */
const generateRefreshToken = (payload: { email: string; tenantId: string }) => {
  return jwt.sign(payload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshTokenExpiresIn });
};

/**
 * Set refresh token as httpOnly cookie
 */
const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
  res.cookie('refreshToken', refreshToken, cookieConfig);
};

/**
 * Clear refresh token cookie
 */
const clearRefreshTokenCookie = (res: Response) => {
  res.cookie('refreshToken', '', {
    ...cookieConfig,
    maxAge: 0,
  });
};

// In-memory user store (should be replaced with database in production)
// Format: { email: string, password: string, tenantId: string }
// const users = new Map();

/**
 * Register a new tenant with email and password
 */
router.route('/register')
  .post(async (req: Request, res: Response) => {
    try {
      console.log('Received tenant registration request');
      const { label, email, password } = req.body;

      if (!label) {
        res.status(400).json({
          success: false,
          message: 'Tenant label is required'
        });
        return;
      }

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
        return;
      }
      
      if (!EmailValidator.validate(email)){
        res.status(400).json({
          success: false,
          message: 'Please Enter a valid Email!'
        });
        return;
      }

      // Check if email already exists
      const user =await getUserByEmail({email})
      if (user!==null) {
        res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
        return;
      }

      console.log(`Processing tenant registration for label: ${label}`);

      try {
        // Create tenant
        const tenantRecord = await createTenant({ label });
        console.log(`Created new tenant with ID: ${tenantRecord.id}`);
        
        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Store user credentials
        // users.set(email, {
        //   email,
        //   password: hashedPassword,
        //   tenantId: tenantRecord.id
        // });

        await createUser({email,password:hashedPassword,tenant_id:tenantRecord.id })

        const tokenPayload = { email, tenantId: tenantRecord.id };

        // Generate short-lived access token
        const accessToken = generateAccessToken(tokenPayload);

        // Generate long-lived refresh token and set as httpOnly cookie
        const refreshToken = generateRefreshToken(tokenPayload);
        setRefreshTokenCookie(res, refreshToken);

        res.status(201).json({
          success: true,
          message: 'Tenant registration successful',
          tenantId: tenantRecord.id,
          label: tenantRecord.config.label,
          email,
          accessToken,
          // Legacy support
          token: accessToken,
        });
      } catch (error: any) {
        console.error('Tenant registration error:', error);
        
        res.status(500).json({
          success: false,
          message: `Tenant registration error: ${error.message || 'Unknown error'}`
        });
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during tenant registration: ' + (error.message || 'Unknown error')
      });
    }
  });

/**
 * Login with email and password
 *
 * Security: Returns short-lived access token in response body,
 * sets long-lived refresh token as httpOnly cookie (XSS protection)
 */
router.route('/login')
  .post(async (req: Request, res: Response) => {
    try {
      console.log('Received login request');
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
        return;
      }

      // Check if user exists
      const user = await getUserByEmail({email})
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
        return;
      }

      // Compare password
      const passwordMatch = await bcrypt.compare(password, user.password as string);
      if (!passwordMatch) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
        return;
      }

      const tenantId = user.tenant_id as string;
      console.log(`Login successful for tenant ID: ${tenantId}`);

      const tokenPayload = { email, tenantId };

      // Generate short-lived access token (returned in response body)
      const accessToken = generateAccessToken(tokenPayload);

      // Generate long-lived refresh token (stored in httpOnly cookie)
      const refreshToken = generateRefreshToken(tokenPayload);

      // Set refresh token as httpOnly cookie (XSS protection)
      setRefreshTokenCookie(res, refreshToken);
      console.log('[Auth] Login: Set refreshToken cookie for', email);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        tenantId,
        email,
        accessToken,
        // Legacy support - will be removed after frontend migration
        token: accessToken,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during login: ' + (error.message || 'Unknown error')
      });
    }
  });

/**
 * Verify JWT token
 */
router.route('/verify')
  .get(async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      
      if (!token) {
        res.status(401).json({
          success: false,
          message: 'No token provided'
        });
        return;
      }

      try {
        const decoded = jwt.verify(token, jwtConfig.secret) as { email: string, tenantId: string };
        
        console.log(194,decoded)

        res.status(200).json({
          success: true,
          message: 'Token is valid',
          email: decoded.email,
          tenantId: decoded.tenantId
        });
      } catch (error) {
        res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
        return;
      }
    } catch (error: any) {
      console.error('Token verification error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during token verification'
      });
    }
  });


/**
 * Refresh access token using httpOnly cookie
 *
 * Security: Reads refresh token from httpOnly cookie (not accessible via JavaScript),
 * validates it, and returns a new short-lived access token
 */
router.route('/refresh')
  .post(async (req: Request, res: Response) => {
    try {
      // Get refresh token from httpOnly cookie
      const refreshToken = req.cookies?.refreshToken;

      console.log('[Auth] Refresh request received');
      console.log('[Auth] Cookies:', Object.keys(req.cookies || {}));
      console.log('[Auth] Has refreshToken cookie:', !!refreshToken);

      if (!refreshToken) {
        console.log('[Auth] No refresh token in cookies');
        res.status(401).json({
          success: false,
          message: 'No refresh token provided'
        });
        return;
      }

      try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret) as {
          email: string;
          tenantId: string;
        };

        // Verify user still exists
        const user = await getUserByEmail({ email: decoded.email });
        if (!user) {
          clearRefreshTokenCookie(res);
          res.status(401).json({
            success: false,
            message: 'User not found'
          });
          return;
        }

        const tokenPayload = { email: decoded.email, tenantId: decoded.tenantId };

        // Generate new access token
        const accessToken = generateAccessToken(tokenPayload);

        // Optionally rotate refresh token for extra security
        const newRefreshToken = generateRefreshToken(tokenPayload);
        setRefreshTokenCookie(res, newRefreshToken);

        res.status(200).json({
          success: true,
          message: 'Token refreshed',
          accessToken,
          email: decoded.email,
          tenantId: decoded.tenantId,
          // Legacy support
          token: accessToken,
        });
      } catch (error) {
        // Clear invalid refresh token
        clearRefreshTokenCookie(res);
        res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token'
        });
        return;
      }
    } catch (error: any) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during token refresh'
      });
    }
  });

/**
 * Logout - clear refresh token cookie
 *
 * Security: Clears the httpOnly refresh token cookie
 */
router.route('/logout')
  .post(async (req: Request, res: Response) => {
    try {
      // Clear refresh token cookie
      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during logout'
      });
    }
  });

router.route('/bwn/callback').get(async (req:Request, res:Response)=>{
  try {
    console.log('RECIEVED THIS REQUEST FROM BWN SERVER')

    const queries = new URLSearchParams(req.url)
      const code = queries.get('authorization_code')
      // TODO: STORE THE THIS CODE INSIDE THE BROWSER COOKIES BY THE NAME 'bwn.session_id' 
      console.log(9, code)

      if(!code){
          // return NextResponse.json({message:'authorization_code is not provided'})
          res.json({message:'authorization_code is not provided'}).status(400)
          return
      }

        // const code = authorization_code;
        // console.log(91,code)
        // if(!code) {
        //   return res.status(400).
        // }
        // TODO: GET THE TOKEN BY SENDING authorization_code
        const response = await fetch(`${process.env.BWN_API_ENDPOINT}/google-apis-url/oauth2/v4/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code, // this is the code you got from the login step
            })
        });

        // console.log(response.ok)
        if(response.ok){
            const {access_token,token_type} = await response.json()
    
            console.log(access_token,token_type)

            const userInfo = await fetch(`${process.env.BWN_API_ENDPOINT}/google-apis-url/oauth2/v1/userinfo`,{
                method:'GET',
                headers:{
                    'Authorization':`${token_type} ${access_token}`
                }
            })

            if(userInfo.ok){

                const data = await userInfo.json()

                console.log(data,43)

                const checkExistingUser = await getUserByEmail({email:data.email})

                let tenant_id = checkExistingUser?.tenant_id as string | undefined
                let label:null | string = null

                console.log(checkExistingUser,275)

                if(checkExistingUser==null){
                    // CREATE A NEW USER USING THE ABOVE INFORMATION
                    const tenantRecord = await createTenant({ label:`${data.first_name} ${data.last_name}` });

                    tenant_id = tenantRecord.id
                    label = tenantRecord.config.label
                    console.log(`Created new tenant with ID: ${tenantRecord.id}`);

                    await createUser({email:data.email,tenant_id:tenantRecord.id })
                  }

                  // Generate JWT token
                  const token = jwt.sign(
                    {
                      email:data.email,
                      tenantId: tenant_id
                    },
                    jwtConfig.secret,
                    { expiresIn: jwtConfig.expiresIn }
                  );

                  // res.status(201).json({
                  //   success: true,
                  //   message: 'Tenant registration successful',
                  //   tenantId: tenant_id,
                  //   label: label,
                  //   token
                  // }).cookie('token',token).cookie('bwn.session_id',code);

                  // Determine frontend URL from environment variable
                  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

                  res.cookie('token',token).cookie('bwn.session_id',code).redirect(frontendUrl)

                  return
            }

            const text = await userInfo.text()

            res.status(400).json({
              success:false,
              message:text
            })
            return
        }

        const text = await response.text()

        res.status(400).json({
          success:false,
          message:text,
        })
        return

  } catch (error:any) {
    console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during login: ' + (error.message || 'Unknown error')
      });
  }
})

export default router; 