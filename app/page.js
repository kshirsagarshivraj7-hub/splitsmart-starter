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
  const [showAuth, setShowAuth] = useState(false);
  const [expenses, setExpenses] = useState(SEED);
  const [dbError, setDbError] = useState('');
  const [text, setText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [ready, setReady] = useState(false);

  // Monitor Supabase auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setShowAuth(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch expenses from Supabase for logged-in user, or localStorage if offline
  const fetchExpenses = async (currentUser) => {
    if (!currentUser || !isSupabaseConfigured) return;
    setDbError('');

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Supabase query error:', error);
      if (error.code === 'PGRST205' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        setDbError('The "expenses" table is not created in Supabase yet. Please run schema.sql in Supabase SQL Editor.');
      } else {
        setDbError(error.message);
      }
    } else if (data) {
      setExpenses(
        data.map((e) => ({
          id: e.id,
          emoji: e.emoji || '🧾',
          name: e.name,
          paidBy: e.paid_by || 'You',
          amount: Number(e.amount || 0),
          userId: e.user_id,
        }))
      );
    }
  };

  // Sync state on user change
  useEffect(() => {
    if (user) {
      fetchExpenses(user);
    } else {
      // Load saved local expenses if not logged in
      try {
        const saved = localStorage.getItem('splitsmart.expenses');
        if (saved) setExpenses(JSON.parse(saved));
        else setExpenses(SEED);
      } catch {
        setExpenses(SEED);
      }
    }
    setReady(true);
  }, [user]);

  // Save to localStorage when not logged in
  useEffect(() => {
    if (ready && !user) {
      try {
        localStorage.setItem('splitsmart.expenses', JSON.stringify(expenses));
      } catch {}
    }
  }, [expenses, ready, user]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const addExpense = async () => {
    const t = text.trim();
    if (!t || isAdding) return;

    const parsed = parseExpense(t);

    if (user && isSupabaseConfigured) {
      setIsAdding(true);
      const paidByName = user.email ? user.email.split('@')[0] : 'You';
      const { data, error } = await supabase
        .from('expenses')
        .insert([
          {
            user_id: user.id,
            name: parsed.name,
            emoji: parsed.emoji,
            paid_by: paidByName,
            amount: parsed.amount,
          },
        ])
        .select()
        .single();

      setIsAdding(false);

      if (error) {
        console.error('Error saving expense to Supabase:', error);
        if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
          setDbError('Could not save: "expenses" table is missing in Supabase. Please run schema.sql in Supabase SQL Editor.');
        } else {
          alert('Could not save expense: ' + error.message);
        }
        // Fallback to local state so user's entry is not lost
        setExpenses((list) => [...list, parsed]);
        setText('');
      } else if (data) {
        setExpenses((list) => [
          ...list,
          {
            id: data.id,
            emoji: data.emoji || '🧾',
            name: data.name,
            paidBy: data.paid_by || 'You',
            amount: Number(data.amount || 0),
            userId: data.user_id,
          },
        ]);
        setText('');
      }
    } else {
      // Local addition
      setExpenses((list) => [...list, parsed]);
      setText('');
    }
  };

  const removeExpense = async (id) => {
    setExpenses((list) => list.filter((e) => e.id !== id));

    if (user && isSupabaseConfigured) {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) {
        console.error('Error removing expense from Supabase:', error);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setShowAuth(false);
    setExpenses(SEED);
  };

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div style={styles.title}>SplitSmart</div>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.groupPill}>My Group</div>
            {user ? (
              <div style={styles.userControls}>
                <span style={styles.userPill} title={user.email}>
                  👤 {user.email?.split('@')[0]}
                </span>
                <button
                  style={styles.logoutBtn}
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  Log out
                </button>
              </div>
            ) : (
              <button
                style={styles.authToggleBtn}
                onClick={() => setShowAuth(!showAuth)}
              >
                {showAuth ? 'Close' : 'Sign In'}
              </button>
            )}
          </div>
        </div>

        {/* Database table warning if schema hasn't been run */}
        {dbError && (
          <div style={styles.dbWarning}>
            <strong>⚠️ Database Setup Needed:</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.4 }}>
              {dbError}
            </p>
          </div>
        )}

        {/* Collapsible Auth Panel */}
        {showAuth && !user && (
          <div style={styles.authContainer}>
            <Auth />
          </div>
        )}

        {/* Cloud Sync Status Indicator */}
        <div style={styles.syncBanner}>
          {user ? (
            <span style={{ color: '#16a34a' }}>● Connected to Supabase Cloud Database</span>
          ) : (
            <span>
              💡 Using local mode. <button style={styles.inlineLink} onClick={() => setShowAuth(true)}>Sign in</button> to sync expenses to the cloud.
            </span>
          )}
        </div>

        {/* Add an expense */}
        <div style={styles.addRow}>
          <input
            style={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExpense()}
            placeholder="Add an expense…"
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

      <p style={styles.footnote}>
        SplitSmart · deepEntra Academy — Build &amp; Ship It.<br />
        Connected to Supabase Authentication &amp; Database.
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
    padding: 20,
    marginTop: 12,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: {
    width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
    color: '#fff', fontWeight: 800, fontSize: 18,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    boxShadow: '0 8px 18px -6px rgba(28,95,212,.55)',
  },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  userControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  userPill: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)',
    padding: '5px 8px',
    borderRadius: 999,
    maxWidth: 100,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    fontSize: 11.5,
    fontWeight: 700,
    color: '#b91c1c',
    background: '#fee2e2',
    border: 'none',
    padding: '5px 8px',
    borderRadius: 999,
    cursor: 'pointer',
  },
  authToggleBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    boxShadow: '0 4px 12px -2px rgba(28,95,212,.4)',
  },
  groupPill: {
    fontSize: 12, fontWeight: 800, color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)', padding: '5px 10px', borderRadius: 999,
  },
  dbWarning: {
    background: '#fef3c7',
    border: '1px solid #fde68a',
    color: '#92400e',
    borderRadius: 14,
    padding: '10px 12px',
    marginBottom: 14,
    fontSize: 12.5,
  },
  authContainer: {
    background: '#f8fafc',
    border: '1px solid var(--line)',
    borderRadius: 18,
    padding: '14px',
    marginBottom: 16,
  },
  syncBanner: {
    fontSize: 12,
    color: 'var(--muted)',
    marginBottom: 12,
    textAlign: 'center',
    padding: '2px 0',
  },
  inlineLink: {
    background: 'none',
    border: 'none',
    color: 'var(--blue)',
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
    fontSize: 'inherit',
  },
  addRow: { display: 'flex', gap: 10, marginBottom: 16 },
  input: {
    flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px',
    fontSize: 15, outline: 'none', background: '#f7f9fc', color: 'var(--ink)',
  },
  addBtn: {
    flex: 'none', width: 48, borderRadius: 14, border: 'none', color: '#fff', fontSize: 24, fontWeight: 700,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    boxShadow: '0 10px 22px -8px rgba(28,95,212,.6)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  item: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px',
  },
  itemEmoji: {
    width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
    background: '#fff', border: '1px solid var(--line)', fontSize: 19, flex: 'none',
  },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontWeight: 700, fontSize: 15 },
  itemPaid: { color: 'var(--muted)', fontSize: 12.5, marginTop: 1 },
  itemAmount: { fontWeight: 800, fontSize: 15.5, fontVariantNumeric: 'tabular-nums' },
  remove: {
    flex: 'none', width: 26, height: 26, borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--muted)', fontSize: 20, lineHeight: 1,
  },
  total: {
    textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)',
    fontWeight: 800, fontSize: 16, color: 'var(--ink)',
  },
  footnote: { color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', lineHeight: 1.6, marginTop: 20, maxWidth: 420 },
};
