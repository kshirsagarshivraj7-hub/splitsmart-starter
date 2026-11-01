'use client';

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import Auth from '../components/Auth';

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
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [text, setText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Monitor Supabase auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch expenses for the logged-in user from Supabase
  const fetchExpenses = async () => {
    if (!user) return;
    setLoadingExpenses(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching expenses from Supabase:', error);
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
    setLoadingExpenses(false);
  };

  useEffect(() => {
    if (user) {
      fetchExpenses();
    } else {
      setExpenses([]);
    }
  }, [user]);

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
        alert('Could not save expense: ' + error.message);
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
      setExpenses((list) => [...list, parsed]);
      setText('');
    }
  };

  const removeExpense = async (id) => {
    if (user && isSupabaseConfigured) {
      // Optimistic delete
      setExpenses((list) => list.filter((e) => e.id !== id));

      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) {
        console.error('Error removing expense from Supabase:', error);
        alert('Could not remove expense: ' + error.message);
        fetchExpenses(); // Revert on error
      }
    } else {
      setExpenses((list) => list.filter((e) => e.id !== id));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setExpenses([]);
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
          {user ? (
            <div style={styles.headerRight}>
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
            <div style={styles.groupPill}>My Group</div>
          )}
        </div>

        {authLoading ? (
          <div style={styles.loadingBox}>Checking authentication…</div>
        ) : !user ? (
          /* Login and Signup System */
          <Auth />
        ) : (
          /* Authenticated Expenses View */
          <>
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
              {loadingExpenses ? (
                <div style={styles.empty}>Loading your expenses…</div>
              ) : expenses.length === 0 ? (
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
          </>
        )}
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
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
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
  userPill: {
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)',
    padding: '6px 10px',
    borderRadius: 999,
    maxWidth: 120,
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
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  groupPill: {
    fontSize: 12.5, fontWeight: 800, color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)', padding: '6px 12px', borderRadius: 999,
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
  loadingBox: {
    textAlign: 'center',
    padding: '32px 0',
    color: 'var(--muted)',
    fontSize: 14,
  },
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
