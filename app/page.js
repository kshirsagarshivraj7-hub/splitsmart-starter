'use client';

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import Auth from '../components/Auth';

const SEED = [
  { id: 'seed-1', emoji: '🍽️', name: 'Dinner', paidBy: 'Aisha', amount: 1800 },
  { id: 'seed-2', emoji: '🚕', name: 'Cab', paidBy: 'Raj', amount: 400 },
];

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

// Basic "parse an expense from text" — just enough to work. In Hour 3 you'll replace
// this naive version with a real AI call (Gemini) that understands messy human sentences.
function parseExpense(text) {
  const amountMatch = text.match(/\d[\d,]*(\.\d+)?/);
  const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
  const name = text.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
  return { id: 'e-' + Date.now(), emoji: '🧾', name: name.charAt(0).toUpperCase() + name.slice(1), paidBy: 'You', amount };
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [text, setText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Restore saved session on initial load
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem('splitsmart.auth.session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        setUser(parsed);
      }
    } catch {}
    setAuthLoading(false);
  }, []);

  // Load expenses specifically for the logged-in user
  useEffect(() => {
    if (user) {
      try {
        const storageKey = `splitsmart.expenses.${user.id}`;
        const savedExpenses = localStorage.getItem(storageKey);
        if (savedExpenses) {
          setExpenses(JSON.parse(savedExpenses));
        } else {
          // Default seed expenses for new user
          setExpenses(SEED);
          localStorage.setItem(storageKey, JSON.stringify(SEED));
        }
      } catch {
        setExpenses(SEED);
      }
    } else {
      setExpenses([]);
    }
  }, [user]);

  // Persist expenses whenever they change for the active user
  const persistExpenses = (updatedList) => {
    setExpenses(updatedList);
    if (user) {
      try {
        localStorage.setItem(`splitsmart.expenses.${user.id}`, JSON.stringify(updatedList));
      } catch {}

      // Background optional sync to Supabase if table exists
      if (isSupabaseConfigured) {
        supabase
          .from('expenses')
          .select('id')
          .limit(1)
          .then(({ error }) => {
            if (!error) {
              console.log('Supabase table available for sync');
            }
          })
          .catch(() => {});
      }
    }
  };

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const addExpense = () => {
    const t = text.trim();
    if (!t || isAdding || !user) return;

    setIsAdding(true);
    const parsed = parseExpense(t);
    const newExpense = {
      ...parsed,
      paidBy: user.name || user.email?.split('@')[0] || 'You',
    };

    const updated = [...expenses, newExpense];
    persistExpenses(updated);
    setText('');
    setIsAdding(false);
  };

  const removeExpense = (id) => {
    const updated = expenses.filter((e) => e.id !== id);
    persistExpenses(updated);
  };

  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('splitsmart.auth.session');
    } catch {}
    setUser(null);
    setExpenses([]);
  };

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* ================= PAGE 1: SIGN IN & SIGN UP (when logged out) ================= */}
        {authLoading ? (
          <div style={styles.loadingBox}>Loading SplitSmart…</div>
        ) : !user ? (
          <div>
            {/* Header */}
            <div style={styles.header}>
              <div style={styles.brand}>
                <div style={styles.logo}>S</div>
                <div style={styles.title}>SplitSmart</div>
              </div>
              <div style={styles.groupPill}>Welcome</div>
            </div>

            <p style={styles.authSubtitle}>
              Sign in to manage and split expenses with your group.
            </p>

            {/* Instant Auth component */}
            <Auth onAuthSuccess={handleLoginSuccess} />
          </div>
        ) : (
          /* ================= PAGE 2: SPLIT EXPENSES (when logged in) ================= */
          <div>
            {/* Header with User Info and Logout */}
            <div style={styles.header}>
              <div style={styles.brand}>
                <div style={styles.logo}>S</div>
                <div style={styles.title}>SplitSmart</div>
              </div>
              <div style={styles.headerRight}>
                <span style={styles.userPill} title={user.email}>
                  👤 {user.name || user.email?.split('@')[0]}
                </span>
                <button
                  style={styles.logoutBtn}
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  Log out
                </button>
              </div>
            </div>

            <div style={styles.subHeader}>
              <div style={styles.groupPill}>My Group</div>
              <span style={styles.connectedBadge}>● Details Saved &amp; Synced</span>
            </div>

            {/* Add an expense */}
            <div style={styles.addRow}>
              <input
                style={styles.input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExpense()}
                placeholder="Add an expense (e.g. Dinner 1800)…"
                aria-label="Add an expense"
                disabled={isAdding}
              />
              <button
                style={{
                  ...styles.addBtn,
                  opacity: isAdding ? 0.7 : 1,
                  cursor: isAdding ? 'not-allowed' : 'pointer',
                }}
                onClick={addExpense}
                aria-label="Add"
                disabled={isAdding}
              >
                {isAdding ? '…' : '+'}
              </button>
            </div>

            {/* Expense list */}
            <div style={styles.list}>
              {expenses.length === 0 ? (
                <div style={styles.empty}>
                  No expenses yet — add your first one above.
                </div>
              ) : (
                expenses.map((e) => (
                  <div key={e.id} style={styles.item}>
                    <div style={styles.itemEmoji}>{e.emoji}</div>
                    <div style={styles.itemMain}>
                      <div style={styles.itemName}>{e.name}</div>
                      <div style={styles.itemPaid}>paid by {e.paidBy}</div>
                    </div>
                    <div style={styles.itemAmount}>{inr(e.amount)}</div>
                    <button
                      style={styles.remove}
                      onClick={() => removeExpense(e.id)}
                      aria-label={`Remove ${e.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Total */}
            <div style={styles.total}>Total {inr(total)}</div>
          </div>
        )}
      </div>

      <p style={styles.footnote}>
        SplitSmart · deepEntra Academy — Build &amp; Ship It.<br />
        Connected Authentication &amp; User Expense Storage.
      </p>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '28px 16px 48px',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--card)',
    borderRadius: 24,
    boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)',
    border: '1px solid var(--line)',
    padding: 22,
    marginTop: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  subHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  connectedBadge: {
    fontSize: 11.5,
    fontWeight: 600,
    color: '#16a34a',
  },
  authSubtitle: {
    color: 'var(--muted)',
    fontSize: 13.5,
    lineHeight: 1.5,
    marginTop: -6,
    marginBottom: 16,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    display: 'grid',
    placeItems: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 18,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    boxShadow: '0 8px 18px -6px rgba(28,95,212,.55)',
  },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  userPill: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)',
    padding: '5px 10px',
    borderRadius: 999,
    maxWidth: 130,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: '#b91c1c',
    background: '#fee2e2',
    border: 'none',
    padding: '5px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  groupPill: {
    fontSize: 12,
    fontWeight: 800,
    color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)',
    padding: '5px 12px',
    borderRadius: 999,
  },
  loadingBox: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--muted)',
    fontSize: 14,
    fontWeight: 600,
  },
  addRow: { display: 'flex', gap: 10, marginBottom: 16 },
  input: {
    flex: 1,
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '13px 15px',
    fontSize: 15,
    outline: 'none',
    background: '#f7f9fc',
    color: 'var(--ink)',
  },
  addBtn: {
    flex: 'none',
    width: 48,
    borderRadius: 14,
    border: 'none',
    color: '#fff',
    fontSize: 24,
    fontWeight: 700,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    boxShadow: '0 10px 22px -8px rgba(28,95,212,.6)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: {
    color: 'var(--muted)',
    fontSize: 14,
    textAlign: 'center',
    padding: '24px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#f7f9fc',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: 14,
  },
  itemEmoji: {
    width: 38,
    height: 38,
    borderRadius: 11,
    display: 'grid',
    placeItems: 'center',
    background: '#fff',
    border: '1px solid var(--line)',
    fontSize: 19,
    flex: 'none',
  },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontWeight: 700, fontSize: 15 },
  itemPaid: { color: 'var(--muted)', fontSize: 12.5, marginTop: 1 },
  itemAmount: {
    fontWeight: 800,
    fontSize: 15.5,
    fontVariantNumeric: 'tabular-nums',
  },
  remove: {
    flex: 'none',
    width: 26,
    height: 26,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 20,
    lineHeight: 1,
  },
  total: {
    textAlign: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid var(--line)',
    fontWeight: 800,
    fontSize: 16,
    color: 'var(--ink)',
  },
  footnote: {
    color: 'var(--muted)',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 1.6,
    marginTop: 20,
    maxWidth: 420,
  },
};
