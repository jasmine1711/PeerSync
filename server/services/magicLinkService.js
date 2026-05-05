// services/magicLinkService.js
const crypto = require('crypto');
const { Resend } = require('resend');

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Store magic links temporarily (in production, use Redis)
const magicLinkStore = new Map();

// Clean up expired links every hour
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of magicLinkStore.entries()) {
        if (value.expiresAt < now) {
            magicLinkStore.delete(key);
        }
    }
}, 60 * 60 * 1000);

// Generate a secure magic link token
const generateMagicToken = (email, userId = null) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes expiry
    
    magicLinkStore.set(token, {
        email,
        userId,
        expiresAt,
        used: false,
        createdAt: new Date()
    });
    
    return token;
};

// Verify magic link token
const verifyMagicToken = (token) => {
    const record = magicLinkStore.get(token);
    
    if (!record) {
        return { valid: false, message: 'Invalid or expired magic link' };
    }
    
    if (record.used) {
        magicLinkStore.delete(token);
        return { valid: false, message: 'This magic link has already been used' };
    }
    
    if (Date.now() > record.expiresAt) {
        magicLinkStore.delete(token);
        return { valid: false, message: 'Magic link has expired. Please request a new one.' };
    }
    
    // Mark as used
    record.used = true;
    magicLinkStore.set(token, record);
    
    return { 
        valid: true, 
        email: record.email,
        userId: record.userId 
    };
};

// Send magic link via Resend (using @resend.dev test domain)
const sendMagicLinkEmail = async (email, magicToken, isLogin = true) => {
    const magicLink = `${process.env.FRONTEND_URL}/auth/callback?token=${magicToken}&type=${isLogin ? 'login' : 'register'}`;
    
    const subject = isLogin ? '🔐 Your PeerSync Login Link' : '✨ Welcome to PeerSync! Verify Your Email';
    
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 0;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    text-align: center;
                    padding: 30px 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 10px 10px 0 0;
                }
                .header h1 {
                    color: white;
                    margin: 0;
                    font-size: 28px;
                }
                .content {
                    background: #ffffff;
                    padding: 40px 30px;
                    border-radius: 0 0 10px 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .button {
                    display: inline-block;
                    padding: 12px 30px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                    font-weight: bold;
                }
                .button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                .footer {
                    text-align: center;
                    padding: 20px;
                    font-size: 12px;
                    color: #999;
                }
                .warning {
                    background: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 10px;
                    margin: 20px 0;
                    font-size: 14px;
                }
                .note {
                    background: #e7f3ff;
                    border-left: 4px solid #2196f3;
                    padding: 10px;
                    margin: 20px 0;
                    font-size: 12px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 PeerSync</h1>
                </div>
                <div class="content">
                    <h2>${isLogin ? 'Welcome Back!' : 'Welcome to PeerSync!'}</h2>
                    <p>${isLogin ? 'Click the button below to securely log in to your account.' : 'Thanks for signing up! Click the button below to verify your email and start collaborating.'}</p>
                    
                    <div style="text-align: center;">
                        <a href="${magicLink}" class="button">${isLogin ? '✨ Login to PeerSync' : '✅ Verify Email & Login'}</a>
                    </div>
                    
                    <p style="margin-top: 20px;">Or copy and paste this link into your browser:</p>
                    <p style="background: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">
                        ${magicLink}
                    </p>
                    
                    <div class="warning">
                        <strong>⚠️ This link will expire in 15 minutes.</strong><br>
                        If you didn't request this, please ignore this email.
                    </div>
                    
                    <div class="note">
                        <strong>📧 Email delivered via Resend</strong><br>
                        You're receiving this email because someone requested access to PeerSync.
                    </div>
                </div>
                <div class="footer">
                    <p>© 2026 PeerSync. All rights reserved.</p>
                    <p>Secure, real-time collaborative coding platform</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    try {
        console.log(`📧 Sending ${isLogin ? 'login' : 'verification'} email to: ${email}`);
        
        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: [email],
            subject: subject,
            html: htmlContent,
        });
        
        if (error) {
            console.error('Resend API error:', error);
            throw new Error(error.message);
        }
        
        console.log(`✅ Email sent successfully to ${email} (ID: ${data?.id})`);
        return { success: true, messageId: data?.id };
        
    } catch (error) {
        console.error('❌ Failed to send email:', error.message);
        throw error;
    }
};

module.exports = {
    generateMagicToken,
    verifyMagicToken,
    sendMagicLinkEmail
};