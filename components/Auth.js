'use client';

import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        if (data?.user && !data?.session) {
          setMessage('Account created! Please check your email to confirm your account, then sign in.');
        } else {
          setMessage('Account created and signed in successfully!');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Supabase email limit reached. Tip: In Supabase Dashboard → Authentication → Providers → Email, toggle OFF "Confirm email" to enable instant sign-up without email confirmation!');
      } else {
        setError(err.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={authStyles.wrapper}>
      {!isSupabaseConfigured && (
        <div style={authStyles.notice}>
          <div style={authStyles.noticeTitle}>⚙️ Supabase Setup Needed</div>
          <p style={authStyles.noticeText}>
            Add your <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code> (and Vercel environment variables) to connect your project.
          </p>
        </div>
      )}

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
          <label style={authStyles.label} htmlFor="auth-email">Email</label>
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
          <label style={authStyles.label} htmlFor="auth-password">Password</label>
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
  notice: {
    background: 'rgba(28, 95, 212, 0.08)',
    border: '1px solid rgba(28, 95, 212, 0.2)',
    borderRadius: 14,
    padding: '12px 14px',
    color: 'var(--ink)',
  },
  noticeTitle: {
    fontWeight: 700,
    fontSize: 13.5,
    marginBottom: 4,
    color: 'var(--blue)',
  },
  noticeText: {
    fontSize: 12.5,
    lineHeight: 1.5,
    margin: 0,
    color: 'var(--muted)',
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
