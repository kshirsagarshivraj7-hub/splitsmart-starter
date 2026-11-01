'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function Home() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Restore saved session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('splitsmart.dummy.session');
      if (stored) {
        setSession(JSON.parse(stored));
        setChecking(false);
        return;
      }
    } catch {}

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data?.session) setSession(data.session);
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) setSession(s);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // Load groups for the active user (multi-tenant)
  const loadGroups = async () => {
    if (!session) return;
    let allGroups = [];
    let myMemberships = [];
    try {
      const gStored = localStorage.getItem('splitsmart.multi.groups');
      if (gStored) allGroups = JSON.parse(gStored);
      const mStored = localStorage.getItem('splitsmart.multi.members');
      if (mStored) myMemberships = JSON.parse(mStored);
    } catch {}

    // Find groups this user created or joined
    const memberGroupIds = myMemberships
      .filter((m) => m.user_id === session.user.id)
      .map((m) => m.group_id);

    let userGroups = allGroups.filter(
      (g) => g.created_by === session.user.id || memberGroupIds.includes(g.id)
    );

    // If new user with no groups, seed a default group so they can test immediately
    if (userGroups.length === 0) {
      const defaultGroup = {
        id: 'grp-seed-' + session.user.id.slice(-6),
        name: 'Goa Trip',
        join_code: 'GOA' + Math.floor(100 + Math.random() * 900),
        created_by: session.user.id,
        created_at: new Date().toISOString(),
      };
      userGroups.push(defaultGroup);
      allGroups.push(defaultGroup);
      myMemberships.push({ group_id: defaultGroup.id, user_id: session.user.id });

      try {
        localStorage.setItem('splitsmart.multi.groups', JSON.stringify(allGroups));
        localStorage.setItem('splitsmart.multi.members', JSON.stringify(myMemberships));

        const seedExpenses = [
          {
            id: 'seed-1',
            user_id: session.user.id,
            group_id: defaultGroup.id,
            name: 'Dinner',
            paid_by: 'Aisha',
            amount: 1800,
            emoji: '🍽️',
            created_at: new Date().toISOString(),
          },
          {
            id: 'seed-2',
            user_id: session.user.id,
            group_id: defaultGroup.id,
            name: 'Cab',
            paid_by: 'Raj',
            amount: 400,
            emoji: '🚕',
            created_at: new Date().toISOString(),
          },
        ];
        localStorage.setItem(
          `splitsmart.group_expenses.${defaultGroup.id}`,
          JSON.stringify(seedExpenses)
        );
      } catch {}
    }

    // Optional background check with Supabase
    try {
      const { data } = await supabase.from('groups').select('*').order('created_at');
      if (data && data.length) {
        data.forEach((dg) => {
          if (!userGroups.some((ug) => ug.id === dg.id)) {
            userGroups.push(dg);
          }
        });
      }
    } catch {}

    setGroups(userGroups);
    if (userGroups.length) {
      setGroupId((cur) => (userGroups.find((g) => g.id === cur) ? cur : userGroups[0].id));
    } else {
      setGroupId('');
    }
  };

  useEffect(() => {
    if (session) loadGroups();
    else {
      setGroups([]);
      setGroupId('');
    }
  }, [session]);

  // Load expenses for current selected group
  useEffect(() => {
    if (!session || !groupId) {
      setExpenses([]);
      return;
    }

    let groupExp = [];
    try {
      const stored = localStorage.getItem(`splitsmart.group_expenses.${groupId}`);
      if (stored) groupExp = JSON.parse(stored);
    } catch {}
    setExpenses(groupExp);

    // Optional background fetch from Supabase
    supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at')
      .then(({ data }) => {
        if (data && data.length) {
          setExpenses(data);
        }
      })
      .catch(() => {});
  }, [session, groupId]);

  // Instant Dummy Authentication (no real email confirmation bottlenecks or rate limits)
  const handleAuth = (mode) => {
    setAuthMsg('');
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setAuthMsg('Please enter an email and password.');
      return;
    }
    if (cleanPassword.length < 6) {
      setAuthMsg('Password must be at least 6 characters.');
      return;
    }

    const safeId = 'u-' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    const dummyUser = {
      id: safeId,
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
    };
    const dummySession = { user: dummyUser };

    try {
      localStorage.setItem('splitsmart.dummy.session', JSON.stringify(dummySession));
    } catch {}

    setSession(dummySession);
  };

  const signUp = () => handleAuth('signup');
  const signIn = () => handleAuth('signin');

  const signOut = () => {
    try {
      localStorage.removeItem('splitsmart.dummy.session');
    } catch {}
    supabase.auth.signOut().catch(() => {});
    setSession(null);
    setGroups([]);
    setGroupId('');
    setExpenses([]);
  };

  // Create a new group with a unique 6-character invite code
  const createGroup = async () => {
    const name = prompt('Name your group (e.g. Goa Trip, Flat 304):');
    if (!name || !name.trim()) return;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

    const newGroup = {
      id: 'grp-' + Date.now(),
      name: name.trim(),
      join_code: code,
      created_by: session.user.id,
      created_at: new Date().toISOString(),
    };

    try {
      let g = [];
      const gs = localStorage.getItem('splitsmart.multi.groups');
      if (gs) g = JSON.parse(gs);
      g.push(newGroup);
      localStorage.setItem('splitsmart.multi.groups', JSON.stringify(g));

      let m = [];
      const ms = localStorage.getItem('splitsmart.multi.members');
      if (ms) m = JSON.parse(ms);
      m.push({ group_id: newGroup.id, user_id: session.user.id });
      localStorage.setItem('splitsmart.multi.members', JSON.stringify(m));
    } catch {}

    // Background sync to Supabase if available
    supabase
      .from('groups')
      .insert({ name: name.trim(), created_by: session.user.id })
      .select()
      .single()
      .then(async ({ data: sg }) => {
        if (sg) {
          await supabase.from('group_members').insert({ group_id: sg.id, user_id: session.user.id });
        }
      })
      .catch(() => {});

    await loadGroups();
    setGroupId(newGroup.id);
  };

  // Join a group by its invite code
  const joinGroup = async () => {
    const code = prompt('Enter the 6-character group invite code:');
    if (!code || !code.trim()) return;

    const cleanCode = code.trim().toUpperCase();

    let foundGroup = null;
    try {
      const gs = localStorage.getItem('splitsmart.multi.groups');
      if (gs) {
        const parsed = JSON.parse(gs);
        foundGroup = parsed.find((g) => g.join_code === cleanCode);
      }
    } catch {}

    if (foundGroup) {
      try {
        let m = [];
        const ms = localStorage.getItem('splitsmart.multi.members');
        if (ms) m = JSON.parse(ms);
        if (!m.some((item) => item.group_id === foundGroup.id && item.user_id === session.user.id)) {
          m.push({ group_id: foundGroup.id, user_id: session.user.id });
          localStorage.setItem('splitsmart.multi.members', JSON.stringify(m));
        }
      } catch {}

      await loadGroups();
      setGroupId(foundGroup.id);
      return;
    }

    // Try Supabase RPC
    try {
      const { data, error } = await supabase.rpc('join_group', { code: cleanCode });
      if (error) throw error;
      await loadGroups();
      setGroupId(data);
    } catch {
      alert('No group found with code: ' + cleanCode + '. Check with your friend and try again.');
    }
  };

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const currentGroup = groups.find((g) => g.id === groupId);

  // Add an expense into the active group
  const addExpense = async () => {
    const t = text.trim();
    if (!t || !groupId || isAdding) return;

    setIsAdding(true);
    try {
      let expenseName = '';
      let expenseAmount = 0;

      // Try AI parsing via /api/split
      try {
        const res = await fetch('/api/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentence: t }),
        });
        const data = await res.json();
        if (data && (data.description || data.amount)) {
          expenseName = data.description;
          expenseAmount = Number(data.amount || 0);
        }
      } catch {}

      // Fallback regex parsing
      if (!expenseName) {
        const amountMatch = t.match(/\d[\d,]*(\.\d+)?/);
        expenseAmount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
        const rawName = t.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
        expenseName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      }

      const newExp = {
        id: 'exp-' + Date.now(),
        user_id: session.user.id,
        group_id: groupId,
        name: expenseName,
        paid_by: session.user.name || session.user.email?.split('@')[0] || 'You',
        amount: expenseAmount,
        emoji: '🧾',
        created_at: new Date().toISOString(),
      };

      try {
        let allExp = [];
        const stored = localStorage.getItem(`splitsmart.group_expenses.${groupId}`);
        if (stored) allExp = JSON.parse(stored);
        allExp.push(newExp);
        localStorage.setItem(`splitsmart.group_expenses.${groupId}`, JSON.stringify(allExp));
      } catch {}

      // Background optional sync to Supabase
      supabase
        .from('expenses')
        .insert({
          user_id: session.user.id,
          group_id: groupId,
          name: expenseName,
          paid_by: newExp.paid_by,
          amount: expenseAmount,
        })
        .catch(() => {});

      setExpenses((list) => [...list, newExp]);
      setText('');
    } catch (e) {
      alert('Could not add expense: ' + e.message);
    } finally {
      setIsAdding(false);
    }
  };

  const removeExpense = async (id) => {
    setExpenses((list) => list.filter((e) => e.id !== id));
    if (groupId) {
      try {
        const stored = localStorage.getItem(`splitsmart.group_expenses.${groupId}`);
        if (stored) {
          const filtered = JSON.parse(stored).filter((e) => e.id !== id);
          localStorage.setItem(`splitsmart.group_expenses.${groupId}`, JSON.stringify(filtered));
        }
      } catch {}
      supabase.from('expenses').delete().eq('id', id).catch(() => {});
    }
  };

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
            Loading SplitSmart…
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 1: Authentication Screen (instant login with any email, no confirmation needed)
  if (!session) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.brand}>
              <div style={styles.logo}>S</div>
              <div style={styles.title}>SplitSmart</div>
            </div>
            <span style={styles.badge}>Live</span>
          </div>

          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
            Sign in with any email (real or dummy) to manage and split expenses with your group.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: 4 }}>
                Email
              </label>
              <input
                style={styles.input2}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com (or test@dummy.com)"
                onKeyDown={(e) => e.key === 'Enter' && signIn()}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: 4 }}>
                Password
              </label>
              <input
                style={styles.input2}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                onKeyDown={(e) => e.key === 'Enter' && signIn()}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button style={styles.authBtn} onClick={signIn}>
                Sign In
              </button>
              <button style={styles.authBtnAlt} onClick={signUp}>
                Sign Up
              </button>
            </div>
          </div>

          {authMsg && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 10, fontSize: 13 }}>
              {authMsg}
            </div>
          )}

          <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Instant login enabled — no email verification needed! 🚀
            </span>
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 2: Multi-Tenant Groups & Expense Splitter
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div style={styles.title}>SplitSmart</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>
              👤 {session.user.name || session.user.email?.split('@')[0]}
            </span>
            <button style={styles.signout} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {/* Group Bar */}
        <div style={styles.groupBar}>
          <select
            style={styles.select}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.length === 0 && <option value="">No groups yet</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                📁 {g.name}
              </option>
            ))}
          </select>
          <button style={styles.gbtn} onClick={createGroup} title="Create new private group">
            + New
          </button>
          <button style={styles.gbtn} onClick={joinGroup} title="Join group with invite code">
            Join
          </button>
        </div>

        {currentGroup && (
          <div style={styles.codeLine}>
            Invite code: <b style={{ letterSpacing: '1px', color: 'var(--blue)' }}>{currentGroup.join_code}</b>
          </div>
        )}

        {/* Expenses List & Add Input */}
        {groupId ? (
          <>
            <div style={styles.addRow}>
              <input
                style={styles.input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExpense()}
                placeholder="Add an expense (e.g. Dinner 1800)…"
                disabled={isAdding}
              />
              <button
                style={styles.addBtn}
                onClick={addExpense}
                disabled={isAdding}
                aria-label="Add expense"
              >
                {isAdding ? '…' : '+'}
              </button>
            </div>

            <div style={styles.list}>
              {expenses.length === 0 && (
                <div style={styles.empty}>No expenses in this group yet. Add one above!</div>
              )}
              {expenses.map((e) => (
                <div key={e.id} style={styles.item}>
                  <div style={styles.itemEmoji}>{e.emoji || '🧾'}</div>
                  <div style={styles.itemMain}>
                    <div style={styles.itemName}>{e.name}</div>
                    <div style={styles.itemPaid}>paid by {e.paid_by}</div>
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
              ))}
            </div>

            <div style={styles.total}>Total {inr(total)}</div>
          </>
        ) : (
          <div style={styles.empty}>
            Create a group or join one with a code to get started.
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '28px 16px 48px',
  },
  card: {
    width: '100%',
    maxWidth: 440,
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
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 19,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
  },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px' },
  badge: {
    fontSize: 11.5,
    fontWeight: 700,
    color: '#059669',
    background: '#d1fae5',
    padding: '4px 10px',
    borderRadius: 999,
  },
  signout: {
    border: '1px solid var(--line)',
    background: '#fff',
    borderRadius: 10,
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  groupBar: { display: 'flex', gap: 8, marginBottom: 8 },
  select: {
    flex: 1,
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 700,
    background: '#f7f9fc',
    color: 'var(--ink)',
    outline: 'none',
  },
  gbtn: {
    flex: 'none',
    border: '1px solid var(--line)',
    background: '#fff',
    borderRadius: 12,
    padding: '0 14px',
    fontSize: 13.5,
    fontWeight: 800,
    color: 'var(--blue)',
    cursor: 'pointer',
  },
  codeLine: { fontSize: 13, color: 'var(--muted)', marginBottom: 14 },
  addRow: { display: 'flex', gap: 10, marginBottom: 16 },
  input: {
    flex: 1,
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '13px 15px',
    fontSize: 15,
    outline: 'none',
    background: '#f7f9fc',
  },
  input2: {
    width: '100%',
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 15,
    outline: 'none',
    background: '#f7f9fc',
    boxSizing: 'border-box',
    color: 'var(--ink)',
  },
  authBtn: {
    flex: 1,
    border: 'none',
    borderRadius: 12,
    padding: '12px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    cursor: 'pointer',
  },
  authBtnAlt: {
    flex: 1,
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '12px',
    color: 'var(--ink)',
    fontSize: 15,
    fontWeight: 800,
    background: '#fff',
    cursor: 'pointer',
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
    cursor: 'pointer',
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
    padding: '12px 14px',
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
  itemAmount: { fontWeight: 800, fontSize: 15.5 },
  remove: {
    flex: 'none',
    width: 26,
    height: 26,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 20,
    cursor: 'pointer',
  },
  total: {
    textAlign: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid var(--line)',
    fontWeight: 800,
    fontSize: 16,
  },
};
