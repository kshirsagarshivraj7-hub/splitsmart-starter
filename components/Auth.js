'use client';

import { useState } from 'react';

export default function Auth({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleAuth = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Please enter both email and password.');
      return;
    }

    if (cleanPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      // Get all registered users from storage
      let users = [];
      try {
        const stored = localStorage.getItem('splitsmart.auth.users');
        if (stored) users = JSON.parse(stored);
      } catch {}

      if (isSignUp) {
        // Sign Up Flow
        const existing = users.find((u) => u.email === cleanEmail);
        if (existing) {
          setError('An account with this email already exists. Please Sign In.');
          setLoading(false);
          return;
        }

        const newUser = {
          id: 'user-' + Date.now(),
          email: cleanEmail,
          password: cleanPassword,
          name: cleanEmail.split('@')[0],
          createdAt: new Date().toISOString(),
        };

        users.push(newUser);
        localStorage.setItem('splitsmart.auth.users', JSON.stringify(users));
        localStorage.setItem('splitsmart.auth.session', JSON.stringify(newUser));

        setMessage('Account created successfully! Logging you in…');
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(newUser);
        }, 300);
      } else {
        // Sign In Flow
        let existingUser = users.find((u) => u.email === cleanEmail);

        if (!existingUser) {
          // Auto-create user for frictionless demo testing if not found
          existingUser = {
            id: 'user-' + Date.now(),
            email: cleanEmail,
            password: cleanPassword,
            name: cleanEmail.split('@')[0],
            createdAt: new Date().toISOString(),
          };
          users.push(existingUser);
          localStorage.setItem('splitsmart.auth.users', JSON.stringify(users));
        } else if (existingUser.password && existingUser.password !== cleanPassword) {
          setError('Incorrect password. Please try again.');
          setLoading(false);
          return;
        }

        localStorage.setItem('splitsmart.auth.session', JSON.stringify(existingUser));
        setMessage('Signed in successfully! Opening SplitSmart…');
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(existingUser);
        }, 300);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={authStyles.wrapper}>
      {/* Auth Toggle Tabs */}
      <div style={authStyles.tabs}>
        <button
          type="button"
          style={{
            ...authStyles.tab,
            ...(!isSignUp ? authStyles.tabActive : {}),
          }}
          onClick={() => {
            setIsSignUp(false);
            setError('');
            setMessage('');
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          style={{
            ...authStyles.tab,
            ...(isSignUp ? authStyles.tabActive : {}),
          }}
          onClick={() => {
            setIsSignUp(true);
            setError('');
            setMessage('');
          }}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleAuth} style={authStyles.form}>
        <div style={authStyles.field}>
          <label style={authStyles.label} htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            style={authStyles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div style={authStyles.field}>
          <label style={authStyles.label} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            required
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            style={authStyles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>

        {error && <div style={authStyles.errorBox}>{error}</div>}
        {message && <div style={authStyles.successBox}>{message}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...authStyles.submitBtn,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? (isSignUp ? 'Creating account…' : 'Signing in…')
            : (isSignUp ? 'Create Account' : 'Sign In')}
        </button>
      </form>

      <div style={authStyles.togglePrompt}>
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              style={authStyles.linkBtn}
              onClick={() => {
                setIsSignUp(false);
                setError('');
                setMessage('');
              }}
            >
              Sign In
            </button>
          </>
        ) : (
          <>
            Need an account?{' '}
            <button
              type="button"
              style={authStyles.linkBtn}
              onClick={() => {
                setIsSignUp(true);
                setError('');
                setMessage('');
              }}
            >
              Sign Up
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const authStyles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '8px 0',
  },
  tabs: {
    display: 'flex',
    background: '#f0f3fa',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabActive: {
    background: '#fff',
    color: 'var(--blue)',
    boxShadow: '0 2px 8px rgba(0,0,0,.06)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--ink)',
  },
  input: {
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '12px 14px',
    fontSize: 14.5,
    outline: 'none',
    background: '#f7f9fc',
    color: 'var(--ink)',
  },
  submitBtn: {
    width: '100%',
    padding: '13px',
    borderRadius: 14,
    border: 'none',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    boxShadow: '0 10px 22px -8px rgba(28,95,212,.6)',
    marginTop: 6,
  },
  errorBox: {
    background: '#fee2e2',
    color: '#b91c1c',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.4,
  },
  successBox: {
    background: '#dcfce7',
    color: '#15803d',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.4,
  },
  togglePrompt: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--muted)',
    marginTop: 4,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--blue)',
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
    fontSize: 'inherit',
    textDecoration: 'underline',
  },
};
