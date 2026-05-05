// Login.jsx - Fixed version with correct endpoint mapping and Forgot Password
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [authMethod, setAuthMethod] = useState('password'); // 'password' or 'magic'
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [isPolling, setIsPolling] = useState(false);
    const [pollingCount, setPollingCount] = useState(0);
    const navigate = useNavigate();
    const BACKEND_URL = "https://peersync-backend.onrender.com";

    // Clear cache on login page
    useEffect(() => {
        console.log('🧹 Clearing old cache on login page...');
        const version = localStorage.getItem('app_version');
        localStorage.clear();
        sessionStorage.clear();
        if (version) localStorage.setItem('app_version', version);
        
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        
        setIsCheckingAuth(false);
    }, []);

    // Polling for magic link verification
    useEffect(() => {
        let pollInterval;
        let verificationAttempts = 0;
        const MAX_ATTEMPTS = 30;
        
        if (isPolling && email) {
            pollInterval = setInterval(async () => {
                verificationAttempts++;
                setPollingCount(verificationAttempts);
                
                try {
                    const res = await fetch(`${BACKEND_URL}/api/auth/check-verification`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    
                    const data = await res.json();
                    
                    if (data.isVerified) {
                        clearInterval(pollInterval);
                        setIsPolling(false);
                        // Auto login after verification
                        const loginRes = await fetch(`${BACKEND_URL}/api/auth/get-login-token`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        const loginData = await loginRes.json();
                        if (loginData.token) {
                            localStorage.setItem('token', loginData.token);
                            localStorage.setItem('refreshToken', loginData.refreshToken || '');
                            localStorage.setItem('userName', loginData.username || email.split('@')[0]);
                            localStorage.setItem('userEmail', email);
                            localStorage.setItem('app_version', '2.0.0');
                            
                            setMessage('Email verified! Redirecting...');
                            setTimeout(() => navigate('/dashboard'), 1500);
                        }
                    } else if (verificationAttempts >= MAX_ATTEMPTS) {
                        clearInterval(pollInterval);
                        setIsPolling(false);
                        setError('Verification timeout. Please try again.');
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 3000);
        }
        
        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [isPolling, email, navigate, BACKEND_URL]);

    // PASSWORD LOGIN - This now correctly uses the password endpoint
    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');
        
        console.log('🔐 Attempting PASSWORD login for:', email);
        
        try {
            // FIXED: Using the correct password login endpoint
            const res = await fetch(`${BACKEND_URL}/api/auth/login-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();
            console.log('Password login response:', { ok: res.ok, hasToken: !!data.token });

            if (res.ok && data.token) {
                // Store tokens
                localStorage.setItem('token', data.token);
                localStorage.setItem('refreshToken', data.refreshToken || '');
                localStorage.setItem('userName', data.user?.username || email.split('@')[0]);
                localStorage.setItem('userEmail', email);
                localStorage.setItem('app_version', '2.0.0');
                
                setMessage('Login successful! Redirecting...');
                setTimeout(() => navigate('/dashboard'), 1500);
            } else {
                setError(data.message || data.error || 'Login failed. Please check your credentials.');
            }
        } catch (err) {
            console.error('Password login error:', err);
            setError('Server connection failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // MAGIC LINK LOGIN - Send email with magic link
    const handleMagicLinkLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');
        
        console.log('✨ Attempting MAGIC LINK login for:', email);
        
        try {
            // FIXED: Using the correct magic link endpoint
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();
            console.log('Magic link response:', data);

            if (res.ok && data.success) {
                setMessage('✨ Magic link sent! Check your email to login.');
                setIsPolling(true);
                setPollingCount(0);
            } else if (data.needsVerification) {
                setMessage('📧 Verification needed. Please verify your email first.');
                // Option to resend verification
                setTimeout(async () => {
                    try {
                        await fetch(`${BACKEND_URL}/api/auth/resend-verification`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        setMessage('📧 Verification link resent! Check your email.');
                    } catch (err) {
                        console.error('Resend error:', err);
                    }
                }, 2000);
            } else {
                setError(data.message || 'Failed to send magic link');
            }
        } catch (err) {
            console.error('Magic link error:', err);
            setError('Server connection failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // REGISTER with password
    const handleRegister = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');
        
        console.log('📝 Attempting registration for:', email);
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/register-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: email.split('@')[0],
                    email, 
                    password 
                })
            });

            const data = await res.json();
            console.log('Register response:', { ok: res.ok, hasToken: !!data.token });

            if (res.ok && data.token) {
                // Auto-login after registration
                localStorage.setItem('token', data.token);
                localStorage.setItem('refreshToken', data.refreshToken || '');
                localStorage.setItem('userName', data.user?.username || email.split('@')[0]);
                localStorage.setItem('userEmail', email);
                localStorage.setItem('app_version', '2.0.0');
                
                setMessage('Registration successful! Redirecting...');
                setTimeout(() => navigate('/dashboard'), 1500);
            } else {
                setError(data.message || data.error || 'Registration failed');
            }
        } catch (err) {
            console.error('Register error:', err);
            setError('Server connection failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingAuth) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="loading-spinner">⏳</div>
                    <h2>Loading...</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2 className="auth-title">
                    {isLogin ? 'Login to' : 'Register for'} <span>PeerSync</span>
                </h2>

                {/* Auth Method Toggle (only for login) */}
                {isLogin && (
                    <div className="auth-method-toggle">
                        <button 
                            className={`method-btn ${authMethod === 'password' ? 'active' : ''}`}
                            onClick={() => { 
                                setAuthMethod('password'); 
                                setError(''); 
                                setMessage('');
                                setIsPolling(false);
                            }}
                        >
                            🔐 Password Login
                        </button>
                        <button 
                            className={`method-btn ${authMethod === 'magic' ? 'active' : ''}`}
                            onClick={() => { 
                                setAuthMethod('magic'); 
                                setError(''); 
                                setMessage('');
                            }}
                        >
                            ✨ Magic Link
                        </button>
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}
                {message && <div className="success-message">{message}</div>}

                {isPolling && (
                    <div className="polling-status">
                        <div className="loading-spinner-small">⏳</div>
                        <p>Waiting for email verification...</p>
                        <small>Click the link in your email. Auto-detecting...</small>
                        <div className="polling-progress">
                            <div className="progress-bar" style={{ width: `${(pollingCount / 30) * 100}%` }}></div>
                        </div>
                    </div>
                )}

                {!isPolling && (
                    <form onSubmit={
                        isLogin 
                            ? (authMethod === 'password' ? handlePasswordLogin : handleMagicLinkLogin)
                            : handleRegister
                    }>
                        <div className="input-group">
                            <label>Email Address</label>
                            <input 
                                type="email" 
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                                disabled={isLoading}
                            />
                        </div>

                        {/* Show password field for Password Login AND Registration */}
                        {((isLogin && authMethod === 'password') || !isLogin) && (
                            <>
                                <div className="input-group">
                                    <label>Password</label>
                                    <input 
                                        type="password" 
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)} 
                                        required 
                                        disabled={isLoading}
                                    />
                                </div>
                                
                                {/* Add Forgot Password link - Only for password login */}
                                {isLogin && authMethod === 'password' && (
                                    <div className="forgot-password-link">
                                        <Link to="/forgot-password">Forgot Password?</Link>
                                    </div>
                                )}
                            </>
                        )}

                        <button type="submit" className="auth-btn" disabled={isLoading}>
                            {isLoading 
                                ? 'Processing...' 
                                : isLogin 
                                    ? (authMethod === 'password' ? 'Login 🔐' : 'Send Magic Link ✨')
                                    : 'Register ✨'
                            }
                        </button>
                    </form>
                )}

                <p className="auth-footer">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button 
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                            setMessage('');
                            setAuthMethod('password');
                            setIsPolling(false);
                            setPassword('');
                        }}
                        className="link-button"
                    >
                        {isLogin ? 'Register here' : 'Login here'}
                    </button>
                </p>
                
                <div className="demo-credentials">
              
                    <small style={{ display: 'block', marginTop: '10px' }}>
                        💡 <strong>Password Login:</strong> Use email + password<br/>
                        💡 <strong>Magic Link:</strong> Receive email with login link<br/>
                        💡 <strong>Forgot Password:</strong> Click "Forgot Password?" to reset
                    </small>
                </div>
            </div>
        </div>
    );
}