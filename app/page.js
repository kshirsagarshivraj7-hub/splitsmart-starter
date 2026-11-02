'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

export default function Home() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [members, setMembers] = useState([]);
  const [newPersonName, setNewPersonName] = useState('');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [selectedPayer, setSelectedPayer] = useState('');
  const [showBalances, setShowBalances] = useState(true);
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

  const currentUserName = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase() + session.user.name.slice(1)
    : 'Shiv';

  // Load groups for active user
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

    const memberGroupIds = myMemberships
      .filter((m) => m.user_id === session.user.id)
      .map((m) => m.group_id);

    let userGroups = allGroups.filter(
      (g) => g.created_by === session.user.id || memberGroupIds.includes(g.id)
    );

    // Seed default starter group if none exists
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

        // Starter members
        const starterMembers = [currentUserName, 'Aisha', 'Raj'];
        localStorage.setItem(
          `splitsmart.members.${defaultGroup.id}`,
          JSON.stringify(starterMembers)
        );

        // Starter expenses
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

  // Load members & expenses whenever selected group changes
  useEffect(() => {
    if (!session || !groupId) {
      setExpenses([]);
      setMembers([]);
      return;
    }

    // Load group members
    let loadedMembers = [];
    try {
      const mStored = localStorage.getItem(`splitsmart.members.${groupId}`);
      if (mStored) {
        loadedMembers = JSON.parse(mStored);
      }
    } catch {}

    if (!loadedMembers || loadedMembers.length === 0) {
      loadedMembers = [currentUserName, 'Aisha', 'Raj'];
      try {
        localStorage.setItem(`splitsmart.members.${groupId}`, JSON.stringify(loadedMembers));
      } catch {}
    }

    setMembers(loadedMembers);
    setSelectedPayer(loadedMembers[0] || currentUserName);

    // Load group expenses
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

  // Add person to current group
  const handleAddPerson = (e) => {
    e?.preventDefault();
    const cleanName = newPersonName.trim();
    if (!cleanName || !groupId) return;

    const formatted = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    if (members.some((m) => m.toLowerCase() === formatted.toLowerCase())) {
      alert(`${formatted} is already in this group.`);
      return;
    }

    const updated = [...members, formatted];
    setMembers(updated);
    try {
      localStorage.setItem(`splitsmart.members.${groupId}`, JSON.stringify(updated));
    } catch {}

    setNewPersonName('');
    setShowAddPerson(false);
  };

  // Remove person from group
  const handleRemovePerson = (personToRemove) => {
    if (members.length <= 1) {
      alert('Group must have at least one person.');
      return;
    }
    const updated = members.filter((m) => m !== personToRemove);
    setMembers(updated);
    if (selectedPayer === personToRemove) {
      setSelectedPayer(updated[0]);
    }
    try {
      localStorage.setItem(`splitsmart.members.${groupId}`, JSON.stringify(updated));
    } catch {}
  };

  // Instant Dummy Authentication
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

    const namePart = cleanEmail.split('@')[0];
    const safeId = 'u-' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    const dummyUser = {
      id: safeId,
      email: cleanEmail,
      name: namePart.charAt(0).toUpperCase() + namePart.slice(1),
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
    setMembers([]);
  };

  // Create a new group
  const createGroup = async () => {
    const name = prompt('Name your group (e.g. Goa Trip, Flat 304, Office Lunch):');
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

      // Initial members for newly created group
      localStorage.setItem(
        `splitsmart.members.${newGroup.id}`,
        JSON.stringify([currentUserName])
      );
    } catch {}

    // Background sync to Supabase
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

  // Join a group by code
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

        // Add current user to group members if not already there
        let currentMembers = [];
        const gm = localStorage.getItem(`splitsmart.members.${foundGroup.id}`);
        if (gm) currentMembers = JSON.parse(gm);
        if (!currentMembers.includes(currentUserName)) {
          currentMembers.push(currentUserName);
          localStorage.setItem(`splitsmart.members.${foundGroup.id}`, JSON.stringify(currentMembers));
        }
      } catch {}

      await loadGroups();
      setGroupId(foundGroup.id);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('join_group', { code: cleanCode });
      if (error) throw error;
      await loadGroups();
      setGroupId(data);
    } catch {
      alert('No group found with code: ' + cleanCode + '. Please check and try again.');
    }
  };

  // Add an expense
  const addExpense = async () => {
    const t = text.trim();
    if (!t || !groupId || isAdding) return;

    setIsAdding(true);
    try {
      let expenseName = '';
      let expenseAmount = 0;
      let detectedPayer = null;

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
          detectedPayer = data.paid_by;
        }
      } catch {}

      // Fallback regex parsing
      if (!expenseName) {
        const amountMatch = t.match(/\d[\d,]*(\.\d+)?/);
        expenseAmount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
        const rawName = t.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
        expenseName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      }

      // Determine payer: matched member, selected dropdown, or current user
      let finalPayer = selectedPayer || currentUserName;
      if (detectedPayer) {
        const matched = members.find(
          (m) => m.toLowerCase() === detectedPayer.toLowerCase()
        );
        if (matched) finalPayer = matched;
      }

      const newExp = {
        id: 'exp-' + Date.now(),
        user_id: session.user.id,
        group_id: groupId,
        name: expenseName,
        paid_by: finalPayer,
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
          paid_by: finalPayer,
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

  // Calculations for split & balances
  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const memberCount = Math.max(members.length, 1);
  const perPersonShare = total / memberCount;

  // Calculate balances per member
  const balances = members.map((member) => {
    const paid = expenses
      .filter((e) => (e.paid_by || '').toLowerCase() === member.toLowerCase())
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const net = paid - perPersonShare;
    return {
      member,
      paid,
      net,
    };
  });

  const currentGroup = groups.find((g) => g.id === groupId);

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
            Loading Shiv's SplitSmart…
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 1: Authentication Screen
  if (!session) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.brand}>
              <div style={styles.logo}>S</div>
              <div style={styles.title}>Shiv's SplitSmart</div>
            </div>
            <span style={styles.badge}>Live</span>
          </div>

          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
            Sign in to split group expenses and manage balances with your friends.
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
              Instant sign in enabled — no email confirmation required! 🚀
            </span>
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 2: Dashboard & Expense Splitter
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div style={styles.title}>Shiv's SplitSmart</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>
              👤 {currentUserName}
            </span>
            <button style={styles.signout} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {/* Group Selector & Creation */}
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

        {/* PEOPLE SECTION: Manage Members */}
        {groupId && (
          <div style={styles.peopleBox}>
            <div style={styles.peopleHeader}>
              <div style={styles.peopleTitle}>
                👥 People ({members.length})
                <span style={styles.splitSubtext}>
                  · {inr(perPersonShare)} / person
                </span>
              </div>
              {!showAddPerson && (
                <button
                  style={styles.addPersonBtn}
                  onClick={() => setShowAddPerson(true)}
                  title="Add friend to split expenses"
                >
                  + Add Person
                </button>
              )}
            </div>

            {/* Inline Add Person Form */}
            {showAddPerson && (
              <form onSubmit={handleAddPerson} style={styles.addPersonForm}>
                <input
                  style={styles.personInput}
                  type="text"
                  placeholder="Person's name (e.g. Priya, Rahul)"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  autoFocus
                />
                <button type="submit" style={styles.confirmAddBtn}>
                  Add
                </button>
                <button
                  type="button"
                  style={styles.cancelAddBtn}
                  onClick={() => {
                    setShowAddPerson(false);
                    setNewPersonName('');
                  }}
                >
                  ✕
                </button>
              </form>
            )}

            {/* Member Chips */}
            <div style={styles.memberChips}>
              {members.map((m) => (
                <div key={m} style={styles.memberChip}>
                  <span>{m === currentUserName ? `👤 ${m} (You)` : `👤 ${m}`}</span>
                  {members.length > 1 && (
                    <button
                      style={styles.removeMemberBtn}
                      onClick={() => handleRemovePerson(m)}
                      title={`Remove ${m}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expenses List & Add Expense */}
        {groupId ? (
          <>
            {/* Add Expense Row */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  Paid by:
                </span>
                <select
                  style={styles.payerSelect}
                  value={selectedPayer}
                  onChange={(e) => setSelectedPayer(e.target.value)}
                >
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {m === currentUserName ? `${m} (You)` : m}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                  Splits equally ({members.length} people)
                </span>
              </div>

              <div style={styles.addRow}>
                <input
                  style={styles.input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExpense()}
                  placeholder="Expense & amount (e.g. Dinner 1800 or Cab 400)…"
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
            </div>

            {/* Expenses List */}
            <div style={styles.list}>
              {expenses.length === 0 && (
                <div style={styles.empty}>No expenses in this group yet. Add one above!</div>
              )}
              {expenses.map((e) => (
                <div key={e.id} style={styles.item}>
                  <div style={styles.itemEmoji}>{e.emoji || '🧾'}</div>
                  <div style={styles.itemMain}>
                    <div style={styles.itemName}>{e.name}</div>
                    <div style={styles.itemPaid}>paid by <b>{e.paid_by}</b></div>
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

            {/* Total Banner */}
            <div style={styles.totalRow}>
              <div>
                <div style={styles.totalLabel}>Total Expenses</div>
                <div style={styles.totalNumber}>{inr(total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={styles.totalLabel}>Each Person's Share</div>
                <div style={styles.shareNumber}>{inr(perPersonShare)}</div>
              </div>
            </div>

            {/* Balances & Settlement Section */}
            <div style={styles.balancesSection}>
              <div
                style={styles.balancesHeader}
                onClick={() => setShowBalances(!showBalances)}
              >
                <span style={{ fontWeight: 800, fontSize: 14 }}>
                  📊 Settlement & Balances ({members.length})
                </span>
                <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>
                  {showBalances ? 'Hide ▲' : 'Show ▼'}
                </span>
              </div>

              {showBalances && (
                <div style={styles.balancesList}>
                  {balances.map((b) => {
                    const isPositive = b.net > 0.5;
                    const isNegative = b.net < -0.5;
                    return (
                      <div key={b.member} style={styles.balanceRow}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {b.member === currentUserName ? `${b.member} (You)` : b.member}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            Paid {inr(b.paid)}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          {isPositive && (
                            <span style={styles.getsBackBadge}>
                              gets back {inr(b.net)}
                            </span>
                          )}
                          {isNegative && (
                            <span style={styles.owesBadge}>
                              owes {inr(Math.abs(b.net))}
                            </span>
                          )}
                          {!isPositive && !isNegative && (
                            <span style={styles.settledBadge}>Settled</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
    padding: '24px 16px 48px',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    background: 'var(--card)',
    borderRadius: 24,
    boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)',
    border: '1px solid var(--line)',
    padding: 22,
    marginTop: 10,
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

  /* People Section */
  peopleBox: {
    background: '#f8fafc',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: '12px 14px',
    marginBottom: 16,
  },
  peopleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  peopleTitle: {
    fontSize: 13.5,
    fontWeight: 800,
    color: 'var(--ink)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  splitSubtext: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--blue)',
  },
  addPersonBtn: {
    border: 'none',
    background: 'rgba(28,95,212,.1)',
    color: 'var(--blue)',
    borderRadius: 8,
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  addPersonForm: {
    display: 'flex',
    gap: 6,
    marginBottom: 10,
  },
  personInput: {
    flex: 1,
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    background: '#fff',
  },
  confirmAddBtn: {
    border: 'none',
    background: 'var(--blue)',
    color: '#fff',
    borderRadius: 10,
    padding: '0 12px',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  cancelAddBtn: {
    border: '1px solid var(--line)',
    background: '#fff',
    color: 'var(--muted)',
    borderRadius: 10,
    padding: '0 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  memberChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#fff',
    border: '1px solid var(--line)',
    borderRadius: 20,
    padding: '4px 10px',
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--ink)',
  },
  removeMemberBtn: {
    border: 'none',
    background: 'none',
    color: 'var(--muted)',
    fontSize: 14,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },

  payerSelect: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '5px 8px',
    fontSize: 13,
    fontWeight: 700,
    background: '#f8fafc',
    color: 'var(--ink)',
    outline: 'none',
  },
  addRow: { display: 'flex', gap: 10 },
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

  /* Totals */
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid var(--line)',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  totalNumber: {
    fontWeight: 800,
    fontSize: 18,
    color: 'var(--ink)',
    marginTop: 2,
  },
  shareNumber: {
    fontWeight: 800,
    fontSize: 18,
    color: 'var(--blue)',
    marginTop: 2,
  },

  /* Balances Section */
  balancesSection: {
    marginTop: 18,
    background: '#f8fafc',
    borderRadius: 16,
    border: '1px solid var(--line)',
    padding: '12px 14px',
  },
  balancesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  balancesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTop: '1px solid var(--line)',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
  },
  getsBackBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: '#047857',
    background: '#d1fae5',
    padding: '4px 10px',
    borderRadius: 999,
  },
  owesBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: '#b45309',
    background: '#fef3c7',
    padding: '4px 10px',
    borderRadius: 999,
  },
  settledBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: '#6b7280',
    background: '#f3f4f6',
    padding: '4px 10px',
    borderRadius: 999,
  },
};
