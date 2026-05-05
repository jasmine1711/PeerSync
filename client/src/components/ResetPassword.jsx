// ResetPassword.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import '../pages/Login.css';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    const BACKEND_URL = "https://peersync-backend.onrender.com";
    
    // Get token and email from URL
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');
    const email = queryParams.get('email');

    useEffect(() => {
        if (!token || !email) {
            setError('Invalid reset link. Please request a new password reset.');
        }
    }, [token, email]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        
        setIsLoading(true);
        setMessage('');
        setError('');
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, token, newPassword: password })
            });

            const data = await res.json();
            
            if (res.ok) {
                setMessage(data.message || 'Password reset successful! Redirecting to login...');
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            } else {
                setError(data.message || 'Failed to reset password');
            }
        } catch (err) {
            setError("Server connection failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="floating-particles">
                {[...Array(20)].map((_, i) => (
                    <div key={i} className="particle" style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 5}s`,
                    }}></div>
                ))}
            </div>

            <div className="back-home">
                <button className="back-home-btn" onClick={() => navigate('/login')}>
                    <svg className="back-arrow" viewBox="0 0 24 24">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Login
                </button>
            </div>

            <div className="auth-card">
                <h2 className="auth-title">
                    Create <span>New Password</span>
                </h2>
                <p className="auth-subtitle">
                    Enter your new password below
                </p>

                {message && <div className="success-message">{message}</div>}
                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>New Password</label>
                        <input 
                            type="password" 
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            disabled={isLoading}
                        />
                    </div>

                    <div className="input-group">
                        <label>Confirm Password</label>
                        <input 
                            type="password" 
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                            required 
                            disabled={isLoading}
                        />
                    </div>

                    <button type="submit" className="auth-btn" disabled={isLoading}>
                        {isLoading ? 'Resetting...' : 'Reset Password'}
                    </button>
                </form>

                <p className="auth-footer">
                    Remember your password? <Link to="/login">Login here</Link>
                </p>
            </div>
        </div>
    );
}