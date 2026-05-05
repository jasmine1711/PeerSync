const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const { generateMagicToken, verifyMagicToken, sendMagicLinkEmail } = require('../services/magicLinkService');

const router = express.Router();

// ============ PASSWORD-BASED AUTHENTICATION ============

// REGISTER WITH PASSWORD
router.post('/register-password', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ 
                message: existingUser.email === email ? 'Email already registered' : 'Username already taken' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Create user (automatically verified for password registration)
        const newUser = await User.create({ 
            username, 
            email, 
            passwordHash,
            isVerified: true,  // Auto-verified for password registration
            verifiedAt: new Date(),
            createdAt: new Date()
        });
        
        // Generate JWT token
        const token = jwt.sign(
            { id: newUser._id, email: newUser.email, username: newUser.username }, 
            process.env.JWT_SECRET || 'your_super_secret_key_change_this',
            { expiresIn: '7d' }
        );
        
        // Generate refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');
        newUser.refreshToken = refreshToken;
        await newUser.save();
        
        res.status(201).json({ 
            success: true,
            message: 'Registration successful!',
            token,
            refreshToken,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email
            }
        });
        
    } catch (err) {
        console.error('Password registration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// LOGIN WITH PASSWORD
router.post('/login-password', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('Password login attempt for email:', email);
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        
        // Find user by email
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        
        // Check if password matches
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        
        // Check if email is verified (for existing magic link users who want to add password)
        if (!user.isVerified) {
            return res.status(401).json({ 
                message: 'Please verify your email first. Check your inbox for verification link.',
                needsVerification: true,
                email: user.email
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email, username: user.username }, 
            process.env.JWT_SECRET || 'your_super_secret_key_change_this',
            { expiresIn: '7d' }
        );
        
        // Generate refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');
        user.refreshToken = refreshToken;
        user.lastLogin = new Date();
        await user.save();
        
        res.json({ 
            success: true,
            message: 'Login successful!',
            token,
            refreshToken,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });
        
    } catch (err) {
        console.error('Password login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ MAGIC LINK AUTHENTICATION (Original) ============

// REGISTER - Send magic link for verification
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ 
                message: existingUser.email === email ? 'Email already registered' : 'Username already taken' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Create temporary user (not verified yet)
        const newUser = await User.create({ 
            username, 
            email, 
            passwordHash,
            isVerified: false,
            createdAt: new Date()
        });
        
        // Generate magic link token
        const magicToken = generateMagicToken(email, newUser._id);
        
        // Send magic link email
        await sendMagicLinkEmail(email, magicToken, false);
        
        res.status(201).json({ 
            success: true,
            message: 'Verification email sent! Please check your inbox to verify your email.',
            userId: newUser._id,
            email: email,
            requiresVerification: true
        });
        
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// LOGIN - Send magic link (passwordless)
router.post('/login', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('Magic link login attempt for email:', email);
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        const user = await User.findOne({ email });
        
        // For security, don't reveal if user exists
        if (!user) {
            console.log('User not found:', email);
            return res.status(200).json({ 
                message: 'If an account exists with this email, you will receive a login link.',
                emailSent: true
            });
        }
        
        console.log('User found:', user.email, 'Verified:', user.isVerified);
        
        // Check if email is verified
        if (!user.isVerified) {
            return res.status(401).json({ 
                message: 'Please verify your email before logging in.',
                needsVerification: true,
                email: user.email
            });
        }
        
        // Generate magic link token
        const magicToken = generateMagicToken(email, user._id);
        
        // Send magic link
        await sendMagicLinkEmail(email, magicToken, true);
        
        res.json({ 
            success: true,
            message: 'Login link sent! Check your email for the login link.',
            emailSent: true
        });
        
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// MAGIC LINK CALLBACK - Verify and authenticate
router.get('/auth/callback', async (req, res) => {
    try {
        const { token, type } = req.query;
        
        console.log('Auth callback received - Type:', type, 'Token:', token ? 'Present' : 'Missing');
        
        if (!token) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_token`);
        }
        
        // Verify magic token
        const verification = verifyMagicToken(token);
        
        if (!verification.valid) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(verification.message)}`);
        }
        
        // Find user
        let user = await User.findOne({ email: verification.email });
        
        if (type === 'register') {
            // For registration, user should exist but not verified
            if (!user) {
                return res.redirect(`${process.env.FRONTEND_URL}/login?error=user_not_found`);
            }
            
            // Mark user as verified
            user.isVerified = true;
            user.verifiedAt = new Date();
            await user.save();
            
            console.log(`✅ User verified: ${user.email}`);
            
            // Redirect back to login page with verified flag
            const redirectUrl = `${process.env.FRONTEND_URL}/login?verified=true&email=${encodeURIComponent(user.email)}`;
            return res.redirect(redirectUrl);
            
        } else if (type === 'login') {
            // For login, user must exist and be verified
            if (!user) {
                return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_not_found`);
            }
            
            if (!user.isVerified) {
                return res.redirect(`${process.env.FRONTEND_URL}/login?error=email_not_verified`);
            }
            
            // Generate JWT token for auto-login
            const jwtToken = jwt.sign(
                { id: user._id, email: user.email, username: user.username }, 
                process.env.JWT_SECRET || 'your_super_secret_key_change_this',
                { expiresIn: '7d' }
            );
            
            // Generate refresh token
            const refreshToken = crypto.randomBytes(64).toString('hex');
            user.refreshToken = refreshToken;
            user.lastLogin = new Date();
            await user.save();
            
            // Redirect to auth success with tokens
            const redirectUrl = `${process.env.FRONTEND_URL}/auth/success?token=${jwtToken}&refreshToken=${refreshToken}&username=${encodeURIComponent(user.username)}&email=${encodeURIComponent(user.email)}`;
            return res.redirect(redirectUrl);
        }
        
        // Default fallback
        res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_type`);
        
    } catch (err) {
        console.error('Magic link callback error:', err);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
    }
});

// RESEND MAGIC LINK (for login)
router.post('/resend-magic-link', async (req, res) => {
    try {
        const { email, type } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        const user = await User.findOne({ email });
        
        if (!user && type === 'login') {
            return res.status(404).json({ message: 'No account found with this email' });
        }
        
        // Generate new magic link
        const magicToken = generateMagicToken(email, user?._id);
        
        // Send magic link email
        await sendMagicLinkEmail(email, magicToken, type === 'login');
        
        res.json({ 
            success: true,
            message: 'Magic link resent successfully! Check your inbox.'
        });
        
    } catch (err) {
        console.error('Resend magic link error:', err);
        res.status(500).json({ error: err.message });
    }
});

// RESEND VERIFICATION (for registration)
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('📧 Resend verification requested for:', email);
        
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: 'Email is required' 
            });
        }
        
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }
        
        if (user.isVerified) {
            return res.status(400).json({ 
                success: false,
                message: 'Email already verified' 
            });
        }
        
        // Generate new magic link token
        const magicToken = generateMagicToken(email, user._id);
        
        // Send magic link email
        await sendMagicLinkEmail(email, magicToken, false);
        
        console.log(`✅ New verification link sent for: ${email}`);
        
        res.json({ 
            success: true,
            message: 'Verification link sent! Please check your email.'
        });
        
    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ 
            success: false,
            error: err.message 
        });
    }
});

// Check if user is verified (for polling)
router.post('/check-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.json({ isVerified: false, exists: false });
        }
        
        res.json({ 
            isVerified: user.isVerified,
            exists: true,
            email: user.email
        });
        
    } catch (err) {
        console.error('Check verification error:', err);
        res.status(500).json({ error: err.message });
    }
});

// VERIFY TOKEN (for frontend to check)
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(401).json({ valid: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_key_change_this');
        const user = await User.findById(decoded.id).select('-passwordHash -refreshToken');
        
        if (!user) {
            return res.status(401).json({ valid: false, message: 'User not found' });
        }
        
        res.json({ valid: true, user });
        
    } catch (error) {
        res.status(401).json({ valid: false, message: 'Invalid token' });
    }
});

// GET LOGIN TOKEN for verified user (for auto-login after verification)
router.post('/get-login-token', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (!user.isVerified) {
            return res.status(401).json({ error: 'User not verified' });
        }
        
        // Generate JWT token
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, username: user.username }, 
            process.env.JWT_SECRET || 'your_super_secret_key_change_this',
            { expiresIn: '7d' }
        );
        
        // Generate refresh token
        const refreshToken = crypto.randomBytes(64).toString('hex');
        user.refreshToken = refreshToken;
        user.lastLogin = new Date();
        await user.save();
        
        res.json({ 
            token: jwtToken,
            refreshToken: refreshToken,
            username: user.username,
            email: user.email
        });
        
    } catch (err) {
        console.error('Get login token error:', err);
        res.status(500).json({ error: err.message });
    }
});

// LOGOUT
router.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (refreshToken) {
            await User.findOneAndUpdate(
                { refreshToken },
                { $unset: { refreshToken: 1 } }
            );
        }
        
        res.json({ message: 'Logged out successfully' });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET CURRENT USER
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Access denied' });
    
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_key_change_this');
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token' });
    }
};

router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash -refreshToken');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADD PASSWORD TO EXISTING MAGIC LINK USER
router.post('/add-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        
        const user = await User.findById(req.user.id);
        
        // If user already has a password, verify current password
        if (user.passwordHash && currentPassword) {
            const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!isValid) {
                return res.status(401).json({ message: 'Current password is incorrect' });
            }
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        user.passwordHash = passwordHash;
        await user.save();
        
        res.json({ 
            success: true,
            message: 'Password added successfully! You can now login with password.'
        });
        
    } catch (err) {
        console.error('Add password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DEBUG ENDPOINT - Manually verify a user (remove in production)
router.post('/debug/verify-user', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        const user = await User.findOneAndUpdate(
            { email },
            { 
                isVerified: true, 
                verifiedAt: new Date() 
            },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        console.log(`✅ Debug: User verified manually - ${email}`);
        
        res.json({ 
            success: true,
            message: 'User verified successfully!', 
            user: { 
                email: user.email, 
                username: user.username,
                isVerified: user.isVerified 
            }
        });
    } catch (err) {
        console.error('Debug verify error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add these new endpoints to your routes/auth.js file

// FORGOT PASSWORD - Send reset link
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('🔐 Forgot password requested for:', email);
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        const user = await User.findOne({ email });
        
        // For security, don't reveal if user exists
        if (!user) {
            console.log('User not found:', email);
            return res.status(200).json({ 
                message: 'If an account exists with this email, you will receive a password reset link.'
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date();
        resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry
        
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpiry = resetTokenExpiry;
        await user.save();
        
        // Send reset email
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${email}`;
        
        // You need to implement sendResetEmail function or use existing email service
        await sendResetPasswordEmail(email, resetLink);
        
        console.log(`✅ Reset link sent to: ${email}`);
        
        res.json({ 
            success: true,
            message: 'Password reset link sent to your email!'
        });
        
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// RESET PASSWORD - Update password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        
        console.log('🔐 Reset password attempt for:', email);
        
        if (!email || !token || !newPassword) {
            return res.status(400).json({ message: 'Email, token, and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        
        const user = await User.findOne({ 
            email, 
            resetPasswordToken: token,
            resetPasswordExpiry: { $gt: new Date() } // Token not expired
        });
        
        if (!user) {
            return res.status(400).json({ 
                message: 'Invalid or expired reset token. Please request a new password reset.' 
            });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        user.passwordHash = passwordHash;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpiry = undefined;
        await user.save();
        
        console.log(`✅ Password reset successful for: ${email}`);
        
        res.json({ 
            success: true,
            message: 'Password reset successful! You can now login with your new password.'
        });
        
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ADD PASSWORD TO EXISTING MAGIC LINK USER
router.post('/add-password', verifyToken, async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        
        const user = await User.findById(req.user.id);
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        user.passwordHash = passwordHash;
        await user.save();
        
        res.json({ 
            success: true,
            message: 'Password added successfully! You can now login with password.'
        });
        
    } catch (err) {
        console.error('Add password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE PASSWORD (for logged-in users)
router.post('/update-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }
        
        const user = await User.findById(req.user.id);
        
        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        user.passwordHash = passwordHash;
        await user.save();
        
        res.json({ 
            success: true,
            message: 'Password updated successfully!'
        });
        
    } catch (err) {
        console.error('Update password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper function to send reset email (add this to your magicLinkService.js)
async function sendResetPasswordEmail(email, resetLink) {
    // You can use the same email service as magic links
    const { sendEmail } = require('../services/magicLinkService');
    
    const subject = 'PeerSync - Password Reset';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Reset Your PeerSync Password</h2>
            <p>You requested to reset your password for your PeerSync account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                Reset Password
            </a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <hr style="margin: 30px 0;" />
            <p style="color: #666; font-size: 12px;">PeerSync Collaborative Coding Platform</p>
        </div>
    `;
    
    await sendEmail(email, subject, html);
}

module.exports = router;