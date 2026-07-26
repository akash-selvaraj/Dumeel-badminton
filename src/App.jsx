import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Trophy, LogOut, Lock, User, Check, X, Award, TrendingUp, Calendar, Shuffle, AlertCircle, Crown, Users, RefreshCw } from "lucide-react";
import { kvGet, kvSet } from "./storage.js";

// ---------- Fixed roster ----------
// Source of truth for who can log in. Edit these names and redeploy —
// the app seeds them into Redis on first run. Passwords are NOT stored
// here; each person sets their own on first login.
const FIXED_USERNAMES = ["Akash", "Aju", "Kathir", "Shiva", "Sivaraj", "Jagath", "Dhanush", "Divyanand",
                        "Monica", "Priya", "Preethi", "Sreenidhi", "Meera", "Surruthi", "Haarthy"];

// ---------- Palette / tokens ----------
const C = {
  bg: "#0A2540",
  bgElev: "#0F3258",
  bgElev2: "#154173",
  line: "#EDF1F4",
  accent: "#FFC93C",
  win: "#6FCF97",
  loss: "#F2777A",
  muted: "#8FA6C2",
  mutedDim: "#5E7A9C",
};

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pairKey(a, b) {
  return [a, b].sort().join("|");
}

// ---------- Fairness engine ----------
function computeStats(sessions) {
  const gamesPlayed = {};
  const partnerCount = {};
  Object.values(sessions).forEach((s) => {
    (s.games || []).forEach((g) => {
      if (g.status !== "confirmed") return;
      const all = [...g.teamA, ...g.teamB];
      all.forEach((id) => (gamesPlayed[id] = (gamesPlayed[id] || 0) + 1));
      const pairs = g.teamA.length === 2 ? [pairKey(g.teamA[0], g.teamA[1])] : [];
      const pairsB = g.teamB.length === 2 ? [pairKey(g.teamB[0], g.teamB[1])] : [];
      [...pairs, ...pairsB].forEach((k) => (partnerCount[k] = (partnerCount[k] || 0) + 1));
    });
  });
  return { gamesPlayed, partnerCount };
}

function pickNextGame(checkedIn, sessions, format) {
  const groupSize = format === "doubles" ? 4 : 2;
  if (checkedIn.length < groupSize) return null;
  const { gamesPlayed, partnerCount } = computeStats(sessions);
  const ranked = shuffle(checkedIn).sort((a, b) => (gamesPlayed[a] || 0) - (gamesPlayed[b] || 0));
  const chosen = ranked.slice(0, groupSize);
  const sitOut = checkedIn.filter((id) => !chosen.includes(id));

  if (format === "singles") {
    return { teamA: [chosen[0]], teamB: [chosen[1]], sitOut };
  }
  const [p1, p2, p3, p4] = chosen;
  const options = [
    { a: [p1, p2], b: [p3, p4] },
    { a: [p1, p3], b: [p2, p4] },
    { a: [p1, p4], b: [p2, p3] },
  ];
  const scored = options.map((o) => ({
    ...o,
    score: (partnerCount[pairKey(...o.a)] || 0) + (partnerCount[pairKey(...o.b)] || 0),
  }));
  scored.sort((x, y) => x.score - y.score);
  const best = scored[0];
  return { teamA: best.a, teamB: best.b, sitOut };
}

const CourtLines = ({ opacity = 0.5 }) => (
  <svg viewBox="0 0 400 24" preserveAspectRatio="none" style={{ width: "100%", height: 16, display: "block", opacity }}>
    <line x1="0" y1="4" x2="400" y2="4" stroke={C.line} strokeWidth="1" />
    <line x1="0" y1="12" x2="400" y2="12" stroke={C.line} strokeWidth="1" strokeDasharray="6 6" />
    <line x1="0" y1="20" x2="400" y2="20" stroke={C.line} strokeWidth="1.5" />
  </svg>
);

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState([]);
  const [sessions, setSessions] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState("today");

  const [authTarget, setAuthTarget] = useState(null);
  const [authPw, setAuthPw] = useState("");
  const [authPw2, setAuthPw2] = useState("");
  const [authErr, setAuthErr] = useState("");

  const [newFormat, setNewFormat] = useState("doubles");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [actionErr, setActionErr] = useState("");

  // ---------- Load ----------
  useEffect(() => {
    (async () => {
      try {
        let p = await kvGet("players");
        if (!Array.isArray(p) || p.length === 0) {
          p = FIXED_USERNAMES.map((name) => ({ id: uid(), name, passwordHash: null }));
          await kvSet("players", p);
        }
        let s = await kvGet("sessions");
        setPlayers(p);
        setSessions(s && typeof s === "object" ? s : {});
      } catch (e) {
        setError("Couldn't load saved data. Check the API/KV setup — see README.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const savePlayers = useCallback(async (next) => {
    setPlayers(next);
    try {
      await kvSet("players", next);
    } catch (e) {
      setError("Couldn't save. Your change may not persist.");
    }
  }, []);

  const saveSessions = useCallback(async (next) => {
    setSessions(next);
    try {
      await kvSet("sessions", next);
    } catch (e) {
      setError("Couldn't save. Your change may not persist.");
    }
  }, []);

  // ---------- Auth ----------
  const openAuth = (player) => {
    setAuthErr("");
    setAuthPw("");
    setAuthPw2("");
    setAuthTarget({ id: player.id, name: player.name, mode: player.passwordHash ? "verify" : "set" });
  };
  const submitAuth = async () => {
    if (!authTarget) return;
    if (authTarget.mode === "set") {
      if (authPw.length < 4) return setAuthErr("Use at least 4 characters.");
      if (authPw !== authPw2) return setAuthErr("Passwords don't match.");
      const hash = await sha256Hex(authPw);
      await savePlayers(players.map((p) => (p.id === authTarget.id ? { ...p, passwordHash: hash } : p)));
      setCurrentUser(authTarget.id);
      setAuthTarget(null);
    } else {
      const hash = await sha256Hex(authPw);
      const player = players.find((p) => p.id === authTarget.id);
      if (player && player.passwordHash === hash) {
        setCurrentUser(authTarget.id);
        setAuthTarget(null);
      } else {
        setAuthErr("Wrong password.");
      }
    }
  };

  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const today = todayKey();
  const session = sessions[today];
  const me = players.find((p) => p.id === currentUser);
  const isHost = session && session.hostId === currentUser;
  const activeGame = session?.games?.find((g) => g.status !== "confirmed");

  // ---------- Session actions ----------
  const bookToday = async () => {
    const next = { ...sessions, [today]: { date: today, hostId: currentUser, format: newFormat, checkedIn: [currentUser], games: [] } };
    await saveSessions(next);
  };

  const toggleCheckIn = async () => {
    if (!session) return;
    const checkedIn = session.checkedIn.includes(currentUser)
      ? session.checkedIn.filter((id) => id !== currentUser)
      : [...session.checkedIn, currentUser];
    await saveSessions({ ...sessions, [today]: { ...session, checkedIn } });
  };

  const generateGame = async () => {
    setActionErr("");
    if (!session || !isHost) return;
    if (activeGame) return setActionErr("Resolve the current game before generating the next one.");
    const picked = pickNextGame(session.checkedIn, sessions, session.format);
    if (!picked) return setActionErr(`Need at least ${session.format === "doubles" ? 4 : 2} checked-in players.`);
    const game = { id: uid(), format: session.format, ...picked, scoreA: null, scoreB: null, status: "proposed", confirmedBy: [], ts: Date.now() };
    await saveSessions({ ...sessions, [today]: { ...session, games: [...session.games, game] } });
  };

  const regenerateGame = async () => {
    setActionErr("");
    if (!session || !isHost || !activeGame || activeGame.status !== "proposed") return;
    const picked = pickNextGame(session.checkedIn, sessions, session.format);
    if (!picked) return;
    const games = session.games.map((g) => (g.id === activeGame.id ? { ...g, ...picked } : g));
    await saveSessions({ ...sessions, [today]: { ...session, games } });
  };

  const submitScore = async () => {
    setActionErr("");
    const sA = Number(scoreA), sB = Number(scoreB);
    if (scoreA === "" || scoreB === "" || Number.isNaN(sA) || Number.isNaN(sB) || sA < 0 || sB < 0) {
      return setActionErr("Enter a valid score for both sides.");
    }
    const games = session.games.map((g) => (g.id === activeGame.id ? { ...g, scoreA: sA, scoreB: sB, status: "awaiting_confirmation" } : g));
    await saveSessions({ ...sessions, [today]: { ...session, games } });
    setScoreA("");
    setScoreB("");
  };

  const confirmGame = async (gameId) => {
    const g = session.games.find((x) => x.id === gameId);
    if (!g) return;
    const participants = [...g.teamA, ...g.teamB];
    if (!participants.includes(currentUser) || g.confirmedBy.includes(currentUser)) return;
    const confirmedBy = [...g.confirmedBy, currentUser];
    const status = confirmedBy.length >= participants.length ? "confirmed" : "awaiting_confirmation";
    const games = session.games.map((x) => (x.id === gameId ? { ...x, confirmedBy, status } : x));
    await saveSessions({ ...sessions, [today]: { ...session, games } });
  };

  // ---------- Aggregates ----------
  const allConfirmed = useMemo(() => {
    const list = [];
    Object.values(sessions).forEach((s) => (s.games || []).forEach((g) => g.status === "confirmed" && list.push({ ...g, date: s.date })));
    return list.sort((a, b) => (a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1));
  }, [sessions]);

  const standings = useMemo(() => {
    const stat = {};
    players.forEach((p) => (stat[p.id] = { id: p.id, name: p.name, played: 0, wins: 0, losses: 0 }));
    allConfirmed.forEach((g) => {
      const aWins = g.scoreA > g.scoreB, bWins = g.scoreB > g.scoreA;
      g.teamA.forEach((id) => { if (stat[id]) { stat[id].played++; if (aWins) stat[id].wins++; else if (bWins) stat[id].losses++; } });
      g.teamB.forEach((id) => { if (stat[id]) { stat[id].played++; if (bWins) stat[id].wins++; else if (aWins) stat[id].losses++; } });
    });
    return Object.values(stat).filter((s) => s.played > 0).sort((x, y) => y.wins - x.wins || y.played - x.played);
  }, [players, allConfirmed]);

  const fontImport = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
      body { margin: 0; background: ${C.bg}; }
      .bt-display { font-family: 'Oswald', sans-serif; letter-spacing: 0.02em; }
      .bt-mono { font-family: 'JetBrains Mono', monospace; }
      .bt-body { font-family: 'Inter', sans-serif; }
      .bt-card { background: ${C.bgElev}; border: 1px solid ${C.bgElev2}; }
      .bt-chip { transition: all 0.15s ease; }
      .bt-input::placeholder { color: ${C.mutedDim}; }
    `}</style>
  );

  if (loading) {
    return (
      <div className="bt-body" style={{ minHeight: "100vh", background: C.bg, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {fontImport}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Shuffle size={28} style={{ color: C.accent }} />
          <span style={{ fontSize: 14 }}>Loading the roster…</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="bt-body" style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
        {fontImport}
        <div style={{ maxWidth: 512, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 16 }}>
            <Trophy size={30} style={{ color: C.accent, margin: "0 auto 8px" }} />
            <h1 className="bt-display" style={{ fontSize: 24, color: C.line, margin: 0 }}>Shuttle Log</h1>
            <p style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>Who's this?</p>
          </div>
          <CourtLines />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            {players.map((p) => (
              <button key={p.id} onClick={() => openAuth(p)} className="bt-card bt-chip" style={{ borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer" }}>
                <div className="bt-display" style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, background: C.bgElev2, color: C.accent, flexShrink: 0 }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: C.line, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: C.mutedDim }}>
                    <Lock size={10} /> {p.passwordHash ? "Sign in" : "Set password"}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {authTarget && (
            <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50, background: "rgba(5,15,30,0.7)" }}>
              <div className="bt-card" style={{ borderRadius: 12, padding: 24, maxWidth: 384, width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <h2 className="bt-display" style={{ fontSize: 18, color: C.line, margin: 0 }}>{authTarget.name}</h2>
                  <button onClick={() => setAuthTarget(null)} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
                </div>
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
                  {authTarget.mode === "set" ? "First time here — set a password only you know." : "Enter your password."}
                </p>
                <input autoFocus type="password" value={authPw} onChange={(e) => setAuthPw(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && authTarget.mode === "verify" && submitAuth()}
                  placeholder="Password" className="bt-input" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, marginBottom: 12, outline: "none", background: C.bg, border: `1px solid ${C.bgElev2}`, color: C.line, boxSizing: "border-box" }} />
                {authTarget.mode === "set" && (
                  <input type="password" value={authPw2} onChange={(e) => setAuthPw2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitAuth()}
                    placeholder="Confirm password" className="bt-input" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, marginBottom: 12, outline: "none", background: C.bg, border: `1px solid ${C.bgElev2}`, color: C.line, boxSizing: "border-box" }} />
                )}
                {authErr && <div style={{ fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, color: C.loss }}><AlertCircle size={13} /> {authErr}</div>}
                <button onClick={submitAuth} className="bt-display" style={{ width: "100%", padding: "10px 0", borderRadius: 8, fontWeight: 600, background: C.accent, color: C.bg, border: "none", cursor: "pointer" }}>
                  {authTarget.mode === "set" ? "Set password & sign in" : "Sign in"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bt-body" style={{ minHeight: "100vh", background: C.bg }}>
      {fontImport}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Trophy size={22} style={{ color: C.accent }} />
            <span className="bt-display" style={{ fontSize: 18, color: C.line }}>Shuttle Log</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: C.muted }}><User size={14} /> {me?.name}</span>
            <button onClick={() => setCurrentUser(null)} style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 4, color: C.mutedDim, background: "none", border: "none", cursor: "pointer" }}><LogOut size={14} /> Log out</button>
          </div>
        </div>

        {error && <div style={{ marginBottom: 16, fontSize: 12, padding: "8px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, background: "rgba(242,119,122,0.12)", color: C.loss }}><AlertCircle size={13} /> {error}</div>}

        <div className="bt-card" style={{ display: "flex", gap: 4, marginBottom: 16, borderRadius: 8, padding: 4 }}>
          {[{ id: "today", label: "Today", icon: Calendar }, { id: "history", label: "History", icon: Trophy }, { id: "standings", label: "Standings", icon: Award }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="bt-display" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 6, fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer", background: tab === t.id ? C.bgElev2 : "transparent", color: tab === t.id ? C.accent : C.muted }}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === "today" && (
          <div>
            {!session && (
              <div className="bt-card" style={{ borderRadius: 12, padding: 24, textAlign: "center" }}>
                <Crown size={26} style={{ color: C.accent, margin: "0 auto 8px" }} />
                <h2 className="bt-display" style={{ fontSize: 18, color: C.line, marginBottom: 4 }}>No session booked for today</h2>
                <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>Whoever booked the court hosts today's games and generates teams.</p>
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                  {["doubles", "singles"].map((f) => (
                    <button key={f} onClick={() => setNewFormat(f)} className="bt-display" style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, textTransform: "capitalize", border: "none", cursor: "pointer", background: newFormat === f ? C.accent : C.bgElev2, color: newFormat === f ? C.bg : C.muted }}>
                      {f}
                    </button>
                  ))}
                </div>
                <button onClick={bookToday} className="bt-display" style={{ padding: "10px 20px", borderRadius: 8, fontWeight: 600, background: C.accent, color: C.bg, border: "none", cursor: "pointer" }}>
                  Host today's session
                </button>
              </div>
            )}

            {session && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="bt-card" style={{ borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: C.muted }}>
                      <Crown size={14} style={{ color: C.accent }} /> Hosted by <span style={{ color: C.line, fontWeight: 600 }}>{nameOf(session.hostId)}</span>
                    </span>
                    <span className="bt-display" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 4, background: C.bgElev2, color: C.muted }}>{session.format}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: C.mutedDim }}><Users size={12} /> {session.checkedIn.length} checked in</span>
                    <button onClick={toggleCheckIn} className="bt-display" style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, fontWeight: 600, border: "none", cursor: "pointer", background: session.checkedIn.includes(currentUser) ? C.bgElev2 : C.win, color: session.checkedIn.includes(currentUser) ? C.muted : C.bg }}>
                      {session.checkedIn.includes(currentUser) ? "Check out" : "I'm in"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {session.checkedIn.map((id) => (
                      <span key={id} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: C.bg, color: C.line }}>{nameOf(id)}</span>
                    ))}
                  </div>
                </div>

                {isHost && !activeGame && (
                  <button onClick={generateGame} className="bt-display" style={{ width: "100%", padding: "10px 0", borderRadius: 8, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.accent, color: C.bg, border: "none", cursor: "pointer" }}>
                    <Shuffle size={16} /> Generate next game
                  </button>
                )}
                {actionErr && <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, justifyContent: "center", color: C.loss }}><AlertCircle size={13} /> {actionErr}</div>}

                {activeGame && (
                  <div className="bt-card" style={{ borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span className="bt-display" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: C.accent }}>
                        {activeGame.status === "proposed" ? "Up next" : "Awaiting confirmation"}
                      </span>
                      {isHost && activeGame.status === "proposed" && (
                        <button onClick={regenerateGame} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: C.mutedDim, background: "none", border: "none", cursor: "pointer" }}><RefreshCw size={11} /> Reshuffle</button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: C.line }}>{activeGame.teamA.map(nameOf).join(" & ")}</span>
                      <span className="bt-mono" style={{ fontSize: 14, padding: "0 8px", color: C.mutedDim }}>vs</span>
                      <span style={{ fontSize: 14, fontWeight: 500, flex: 1, textAlign: "right", color: C.line }}>{activeGame.teamB.map(nameOf).join(" & ")}</span>
                    </div>
                    {activeGame.sitOut?.length > 0 && (
                      <p style={{ fontSize: 12, marginBottom: 12, color: C.mutedDim }}>Sitting out: {activeGame.sitOut.map(nameOf).join(", ")}</p>
                    )}

                    {activeGame.status === "proposed" && isHost && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
                          <input type="number" min="0" value={scoreA} onChange={(e) => setScoreA(e.target.value)} placeholder="0" className="bt-mono bt-input" style={{ fontSize: 20, width: 64, textAlign: "center", padding: "6px 0", borderRadius: 8, outline: "none", background: C.bg, border: `1px solid ${C.bgElev2}`, color: C.line }} />
                          <span style={{ color: C.mutedDim }}>—</span>
                          <input type="number" min="0" value={scoreB} onChange={(e) => setScoreB(e.target.value)} placeholder="0" className="bt-mono bt-input" style={{ fontSize: 20, width: 64, textAlign: "center", padding: "6px 0", borderRadius: 8, outline: "none", background: C.bg, border: `1px solid ${C.bgElev2}`, color: C.line }} />
                        </div>
                        <button onClick={submitScore} className="bt-display" style={{ width: "100%", padding: "8px 0", borderRadius: 8, fontWeight: 600, background: C.accent, color: C.bg, border: "none", cursor: "pointer" }}>Submit score</button>
                      </div>
                    )}

                    {activeGame.status === "awaiting_confirmation" && (
                      <div>
                        <div className="bt-mono" style={{ fontSize: 24, textAlign: "center", marginBottom: 12, color: C.line }}>{activeGame.scoreA} – {activeGame.scoreB}</div>
                        {[...activeGame.teamA, ...activeGame.teamB].includes(currentUser) && !activeGame.confirmedBy.includes(currentUser) ? (
                          <button onClick={() => confirmGame(activeGame.id)} className="bt-display" style={{ width: "100%", padding: "8px 0", borderRadius: 8, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.win, color: C.bg, border: "none", cursor: "pointer" }}>
                            <Check size={15} /> Confirm result
                          </button>
                        ) : (
                          <p style={{ fontSize: 12, textAlign: "center", color: C.mutedDim }}>
                            {activeGame.confirmedBy.length}/{activeGame.teamA.length + activeGame.teamB.length} players confirmed
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {session.games.filter((g) => g.status === "confirmed").length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, marginBottom: 8, color: C.mutedDim }}>Earlier today</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {session.games.filter((g) => g.status === "confirmed").reverse().map((g) => (
                        <div key={g.id} className="bt-card" style={{ borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                          <span style={{ color: g.scoreA > g.scoreB ? C.accent : C.muted }}>{g.teamA.map(nameOf).join(" & ")}</span>
                          <span className="bt-mono" style={{ color: C.line }}>{g.scoreA}–{g.scoreB}</span>
                          <span style={{ color: g.scoreB > g.scoreA ? C.win : C.muted }}>{g.teamB.map(nameOf).join(" & ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {allConfirmed.length === 0 && <div className="bt-card" style={{ borderRadius: 12, padding: 32, textAlign: "center", fontSize: 14, color: C.muted }}>No confirmed games yet.</div>}
            {allConfirmed.map((g) => (
              <div key={g.id} className="bt-card" style={{ borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: C.mutedDim }}>{fmtDate(g.date)}</span>
                  <span className="bt-display" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 4, background: C.bgElev2, color: C.muted }}>{g.format}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: g.scoreA > g.scoreB ? C.accent : C.line, fontWeight: g.scoreA > g.scoreB ? 600 : 400 }}>{g.teamA.map(nameOf).join(" & ")}</span>
                  <span className="bt-mono" style={{ fontSize: 18, padding: "0 12px", color: C.line }}>{g.scoreA} – {g.scoreB}</span>
                  <span style={{ fontSize: 14, flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: g.scoreB > g.scoreA ? C.win : C.line, fontWeight: g.scoreB > g.scoreA ? 600 : 400 }}>{g.teamB.map(nameOf).join(" & ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "standings" && (
          <div className="bt-card" style={{ borderRadius: 12, overflow: "hidden" }}>
            <div className="bt-display" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", padding: "8px 16px", background: C.bgElev2, color: C.muted }}>
              <span>Player</span><span style={{ textAlign: "center" }}>W–L</span><span style={{ textAlign: "right" }}>Win %</span>
            </div>
            {standings.length === 0 && <div style={{ padding: 32, textAlign: "center", fontSize: 14, color: C.muted }}>No results yet.</div>}
            {standings.map((s, i) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", alignItems: "center", padding: "12px 16px", fontSize: 14, borderTop: `1px solid ${C.bgElev2}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: C.line }}>{i === 0 && <TrendingUp size={13} style={{ color: C.accent }} />}{s.name}</span>
                <span className="bt-mono" style={{ textAlign: "center", color: C.muted }}>{s.wins}–{s.losses}</span>
                <span className="bt-mono" style={{ textAlign: "right", color: C.line }}>{Math.round((s.wins / s.played) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
