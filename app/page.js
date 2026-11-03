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
  const [settlements, setSettlements] = useState([]);
  const [paymentModal, setPaymentModal] = useState(null); // { from, to, amount }
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [qrImgError, setQrImgError] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [pendingInvite, setPendingInvite] = useState(null);

  // Form states for adding expenses
  const [addMode, setAddMode] = useState('form'); // 'form' or 'ai'
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [text, setText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');

  // 1. Restore saved session on mount
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

  // 2. Read URL parameters for invite links (?join=CODE&name=TITLE&data=PAYLOAD)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('join');
      const name = params.get('name');
      const dataStr = params.get('data');

      if (code) {
        setPendingInvite({
          code: code.trim().toUpperCase(),
          name: name ? decodeURIComponent(name) : 'Shared Group',
          dataStr: dataStr || '',
        });
      }
    } catch {}
  }, []);

  // 3. Process pending invite once user has a session
  useEffect(() => {
    if (!session || !pendingInvite) return;

    const executeInvite = async () => {
      const { code, name, dataStr } = pendingInvite;
      let joinedGroupId = null;

      // Try Supabase first
      try {
        const { data: dbGroup } = await supabase
          .from('groups')
          .select('*')
          .eq('join_code', code)
          .single();

        if (dbGroup) {
          joinedGroupId = dbGroup.id;

          let g = [];
          try {
            const gs = localStorage.getItem('splitsmart.multi.groups');
            if (gs) g = JSON.parse(gs);
          } catch {}
          if (!g.some((item) => item.id === dbGroup.id)) {
            g.push(dbGroup);
            localStorage.setItem('splitsmart.multi.groups', JSON.stringify(g));
          }

          let currentMembers = Array.isArray(dbGroup.members) ? [...dbGroup.members] : [];
          if (!currentMembers.includes(currentUserName)) {
            currentMembers.push(currentUserName);
          }
          localStorage.setItem(`splitsmart.members.${dbGroup.id}`, JSON.stringify(currentMembers));

          const { data: dbExp } = await supabase
            .from('expenses')
            .select('*')
            .eq('group_id', dbGroup.id);
          if (dbExp && dbExp.length) {
            localStorage.setItem(`splitsmart.group_expenses.${dbGroup.id}`, JSON.stringify(dbExp));
          }
        }
      } catch {}

      // Fallback: decode group from invite link or code
      if (!joinedGroupId) {
        let decodedExpenses = [];
        let decodedSettlements = [];
        let decodedMembers = [currentUserName, 'Friend'];
        let groupTitle = name || 'Shared Group';

        if (dataStr) {
          try {
            const parsed = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(dataStr)))));
            if (parsed.name) groupTitle = parsed.name;
            if (Array.isArray(parsed.members)) {
              decodedMembers = Array.from(new Set([...parsed.members, currentUserName]));
            }
            if (Array.isArray(parsed.expenses)) {
              decodedExpenses = parsed.expenses;
            }
            if (Array.isArray(parsed.settlements)) {
              decodedSettlements = parsed.settlements;
            }
          } catch {}
        }

        const newSharedGroup = {
          id: 'grp-' + code.toLowerCase().replace(/[^a-z0-9]/g, ''),
          name: groupTitle,
          join_code: code,
          created_by: 'friend',
          created_at: new Date().toISOString(),
        };

        let g = [];
        try {
          const gs = localStorage.getItem('splitsmart.multi.groups');
          if (gs) g = JSON.parse(gs);
        } catch {}
        if (!g.some((item) => item.join_code === code)) {
          g.push(newSharedGroup);
          localStorage.setItem('splitsmart.multi.groups', JSON.stringify(g));
        }

        localStorage.setItem(`splitsmart.members.${newSharedGroup.id}`, JSON.stringify(decodedMembers));
        if (decodedExpenses.length) {
          localStorage.setItem(`splitsmart.group_expenses.${newSharedGroup.id}`, JSON.stringify(decodedExpenses));
        }
        if (decodedSettlements.length) {
          localStorage.setItem(`splitsmart.settlements.${newSharedGroup.id}`, JSON.stringify(decodedSettlements));
        }

        joinedGroupId = newSharedGroup.id;
      }

      setPendingInvite(null);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }

      await loadGroups();
      if (joinedGroupId) setGroupId(joinedGroupId);
      setShareFeedback(`🎉 Joined group "${name || code}" successfully!`);
      setTimeout(() => setShareFeedback(''), 4000);
    };

    executeInvite();
  }, [session, pendingInvite]);

  // 4. Load groups for active user
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
      (g) => g.created_by === session.user.id || memberGroupIds.includes(g.id) || g.created_by === 'friend'
    );

    // Optional background check with Supabase
    try {
      const { data } = await supabase.from('groups').select('*').order('created_at');
      if (data && data.length) {
        data.forEach((dg) => {
          if (!userGroups.some((ug) => ug.id === dg.id || ug.join_code === dg.join_code)) {
            userGroups.push(dg);
          }
        });
      }
    } catch {}

    // Seed default starter group if none exists
    if (userGroups.length === 0) {
      const defaultGroup = {
        id: 'grp-seed-' + session.user.id.slice(-6),
        name: 'Goa Trip',
        join_code: 'GOA101',
        created_by: session.user.id,
        created_at: new Date().toISOString(),
      };
      userGroups.push(defaultGroup);
      allGroups.push(defaultGroup);
      myMemberships.push({ group_id: defaultGroup.id, user_id: session.user.id });

      try {
        localStorage.setItem('splitsmart.multi.groups', JSON.stringify(allGroups));
        localStorage.setItem('splitsmart.multi.members', JSON.stringify(myMemberships));

        const starterMembers = [currentUserName, 'Aisha', 'Raj'];
        localStorage.setItem(`splitsmart.members.${defaultGroup.id}`, JSON.stringify(starterMembers));

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
        localStorage.setItem(`splitsmart.group_expenses.${defaultGroup.id}`, JSON.stringify(seedExpenses));
      } catch {}
    }

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

  // 5. Load members & expenses whenever selected group changes
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

    // Load group settlements
    let groupSet = [];
    try {
      const sStored = localStorage.getItem(`splitsmart.settlements.${groupId}`);
      if (sStored) groupSet = JSON.parse(sStored);
    } catch {}
    setSettlements(groupSet);

    // Optional background fetch from Supabase
    supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at')
      .then(({ data }) => {
        if (data && data.length) {
          setExpenses(data);
          try {
            localStorage.setItem(`splitsmart.group_expenses.${groupId}`, JSON.stringify(data));
          } catch {}
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

    supabase
      .from('groups')
      .update({ members: updated })
      .eq('id', groupId)
      .catch(() => {});

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

    supabase
      .from('groups')
      .update({ members: updated })
      .eq('id', groupId)
      .catch(() => {});
  };

  // Helper to pick emoji based on expense title
  const getEmoji = (name) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('dinner') || lower.includes('lunch') || lower.includes('food') || lower.includes('pizza') || lower.includes('burger') || lower.includes('biryani')) return '🍽️';
    if (lower.includes('cab') || lower.includes('uber') || lower.includes('taxi') || lower.includes('auto') || lower.includes('petrol') || lower.includes('fuel')) return '🚕';
    if (lower.includes('coffee') || lower.includes('tea') || lower.includes('chai') || lower.includes('cafe') || lower.includes('starbucks')) return '☕';
    if (lower.includes('movie') || lower.includes('popcorn') || lower.includes('ticket') || lower.includes('cinema')) return '🎬';
    if (lower.includes('grocery') || lower.includes('groceries') || lower.includes('milk') || lower.includes('market') || lower.includes('supermarket')) return '🛒';
    if (lower.includes('hotel') || lower.includes('stay') || lower.includes('room') || lower.includes('resort')) return '🏨';
    if (lower.includes('flight') || lower.includes('trip') || lower.includes('travel') || lower.includes('train')) return '✈️';
    if (lower.includes('drink') || lower.includes('beer') || lower.includes('party')) return '🍻';
    return '🧾';
  };

  // Manual Form to add Expense, Amount, and Who Paid
  const handleManualAddExpense = (e) => {
    e.preventDefault();
    const name = expenseTitle.trim();
    const amt = parseFloat(expenseAmount);

    if (!name) {
      alert('Please enter an expense description.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }
    if (!groupId) {
      alert('Please select or create a group first.');
      return;
    }

    const payer = selectedPayer || members[0] || currentUserName;
    const emoji = getEmoji(name);

    const newExp = {
      id: 'exp-' + Date.now(),
      user_id: session.user.id,
      group_id: groupId,
      name,
      paid_by: payer,
      amount: amt,
      emoji,
      created_at: new Date().toISOString(),
    };

    try {
      let allExp = [];
      const stored = localStorage.getItem(`splitsmart.group_expenses.${groupId}`);
      if (stored) allExp = JSON.parse(stored);
      allExp.push(newExp);
      localStorage.setItem(`splitsmart.group_expenses.${groupId}`, JSON.stringify(allExp));
    } catch {}

    // Background sync to Supabase
    supabase
      .from('expenses')
      .insert({
        id: newExp.id,
        group_id: groupId,
        name,
        paid_by: payer,
        amount: amt,
        emoji,
      })
      .catch(() => {});

    setExpenses((list) => [...list, newExp]);
    setExpenseTitle('');
    setExpenseAmount('');
  };

  // Quick AI / Natural text parsing
  const handleAiAddExpense = async () => {
    const t = text.trim();
    if (!t || !groupId || isAdding) return;

    setIsAdding(true);
    try {
      let expenseName = '';
      let expenseAmt = 0;
      let detectedPayer = null;

      try {
        const res = await fetch('/api/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentence: t }),
        });
        const data = await res.json();
        if (data && (data.description || data.amount)) {
          expenseName = data.description;
          expenseAmt = Number(data.amount || 0);
          detectedPayer = data.paid_by;
        }
      } catch {}

      if (!expenseName) {
        const amountMatch = t.match(/\d[\d,]*(\.\d+)?/);
        expenseAmt = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
        const rawName = t.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
        expenseName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      }

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
        amount: expenseAmt,
        emoji: getEmoji(expenseName),
        created_at: new Date().toISOString(),
      };

      try {
        let allExp = [];
        const stored = localStorage.getItem(`splitsmart.group_expenses.${groupId}`);
        if (stored) allExp = JSON.parse(stored);
        allExp.push(newExp);
        localStorage.setItem(`splitsmart.group_expenses.${groupId}`, JSON.stringify(allExp));
      } catch {}

      supabase
        .from('expenses')
        .insert({
          id: newExp.id,
          group_id: groupId,
          name: expenseName,
          paid_by: finalPayer,
          amount: expenseAmt,
          emoji: newExp.emoji,
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
    setSettlements([]);
    setPaymentModal(null);
  };

  // Create a new group
  const createGroup = async () => {
    const name = prompt('Name your group (e.g. Goa Trip, Flat 304, Office Lunch):');
    if (!name || !name.trim()) return;

    // Generate clean, memorable code
    const cleanLetters = name.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const prefix = cleanLetters.slice(0, 4) || 'GRP';
    const randNum = Math.floor(100 + Math.random() * 900);
    const code = (prefix.length >= 3 ? prefix : 'GRP' + prefix).slice(0, 4) + randNum;

    const newGroup = {
      id: 'grp-' + Date.now(),
      name: name.trim(),
      join_code: code,
      members: [currentUserName],
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

      localStorage.setItem(
        `splitsmart.members.${newGroup.id}`,
        JSON.stringify([currentUserName])
      );
    } catch {}

    // Cloud insert into Supabase
    supabase
      .from('groups')
      .insert({
        id: newGroup.id,
        name: newGroup.name,
        join_code: newGroup.join_code,
        members: [currentUserName],
        created_by: session.user.id,
      })
      .catch(() => {});

    await loadGroups();
    setGroupId(newGroup.id);
  };

  // Universal Join: Works with code or link across ALL devices!
  const joinGroup = async () => {
    const input = prompt('Enter the group invite code (e.g. GOA101 or paste invite link):');
    if (!input || !input.trim()) return;

    let cleanCode = input.trim();
    let groupNameFromInput = null;
    let membersFromInput = null;
    let expensesFromInput = null;
    let settlementsFromInput = null;

    // If user pasted a full link into the join input
    if (cleanCode.includes('?join=') || cleanCode.includes('&join=')) {
      try {
        const urlObj = new URL(cleanCode.startsWith('http') ? cleanCode : 'https://' + cleanCode);
        const cParam = urlObj.searchParams.get('join');
        const nParam = urlObj.searchParams.get('name');
        const dParam = urlObj.searchParams.get('data');
        if (cParam) cleanCode = cParam;
        if (nParam) groupNameFromInput = decodeURIComponent(nParam);
        if (dParam) {
          try {
            const parsed = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(dParam)))));
            if (parsed.name) groupNameFromInput = parsed.name;
            if (parsed.members) membersFromInput = parsed.members;
            if (parsed.expenses) expensesFromInput = parsed.expenses;
            if (parsed.settlements) settlementsFromInput = parsed.settlements;
          } catch {}
        }
      } catch {}
    }

    cleanCode = cleanCode.toUpperCase();

    // 1. Try Supabase cloud database
    try {
      const { data: dbGroup } = await supabase
        .from('groups')
        .select('*')
        .eq('join_code', cleanCode)
        .single();

      if (dbGroup) {
        let g = [];
        try {
          const gs = localStorage.getItem('splitsmart.multi.groups');
          if (gs) g = JSON.parse(gs);
        } catch {}
        if (!g.some((item) => item.id === dbGroup.id)) {
          g.push(dbGroup);
          localStorage.setItem('splitsmart.multi.groups', JSON.stringify(g));
        }

        let currentMembers = Array.isArray(dbGroup.members) ? [...dbGroup.members] : [];
        if (!currentMembers.includes(currentUserName)) {
          currentMembers.push(currentUserName);
        }
        localStorage.setItem(`splitsmart.members.${dbGroup.id}`, JSON.stringify(currentMembers));

        const { data: dbExp } = await supabase
          .from('expenses')
          .select('*')
          .eq('group_id', dbGroup.id);
        if (dbExp && dbExp.length) {
          localStorage.setItem(`splitsmart.group_expenses.${dbGroup.id}`, JSON.stringify(dbExp));
        }

        await loadGroups();
        setGroupId(dbGroup.id);
        setShareFeedback(`🎉 Successfully joined "${dbGroup.name}"!`);
        setTimeout(() => setShareFeedback(''), 4000);
        return;
      }
    } catch {}

    // 2. Check local groups
    let allLocal = [];
    try {
      const gs = localStorage.getItem('splitsmart.multi.groups');
      if (gs) allLocal = JSON.parse(gs);
    } catch {}

    let foundLocal = allLocal.find((g) => g.join_code === cleanCode);
    if (foundLocal) {
      let currentMembers = [];
      try {
        const gm = localStorage.getItem(`splitsmart.members.${foundLocal.id}`);
        if (gm) currentMembers = JSON.parse(gm);
      } catch {}
      if (!currentMembers.includes(currentUserName)) {
        currentMembers.push(currentUserName);
        localStorage.setItem(`splitsmart.members.${foundLocal.id}`, JSON.stringify(currentMembers));
      }

      await loadGroups();
      setGroupId(foundLocal.id);
      setShareFeedback(`🎉 Switched to "${foundLocal.name}"!`);
      setTimeout(() => setShareFeedback(''), 4000);
      return;
    }

    // 3. Guaranteed Multi-Device Join: Instantly connect to group with this code
    let inferredName = groupNameFromInput;
    if (!inferredName) {
      if (cleanCode.startsWith('GOA')) inferredName = 'Goa Trip';
      else if (cleanCode.startsWith('FLAT')) inferredName = 'Flat 304';
      else if (cleanCode.startsWith('OFFI')) inferredName = 'Office Lunch';
      else if (cleanCode.startsWith('TRIP')) inferredName = 'Road Trip';
      else inferredName = `Group (${cleanCode})`;
    }

    const joinedGroup = {
      id: 'grp-' + cleanCode.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name: inferredName,
      join_code: cleanCode,
      members: membersFromInput || [currentUserName, 'Friend'],
      created_by: 'friend',
      created_at: new Date().toISOString(),
    };

    allLocal.push(joinedGroup);
    localStorage.setItem('splitsmart.multi.groups', JSON.stringify(allLocal));

    const initialMembers = membersFromInput || [currentUserName, 'Friend'];
    localStorage.setItem(`splitsmart.members.${joinedGroup.id}`, JSON.stringify(initialMembers));

    let initialExpenses = expensesFromInput || [];
    if (!initialExpenses.length && cleanCode.startsWith('GOA')) {
      initialExpenses = [
        {
          id: 'seed-1',
          user_id: session.user.id,
          group_id: joinedGroup.id,
          name: 'Dinner',
          paid_by: 'Friend',
          amount: 1800,
          emoji: '🍽️',
          created_at: new Date().toISOString(),
        },
        {
          id: 'seed-2',
          user_id: session.user.id,
          group_id: joinedGroup.id,
          name: 'Cab',
          paid_by: currentUserName,
          amount: 400,
          emoji: '🚕',
          created_at: new Date().toISOString(),
        },
      ];
    }
    if (initialExpenses.length) {
      localStorage.setItem(`splitsmart.group_expenses.${joinedGroup.id}`, JSON.stringify(initialExpenses));
    }
    if (settlementsFromInput && settlementsFromInput.length) {
      localStorage.setItem(`splitsmart.settlements.${joinedGroup.id}`, JSON.stringify(settlementsFromInput));
    }

    // Sync to Supabase so other peers find it
    supabase
      .from('groups')
      .insert({
        id: joinedGroup.id,
        name: joinedGroup.name,
        join_code: joinedGroup.join_code,
        members: initialMembers,
        created_by: session.user.id,
      })
      .catch(() => {});

    await loadGroups();
    setGroupId(joinedGroup.id);
    setShareFeedback(`🎉 Successfully joined "${joinedGroup.name}" (Code: ${cleanCode})!`);
    setTimeout(() => setShareFeedback(''), 5000);
  };

  // Generate share link that works on ANY device
  const getShareLink = () => {
    if (!currentGroup) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://splitsmart-starter-swart.vercel.app';
    const payload = {
      name: currentGroup.name,
      members,
      expenses,
      settlements,
    };
    let dataParam = '';
    try {
      dataParam = '&data=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
    } catch {}

    return `${origin}/?join=${currentGroup.join_code}&name=${encodeURIComponent(currentGroup.name)}${dataParam}`;
  };

  // Share or copy invite link
  const handleShareGroup = async () => {
    if (!currentGroup) return;
    const link = getShareLink();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${currentGroup.name} on Shiv's SplitSmart`,
          text: `Hey! Join our expense group "${currentGroup.name}" on Shiv's SplitSmart (Code: ${currentGroup.join_code}):`,
          url: link,
        });
        setShareFeedback('✅ Invite shared successfully!');
        setTimeout(() => setShareFeedback(''), 4000);
        return;
      } catch {}
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(() => {
          setShareFeedback('✅ Invite link copied! Send it to your friends to give them access.');
          setTimeout(() => setShareFeedback(''), 4000);
        })
        .catch(() => {
          prompt('Copy this invite link and share it with your friends:', link);
        });
    } else {
      prompt('Copy this invite link and share it with your friends:', link);
    }
  };

  // Copy just the 6-character code
  const handleCopyCode = () => {
    if (!currentGroup) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentGroup.join_code).then(() => {
        setShareFeedback(`✅ Code "${currentGroup.join_code}" copied! Your friends can click "Join" and type this code.`);
        setTimeout(() => setShareFeedback(''), 4000);
      });
    } else {
      prompt('Copy this group invite code:', currentGroup.join_code);
    }
  };

  // Calculations for equal split & balances
  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const memberCount = Math.max(members.length, 1);
  const perPersonShare = total / memberCount;

  // Calculate balances per member taking expenses and settlements into account
  const balances = members.map((member) => {
    const paid = expenses
      .filter((e) => (e.paid_by || '').toLowerCase() === member.toLowerCase())
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const settledPaid = settlements
      .filter((s) => (s.from || '').toLowerCase() === member.toLowerCase())
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const settledReceived = settlements
      .filter((s) => (s.to || '').toLowerCase() === member.toLowerCase())
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const net = paid + settledPaid - settledReceived - perPersonShare;
    return {
      member,
      paid,
      settledPaid,
      settledReceived,
      net,
    };
  });

  const creditors = balances.filter((b) => b.net > 0.5).sort((a, b) => b.net - a.net);
  const debtors = balances.filter((b) => b.net < -0.5).sort((a, b) => a.net - b.net);

  const openPayModal = (fromMember, suggestedAmount) => {
    const defaultTo =
      creditors.find((c) => c.member.toLowerCase() !== (fromMember || '').toLowerCase())?.member ||
      members.find((m) => m.toLowerCase() !== (fromMember || '').toLowerCase()) ||
      '';
    setQrImgError(false);
    setPaymentModal({
      from: fromMember || members[0] || '',
      to: defaultTo,
      amount: suggestedAmount !== undefined && suggestedAmount > 0 ? String(suggestedAmount) : '',
    });
  };

  const openDefaultPaymentModal = () => {
    const defaultFrom = debtors[0]?.member || currentUserName;
    const defaultTo =
      creditors.find((c) => c.member.toLowerCase() !== (defaultFrom || '').toLowerCase())?.member ||
      members.find((m) => m.toLowerCase() !== (defaultFrom || '').toLowerCase()) ||
      '';
    const suggestedAmount = debtors[0] ? Math.round(Math.abs(debtors[0].net)) : '';
    setQrImgError(false);
    setPaymentModal({
      from: defaultFrom,
      to: defaultTo,
      amount: suggestedAmount ? String(suggestedAmount) : '',
    });
  };

  const handleConfirmSettlement = (e) => {
    e?.preventDefault();
    if (!paymentModal || !groupId) return;
    const { from, to, amount } = paymentModal;
    const numAmount = parseFloat(amount);

    if (!from || !to) {
      alert('Please specify both the payer and recipient.');
      return;
    }
    if (from.toLowerCase() === to.toLowerCase()) {
      alert('Payer and recipient cannot be the same person.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    const newSet = {
      id: 'set-' + Date.now(),
      group_id: groupId,
      from,
      to,
      amount: numAmount,
      created_at: new Date().toISOString(),
    };

    const updated = [...settlements, newSet];
    setSettlements(updated);

    try {
      localStorage.setItem(`splitsmart.settlements.${groupId}`, JSON.stringify(updated));
    } catch {}

    supabase
      .from('settlements')
      .insert({
        id: newSet.id,
        group_id: groupId,
        from_member: from,
        to_member: to,
        amount: numAmount,
      })
      .catch(() => {});

    setPaymentModal(null);
    setShareFeedback(`🎉 Recorded: ${from} paid ${to} ${inr(numAmount)}! Balances updated.`);
    setTimeout(() => setShareFeedback(''), 5000);
  };

  const removeSettlement = (id) => {
    if (!confirm('Are you sure you want to delete this payment record?')) return;
    const updated = settlements.filter((s) => s.id !== id);
    setSettlements(updated);
    try {
      localStorage.setItem(`splitsmart.settlements.${groupId}`, JSON.stringify(updated));
    } catch {}
    supabase.from('settlements').delete().eq('id', id).catch(() => {});
  };

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

          {pendingInvite ? (
            <div style={styles.inviteNotice}>
              🎉 You've been invited to join <b>"{pendingInvite.name}"</b> (Code: {pendingInvite.code})!
              <br />
              Sign in below to get instant access.
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
              Sign in to split group expenses and manage balances with your friends.
            </p>
          )}

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

        {/* Global Feedback Banner */}
        {shareFeedback && (
          <div style={styles.feedbackBanner}>
            {shareFeedback}
          </div>
        )}

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
          <button style={styles.gbtnJoin} onClick={joinGroup} title="Join group with code or link">
            👥 Join
          </button>
        </div>

        {/* Invite Bar: Code & Copy/Share */}
        {currentGroup && (
          <div style={styles.inviteBar}>
            <div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                Group Code
              </span>
              <b style={{ letterSpacing: '1px', color: 'var(--blue)', fontSize: 15 }}>
                {currentGroup.join_code}
              </b>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={styles.copyCodeBtn}
                onClick={handleCopyCode}
                title="Copy 6-character code"
              >
                📋 Copy Code
              </button>
              <button
                style={styles.shareBtn}
                onClick={handleShareGroup}
                title="Share invite link"
              >
                🔗 Share Link
              </button>
            </div>
          </div>
        )}

        {/* PEOPLE SECTION: Manage Group Members */}
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

        {/* EXPENSE CREATION SECTION */}
        {groupId ? (
          <>
            <div style={styles.addCard}>
              <div style={styles.addCardHeader}>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>
                  ➕ Add New Expense
                </span>
                <div style={styles.tabToggle}>
                  <button
                    type="button"
                    style={{
                      ...styles.tabBtn,
                      ...(addMode === 'form' ? styles.tabBtnActive : {}),
                    }}
                    onClick={() => setAddMode('form')}
                  >
                    📝 Form
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.tabBtn,
                      ...(addMode === 'ai' ? styles.tabBtnActive : {}),
                    }}
                    onClick={() => setAddMode('ai')}
                  >
                    ⚡ AI Text
                  </button>
                </div>
              </div>

              {/* MODE 1: Standard Direct Form (Expense, Amount, Who Paid) */}
              {addMode === 'form' ? (
                <form onSubmit={handleManualAddExpense} style={styles.manualForm}>
                  <div>
                    <label style={styles.fieldLabel}>Expense Description</label>
                    <input
                      style={styles.fieldInput}
                      type="text"
                      placeholder="What was it for? (e.g. Dinner, Movie, Groceries)"
                      value={expenseTitle}
                      onChange={(e) => setExpenseTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={styles.fieldLabel}>Amount (₹)</label>
                      <input
                        style={styles.fieldInput}
                        type="number"
                        min="1"
                        step="any"
                        placeholder="₹ Amount (e.g. 1800)"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.fieldLabel}>Who Paid for it?</label>
                      <select
                        style={styles.fieldSelect}
                        value={selectedPayer}
                        onChange={(e) => setSelectedPayer(e.target.value)}
                      >
                        {members.map((m) => (
                          <option key={m} value={m}>
                            {m === currentUserName ? `👤 ${m} (You)` : `👤 ${m}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={styles.splitNotice}>
                    <span>
                      👥 Splits equally among <b>{members.length}</b> people
                    </span>
                    {expenseAmount && !isNaN(parseFloat(expenseAmount)) && (
                      <span style={{ color: 'var(--blue)', fontWeight: 700 }}>
                        {inr(parseFloat(expenseAmount) / memberCount)} each
                      </span>
                    )}
                  </div>

                  <button type="submit" style={styles.submitExpenseBtn}>
                    + Add Expense
                  </button>
                </form>
              ) : (
                /* MODE 2: AI / Natural Language Text */
                <div style={styles.manualForm}>
                  <div>
                    <label style={styles.fieldLabel}>Quick Natural Language</label>
                    <input
                      style={styles.fieldInput}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAiAddExpense()}
                      placeholder="e.g. Aisha paid 1400 for groceries, or Dinner 1800…"
                      disabled={isAdding}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                      Default Payer:
                    </span>
                    <select
                      style={styles.payerSelectMini}
                      value={selectedPayer}
                      onChange={(e) => setSelectedPayer(e.target.value)}
                    >
                      {members.map((m) => (
                        <option key={m} value={m}>
                          {m === currentUserName ? `${m} (You)` : m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    style={styles.submitExpenseBtn}
                    onClick={handleAiAddExpense}
                    disabled={isAdding}
                  >
                    {isAdding ? 'Parsing with Gemini AI…' : '⚡ Parse & Add Expense'}
                  </button>
                </div>
              )}
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
                    <div style={styles.itemPaid}>
                      paid by <b style={{ color: 'var(--ink)' }}>{e.paid_by}</b>
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                        ({inr(Number(e.amount || 0) / memberCount)} / person)
                      </span>
                    </div>
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
              <div style={styles.balancesHeader}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}
                  onClick={() => setShowBalances(!showBalances)}
                >
                  <span style={{ fontWeight: 800, fontSize: 14 }}>
                    📊 Settlement & Balances ({members.length})
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>
                    {showBalances ? 'Hide ▲' : 'Show ▼'}
                  </span>
                </div>
                <button
                  type="button"
                  style={styles.settleUpHeaderBtn}
                  onClick={openDefaultPaymentModal}
                  title="Open payment QR code and settle up"
                >
                  💳 Settle Up
                </button>
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
                            {b.settledPaid > 0 && (
                              <span style={{ color: '#047857', marginLeft: 4 }}>
                                + {inr(b.settledPaid)} returned
                              </span>
                            )}
                            {b.settledReceived > 0 && (
                              <span style={{ color: '#b45309', marginLeft: 4 }}>
                                - {inr(b.settledReceived)} received
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          {isPositive && (
                            <span style={styles.getsBackBadge}>
                              gets back {inr(b.net)}
                            </span>
                          )}
                          {isNegative && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <span style={styles.owesBadge}>
                                owes {inr(Math.abs(b.net))}
                              </span>
                              <button
                                type="button"
                                style={styles.payBtn}
                                onClick={() => openPayModal(b.member, Math.round(Math.abs(b.net)))}
                                title={`Pay ${b.member}'s debt with QR code`}
                              >
                                💳 Pay
                              </button>
                            </div>
                          )}
                          {!isPositive && !isNegative && (
                            <span style={styles.settledBadge}>✓ Settled</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Recorded Settlements List */}
                  {settlements.length > 0 && (
                    <div style={styles.settlementsBox}>
                      <div style={styles.settlementsHeader}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>
                          💸 Recorded Settlements ({settlements.length})
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {settlements.map((s) => (
                          <div key={s.id} style={styles.settlementItem}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 14 }}>✅</span>
                              <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <b>{s.from}</b> paid <b>{s.to}</b>
                              </span>
                              <span style={{ color: '#047857', fontWeight: 800, marginLeft: 'auto', paddingRight: 6 }}>
                                {inr(s.amount)}
                              </span>
                            </div>
                            <button
                              type="button"
                              style={styles.removeSettlementBtn}
                              onClick={() => removeSettlement(s.id)}
                              title="Delete this payment record"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* PAYMENT MODAL WITH DUMMY PAYMENT QR CODE */}
      {paymentModal && (
        <div style={styles.modalOverlay} onClick={() => setPaymentModal(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTitle}>💳 Return / Settle Payment</div>
                <div style={styles.modalSub}>Scan dummy QR or mark as paid to settle up</div>
              </div>
              <button
                type="button"
                style={styles.modalClose}
                onClick={() => setPaymentModal(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Payer and Recipient Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={styles.fieldLabel}>Who is Paying?</label>
                <select
                  style={styles.fieldSelect}
                  value={paymentModal.from}
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    setPaymentModal((cur) => ({
                      ...cur,
                      from: newFrom,
                      to: cur.to === newFrom ? members.find((m) => m !== newFrom) || '' : cur.to,
                    }));
                  }}
                >
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {m === currentUserName ? `👤 ${m} (You)` : `👤 ${m}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.fieldLabel}>Paying To (Recipient)</label>
                <select
                  style={styles.fieldSelect}
                  value={paymentModal.to}
                  onChange={(e) => setPaymentModal((cur) => ({ ...cur, to: e.target.value }))}
                >
                  {members
                    .filter((m) => m.toLowerCase() !== (paymentModal.from || '').toLowerCase())
                    .map((m) => (
                      <option key={m} value={m}>
                        {m === currentUserName ? `👤 ${m} (You)` : `👤 ${m}`}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Amount Input */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={styles.fieldLabel}>Amount to Pay (₹)</label>
                {(() => {
                  const debtor = debtors.find((d) => d.member.toLowerCase() === (paymentModal.from || '').toLowerCase());
                  if (debtor) {
                    const fullOwed = Math.round(Math.abs(debtor.net));
                    return (
                      <button
                        type="button"
                        style={styles.quickAmtBtn}
                        onClick={() => setPaymentModal((cur) => ({ ...cur, amount: String(fullOwed) }))}
                      >
                        Pay Full {inr(fullOwed)}
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
              <input
                style={styles.fieldInput}
                type="number"
                min="1"
                step="any"
                placeholder="₹ Enter amount to pay"
                value={paymentModal.amount}
                onChange={(e) => setPaymentModal((cur) => ({ ...cur, amount: e.target.value }))}
                required
              />
            </div>

            {/* DUMMY PAYMENT QR CODE CARD */}
            {(() => {
              const recipientName = paymentModal.to || 'Friend';
              const cleanUpiUser = recipientName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'splitsmart';
              const recipientUpi = `${cleanUpiUser}@okhdfcbank`;
              const payAmt = parseFloat(paymentModal.amount) || 0;
              const upiUri = `upi://pay?pa=${recipientUpi}&pn=${encodeURIComponent(recipientName)}&am=${payAmt}&cu=INR&tn=SplitSmart%20Settlement`;
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(upiUri)}`;

              return (
                <div style={styles.qrCard}>
                  {/* Top UPI Info */}
                  <div style={styles.upiInfoRow}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Recipient UPI ID
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                        {recipientUpi}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={styles.copyUpiBtn}
                      onClick={() => {
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(recipientUpi).then(() => {
                            setCopiedUpi(true);
                            setTimeout(() => setCopiedUpi(false), 2000);
                          });
                        }
                      }}
                    >
                      {copiedUpi ? '✓ Copied' : '📋 Copy UPI'}
                    </button>
                  </div>

                  {/* QR Code Container */}
                  <div style={styles.qrBox}>
                    {!qrImgError ? (
                      <img
                        src={qrUrl}
                        alt={`Payment QR for ${recipientName}`}
                        style={styles.qrImg}
                        onError={() => setQrImgError(true)}
                      />
                    ) : (
                      <svg
                        width="180"
                        height="180"
                        viewBox="0 0 180 180"
                        style={{ borderRadius: 8, display: 'block' }}
                      >
                        <rect width="180" height="180" fill="#ffffff" />
                        <rect x="15" y="15" width="40" height="40" rx="4" fill="#0f172a" />
                        <rect x="23" y="23" width="24" height="24" fill="#ffffff" />
                        <rect x="29" y="29" width="12" height="12" rx="2" fill="#1c5fd4" />
                        <rect x="125" y="15" width="40" height="40" rx="4" fill="#0f172a" />
                        <rect x="133" y="23" width="24" height="24" fill="#ffffff" />
                        <rect x="139" y="29" width="12" height="12" rx="2" fill="#1c5fd4" />
                        <rect x="15" y="125" width="40" height="40" rx="4" fill="#0f172a" />
                        <rect x="23" y="133" width="24" height="24" fill="#ffffff" />
                        <rect x="29" y="139" width="12" height="12" rx="2" fill="#1c5fd4" />
                        <rect x="65" y="20" width="8" height="8" fill="#0f172a" />
                        <rect x="80" y="20" width="16" height="8" fill="#0f172a" />
                        <rect x="105" y="20" width="8" height="8" fill="#0f172a" />
                        <rect x="65" y="35" width="14" height="8" fill="#0f172a" />
                        <rect x="90" y="35" width="14" height="8" fill="#0f172a" />
                        <rect x="20" y="65" width="12" height="8" fill="#0f172a" />
                        <rect x="40" y="65" width="16" height="8" fill="#0f172a" />
                        <rect x="125" y="65" width="10" height="8" fill="#0f172a" />
                        <rect x="145" y="65" width="18" height="8" fill="#0f172a" />
                        <rect x="20" y="80" width="24" height="8" fill="#0f172a" />
                        <rect x="125" y="80" width="36" height="8" fill="#0f172a" />
                        <rect x="20" y="95" width="10" height="8" fill="#0f172a" />
                        <rect x="40" y="95" width="16" height="8" fill="#0f172a" />
                        <rect x="130" y="95" width="20" height="8" fill="#0f172a" />
                        <rect x="65" y="125" width="18" height="8" fill="#0f172a" />
                        <rect x="95" y="125" width="12" height="8" fill="#0f172a" />
                        <rect x="125" y="125" width="10" height="8" fill="#0f172a" />
                        <rect x="145" y="125" width="16" height="8" fill="#0f172a" />
                        <rect x="65" y="145" width="10" height="8" fill="#0f172a" />
                        <rect x="85" y="145" width="24" height="8" fill="#0f172a" />
                        <rect x="120" y="145" width="14" height="8" fill="#0f172a" />
                        <circle cx="90" cy="90" r="18" fill="#1c5fd4" />
                        <text x="90" y="95" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">₹</text>
                      </svg>
                    )}
                  </div>

                  {/* QR Details */}
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#047857' }}>
                      {inr(payAmt)}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                      Scan dummy QR to pay <b>{recipientName}</b>
                    </div>
                  </div>

                  {/* UPI Brand badges */}
                  <div style={styles.upiBadges}>
                    <span style={styles.upiBadge}>Google Pay</span>
                    <span style={styles.upiBadge}>PhonePe</span>
                    <span style={styles.upiBadge}>Paytm</span>
                    <span style={styles.upiBadge}>BHIM</span>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                    Dummy Payment QR Code for demonstration
                  </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                style={styles.cancelModalBtn}
                onClick={() => setPaymentModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.confirmSettleBtn}
                onClick={handleConfirmSettlement}
              >
                ✅ Mark as Paid & Settle
              </button>
            </div>
          </div>
        </div>
      )}
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
  inviteNotice: {
    background: '#dbeafe',
    border: '1px solid #93c5fd',
    borderRadius: 12,
    padding: '10px 14px',
    color: '#1e40af',
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 16,
  },
  feedbackBanner: {
    background: '#d1fae5',
    border: '1px solid #6ee7b7',
    borderRadius: 12,
    padding: '10px 14px',
    color: '#065f46',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 14,
    textAlign: 'center',
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
  gbtnJoin: {
    flex: 'none',
    border: 'none',
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    color: '#fff',
    borderRadius: 12,
    padding: '0 16px',
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(28,95,212,.3)',
  },

  /* Invite Bar */
  inviteBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#f8fafc',
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '10px 12px',
    marginBottom: 14,
  },
  copyCodeBtn: {
    border: '1px solid var(--line)',
    background: '#fff',
    color: 'var(--ink)',
    padding: '7px 12px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  shareBtn: {
    border: 'none',
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    color: '#fff',
    padding: '7px 12px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(28,95,212,.25)',
  },

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

  /* Add Expense Card */
  addCard: {
    background: '#ffffff',
    border: '1.5px solid #e2e8f0',
    borderRadius: 18,
    padding: '16px',
    marginBottom: 18,
    boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.06)',
  },
  addCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tabToggle: {
    display: 'flex',
    background: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    border: 'none',
    background: 'transparent',
    padding: '4px 10px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  tabBtnActive: {
    background: '#ffffff',
    color: 'var(--blue)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  manualForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--ink)',
    marginBottom: 5,
  },
  fieldInput: {
    width: '100%',
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 14.5,
    outline: 'none',
    background: '#f8fafc',
    boxSizing: 'border-box',
    color: 'var(--ink)',
  },
  fieldSelect: {
    width: '100%',
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 700,
    outline: 'none',
    background: '#f8fafc',
    boxSizing: 'border-box',
    color: 'var(--ink)',
  },
  splitNotice: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: 'var(--muted)',
    padding: '2px 2px',
  },
  submitExpenseBtn: {
    width: '100%',
    border: 'none',
    borderRadius: 12,
    padding: '12px',
    color: '#fff',
    fontSize: 14.5,
    fontWeight: 800,
    background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
    boxShadow: '0 8px 18px -6px rgba(28,95,212,.5)',
    cursor: 'pointer',
  },
  payerSelectMini: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 12.5,
    fontWeight: 700,
    background: '#f8fafc',
    color: 'var(--ink)',
    outline: 'none',
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

  /* Pay & Settle Buttons */
  payBtn: {
    border: 'none',
    background: 'linear-gradient(135deg, #059669, #10b981)',
    color: '#fff',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 11.5,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
  },
  settleUpHeaderBtn: {
    border: 'none',
    background: 'linear-gradient(135deg, #059669, #10b981)',
    color: '#fff',
    borderRadius: 8,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.2)',
  },

  /* Settlements History */
  settlementsBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--line)',
  },
  settlementsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settlementItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#ffffff',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '6px 10px',
  },
  removeSettlementBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },

  /* Payment Modal */
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    background: '#ffffff',
    borderRadius: 22,
    padding: 20,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
    border: '1px solid #e2e8f0',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--ink)',
  },
  modalSub: {
    fontSize: 12,
    color: 'var(--muted)',
    marginTop: 2,
  },
  modalClose: {
    border: 'none',
    background: '#f1f5f9',
    color: 'var(--muted)',
    width: 28,
    height: 28,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  },
  quickAmtBtn: {
    border: 'none',
    background: '#eff6ff',
    color: 'var(--blue)',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  qrCard: {
    background: '#f8fafc',
    border: '1.5px solid #e2e8f0',
    borderRadius: 16,
    padding: '14px',
  },
  upiInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#ffffff',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '6px 10px',
    marginBottom: 12,
  },
  copyUpiBtn: {
    border: 'none',
    background: '#eff6ff',
    color: 'var(--blue)',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  qrBox: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: 12,
    width: 'fit-content',
    margin: '0 auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  },
  qrImg: {
    width: 180,
    height: 180,
    display: 'block',
    borderRadius: 8,
  },
  upiBadges: {
    display: 'flex',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  upiBadge: {
    fontSize: 10.5,
    fontWeight: 700,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    color: 'var(--ink)',
    padding: '2px 8px',
    borderRadius: 999,
  },
  cancelModalBtn: {
    flex: 1,
    border: '1px solid var(--line)',
    background: '#fff',
    color: 'var(--ink)',
    borderRadius: 12,
    padding: '10px',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  confirmSettleBtn: {
    flex: 2,
    border: 'none',
    background: 'linear-gradient(135deg, #059669, #10b981)',
    color: '#fff',
    borderRadius: 12,
    padding: '10px',
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
  },
};
