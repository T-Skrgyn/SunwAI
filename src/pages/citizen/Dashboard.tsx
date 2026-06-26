import { useAuthStore } from "../../store/authStore";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, limit, doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Issue } from "../../types";
import { getLevel, ALL_BADGES, checkAndAwardBadges, getLeaderboard, getDailyMissions } from "../../lib/gamification";
import type { AppUser } from "../../types";

const statusColor: Record<string, { bg: string; text: string }> = {
  Reported:      { bg: "#F1F5F9", text: "#475569" },
  Assigned:      { bg: "#DBEAFE", text: "#1D4ED8" },
  "In Progress": { bg: "#FEF3C7", text: "#92400E" },
  Resolved:      { bg: "#D1FAE5", text: "#065F46" },
  Escalated:     { bg: "#FFE4E6", text: "#9F1239" },
};

export default function CitizenDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [nearbyIssues, setNearbyIssues] = useState<Issue[]>([]);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [leaderboard, setLeaderboard] = useState<(AppUser & { rank: number })[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"home" | "issues" | "verify" | "badges" | "leaderboard">("home");
  const [streakInfo, setStreakInfo] = useState<{ streak: number; bonusAwarded: boolean } | null>(null);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [verifyLoading, setVerifyLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    // My issues
    const mySnap = await getDocs(
      query(collection(db, "issues"), where("reportedBy", "==", user.uid), limit(50))
    );
    const myIssues = mySnap.docs.map(d => { const { imageBase64: _b, ...rest } = d.data(); return { id: d.id, ...rest } as Issue; });
    myIssues.sort((a, b) => b.createdAt - a.createdAt);
    setIssues(myIssues);

    // Nearby issues for verification
    const nearSnap = await getDocs(
      query(collection(db, "issues"), where("reportedBy", "!=", user.uid), limit(20))
    );
    const nearby = nearSnap.docs.map(d => { const { imageBase64: _b, ...rest } = d.data(); return { id: d.id, ...rest } as Issue; });
    nearby.sort((a, b) => b.createdAt - a.createdAt);
    setNearbyIssues(nearby);

    // Verified IDs
    const stored = localStorage.getItem(`verified_${user.uid}`);
    if (stored) setVerifiedIds(new Set(JSON.parse(stored)));

    // Check badges
    const awarded = await checkAndAwardBadges(user.uid, myIssues);
    if (awarded && awarded.length > 0) setNewBadges(awarded);

    // Leaderboard
    const lb = await getLeaderboard();
    setLeaderboard(lb as (AppUser & { rank: number })[]);

    // Missions
    const m = await getDailyMissions(user.uid, myIssues);
    setMissions(m);

    // Simulate streak retrieval for the UI
    setStreakInfo({ streak: 2, bonusAwarded: false }); 

    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const handleVerify = async (issue: Issue) => {
    if (!user || verifiedIds.has(issue.id) || verifyLoading) return;
    setVerifyLoading(issue.id);
    try {
      await updateDoc(doc(db, "issues", issue.id), {
        verifications: increment(1),
        updatedAt: Date.now(),
      });
      await updateDoc(doc(db, "users", user.uid), { points: increment(5) });

      const newVerified = new Set(verifiedIds);
      newVerified.add(issue.id);
      setVerifiedIds(newVerified);
      localStorage.setItem(`verified_${user.uid}`, JSON.stringify([...newVerified]));
      setNearbyIssues(prev =>
        prev.map(i => i.id === issue.id
          ? { ...i, verifications: ((i as any).verifications || 0) + 1 } as Issue
          : i
        )
      );
    } catch {}
    setVerifyLoading(null);
  };

  const level = getLevel(user?.points || 0);
  const resolved = issues.filter(i => i.status === "Resolved").length;
  const pending = issues.filter(i => i.status !== "Resolved").length;
  const earnedBadgeIds = new Set(user?.badges || []);

  const tabs = [
    { id: "home",        icon: "🏠", label: "Home"       },
    { id: "issues",      icon: "📋", label: "Issues"     },
    { id: "verify",      icon: "🔍", label: "Verify"     },
    { id: "badges",      icon: "🏅", label: "Badges"     },
    { id: "leaderboard", icon: "🏆", label: "Ranks"      },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F7F9", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes slideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .animate-slide { animation: slideDown 0.4s ease forwards; }
        .animate-fade { animation: fadeUp 0.3s ease forwards; }
        .tab-btn:hover { opacity:0.85; }
        .card-hover:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.1)!important; }
        .card-hover { transition:all 0.2s ease; }
        .no-scrollbar::-webkit-scrollbar { display:none; }
      `}</style>

      {/* New badge notification */}
      {newBadges.length > 0 && (
        <div className="animate-slide" style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "linear-gradient(135deg,#071D3A,#0F4C75)",
          color: "#fff", borderRadius: 16, padding: "12px 20px",
          zIndex: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          fontSize: 13, fontWeight: 600, textAlign: "center",
        }}>
          🎉 New badge earned: {ALL_BADGES.find(b => b.id === newBadges[0])?.label}!
        </div>
      )}

      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg,#071D3A 0%,#0F4C75 100%)",
        padding: "16px 20px 72px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -40, top: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.04)", zIndex: 1 }} />
        <div style={{ position: "absolute", right: 60, top: 40, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)", zIndex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative", zIndex: 10 }}>
          <div style={{ background: "#fff", padding: "4px 12px", borderRadius: "12px", display: "flex", alignItems: "center" }}>
               <img src="/logo.png" alt="SunwAI" style={{ height: 32, objectFit: "contain"}} />
            </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streakInfo && streakInfo.streak > 0 && (
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 10px", fontSize: 12, color: "#fff", fontWeight: 600 }}>
                🔥 {streakInfo.streak} day streak
              </div>
            )}
            {/* FIX: Ensure z-index is above background decorations to receive clicks */}
            <button onClick={handleLogout} style={{ position: "relative", zIndex: 20, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 20, padding: "6px 14px", color: "#fff", fontSize: 12, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background="rgba(255,255,255,0.2)"} onMouseOut={(e) => e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 10 }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, margin: "0 0 4px" }}>
            Namaste, {user?.displayName?.split(" ")[0]} 👋
          </p>

          {/* Level + points */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>{level.icon}</span>
                <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{level.name}</span>
              </div>
              <p style={{ color: "#fff", fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: -1 }}>
                {user?.points || 0}
                <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>points</span>
              </p>
              {level.next && (
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: "2px 0 0" }}>
                  {level.next.min - (user?.points || 0)} pts to {level.next.name}
                </p>
              )}
            </div>
            <div style={{ fontSize: 52 }}>
              {level.icon}
            </div>
          </div>

          {/* Level progress bar */}
          {level.next && (
            <div style={{ height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3,
                background: "linear-gradient(90deg,#10B981,#34D399)",
                width: `${level.progress}%`,
                transition: "width 1s ease",
              }} />
            </div>
          )}
        </div>
      </div>

      {/* STATS — overlap header */}
      <div className="animate-fade" style={{ padding: "0 16px", marginTop: -52, position: "relative", zIndex: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Reported", value: issues.length,  color: "#0F4C75" },
            { label: "Pending",  value: pending,         color: "#D97706" },
            { label: "Resolved", value: resolved,        color: "#059669" },
          ].map(s => (
            <div key={s.label} className="card-hover" style={{
              background: "#fff", borderRadius: 14, padding: "14px 10px",
              textAlign: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ padding: "14px 16px 0", position: "sticky", top: 0, zIndex: 40, background: "#F4F7F9", paddingBottom: "10px" }}>
        <div className="no-scrollbar" style={{ display: "flex", background: "#fff", borderRadius: 14, padding: 4, gap: 2, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className="tab-btn"
              style={{
                flex: 1, border: "none", borderRadius: 10, padding: "8px 4px",
                background: activeTab === t.id ? "linear-gradient(135deg,#071D3A,#0F4C75)" : "transparent",
                color: activeTab === t.id ? "#fff" : "#64748B",
                fontSize: 10, fontWeight: 600, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                whiteSpace: "nowrap", minWidth: 52, transition: "all 0.2s"
              }}>
              <span style={{ fontSize: 16, filter: activeTab === t.id ? "none" : "grayscale(100%)", opacity: activeTab === t.id ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: "4px 16px 100px" }}>

        {/* HOME TAB */}
        {activeTab === "home" && (
          <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Report CTA */}
            <button onClick={() => navigate("/citizen/report")} style={{
              background: "linear-gradient(135deg,#071D3A,#0F4C75)",
              border: "none", borderRadius: 18, padding: "20px 24px",
              display: "flex", alignItems: "center", gap: 16,
              cursor: "pointer", width: "100%", textAlign: "left",
              boxShadow: "0 8px 24px rgba(15,76,117,0.3)",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", right: -20, top: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
              <div style={{ width: 52, height: 52, background: "rgba(255,255,255,0.1)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>📷</div>
              <div>
                <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Report a Civic Issue</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Upload photo · AI auto-detects · +10 pts</div>
              </div>
              <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.5)", fontSize: 20 }}>→</div>
            </button>

            {/* Daily Missions */}
            {missions.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", padding: "10px 16px" }}>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>⚡ Daily Missions</span>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginLeft: 8 }}>Resets midnight</span>
                </div>
                {missions.map((m, i) => (
                  <div key={m.id} style={{
                    padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                    borderBottom: i < missions.length - 1 ? "1px solid #F1F5F9" : "none",
                    opacity: m.completed ? 0.6 : 1,
                  }}>
                    <span style={{ fontSize: 20 }}>{m.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", textDecoration: m.completed ? "line-through" : "none" }}>{m.label}</div>
                    </div>
                    <div style={{
                      background: m.completed ? "#D1FAE5" : "#DBEAFE",
                      color: m.completed ? "#065F46" : "#1D4ED8",
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    }}>
                      {m.completed ? "Done ✓" : `+${m.pts} pts`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Impact stats */}
            <div style={{ background: "linear-gradient(135deg,#E0F2FE,#E0F7FA)", borderRadius: 16, padding: 16, border: "1px solid #BAE6FD" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#0369A1", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Your Impact</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { icon: "🔧", label: "Issues Fixed", value: resolved },
                  { icon: "📍", label: "Reports Filed", value: issues.length },
                  { icon: "✅", label: "Verifications Given", value: verifiedIds.size },
                  { icon: "⭐", label: "Community Points", value: user?.points || 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.7)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent issues */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Recent Reports</span>
              {issues.length > 3 && (
                <button onClick={() => setActiveTab("issues")} style={{ background: "none", border: "none", color: "#0F4C75", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>View all →</button>
              )}
            </div>

            {loading ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 32, textAlign: "center", color: "#64748B" }}>Loading...</div>
            ) : issues.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏘️</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>No issues reported yet</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>Tap above to report your first civic issue</div>
              </div>
            ) : (
              issues.slice(0, 3).map(issue => {
                const sc = statusColor[issue.status] || statusColor.Reported;
                return (
                  <div key={issue.id} className="card-hover" style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{issue.title}</div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{issue.category} · {issue.department}</div>
                      </div>
                      <div style={{ background: sc.bg, color: sc.text, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                        {issue.status}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
                      {new Date(issue.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ISSUES TAB */}
        {activeTab === "issues" && (
          <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>All My Issues ({issues.length})</span>
            </div>
            {issues.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 13, color: "#64748B" }}>No issues reported yet</div>
              </div>
            ) : issues.map(issue => {
              const sc = statusColor[issue.status] || statusColor.Reported;
              return (
                <div key={issue.id} className="card-hover" style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  {issue.isMegaComplaint ? (
                    <div style={{ background:"linear-gradient(135deg,#DC2626,#F97316)", color:"#fff", padding:"8px 14px", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", gap:6 }}>
                      🔥 MEGA COMPLAINT · {issue.megaCount || 1} REPORTS · {issue.megaReporters?.length || 1} CITIZENS
                      <span style={{ marginLeft:"auto", background:"rgba(0,0,0,0.25)", padding:"2px 8px", borderRadius:8 }}>P{issue.priorityScore}/10</span>
                    </div>
                  ) : (
                    <div style={{ padding:"6px 14px", fontSize:11, fontWeight:700, color:"#475569", textAlign:"right", background:"#F8FAFC" }}>P{issue.priorityScore}/10</div>
                  )}

                  <div style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{issue.title}</div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{issue.category} · {issue.department}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>📍 {issue.location?.address?.slice(0, 45)}...</div>
                      </div>
                      <div style={{ background: sc.bg, color: sc.text, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{issue.status}</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px dashed #E2E8F0" }}>
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>
                        {new Date(issue.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 10,
                        background: issue.severity === "CRITICAL" ? "#FFE4E6" : issue.severity === "HIGH" ? "#FFEDD5" : issue.severity === "MEDIUM" ? "#FEF9C3" : "#D1FAE5",
                        color: issue.severity === "CRITICAL" ? "#9F1239" : issue.severity === "HIGH" ? "#C2410C" : issue.severity === "MEDIUM" ? "#854D0E" : "#065F46",
                      }}>{issue.severity} Priority</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VERIFY TAB */}
        {activeTab === "verify" && (
          <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "linear-gradient(135deg,#DBEAFE,#EDE9FE)", borderRadius: 14, padding: "14px 16px", border: "1px solid #BFDBFE" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>Help verify civic issues</div>
              <div style={{ fontSize: 11, color: "#3B82F6", marginTop: 4 }}>Earn +5 points per verification. Issues with 3+ verifications get priority.</div>
            </div>
            {nearbyIssues.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏘️</div>
                <div style={{ fontSize: 13, color: "#64748B" }}>No issues to verify yet</div>
              </div>
            ) : nearbyIssues.map(issue => {
              const verified = verifiedIds.has(issue.id);
              const verCount = (issue as any).verifications || 0;
              return (
                <div key={issue.id} className="card-hover" style={{
                  background: "#fff", borderRadius: 14, overflow: "hidden",
                  boxShadow: verCount >= 3 ? "0 2px 12px rgba(16,185,129,0.15)" : "0 2px 12px rgba(0,0,0,0.06)",
                  border: verCount >= 3 ? "1px solid #A7F3D0" : "1px solid transparent",
                }}>
                  {verCount >= 3 && (
                    <div style={{ background: "linear-gradient(90deg,#059669,#10B981)", padding: "6px 14px" }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✅ Community Verified · {verCount} verifications</span>
                    </div>
                  )}
                  {issue.isMegaComplaint ? (
                    <div style={{ background:"linear-gradient(135deg,#DC2626,#F97316)", color:"#fff", padding:"8px 14px", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", gap:6 }}>
                      🔥 MEGA COMPLAINT · {issue.megaCount || 1} REPORTS · {issue.megaReporters?.length || 1} CITIZENS
                      <span style={{ marginLeft:"auto", background:"rgba(0,0,0,0.25)", padding:"2px 8px", borderRadius:8 }}>P{issue.priorityScore}/10</span>
                    </div>
                  ) : (
                    <div style={{ padding:"6px 14px", fontSize:11, fontWeight:700, color:"#475569", textAlign:"right", background:"#F8FAFC" }}>P{issue.priorityScore}/10</div>
                  )}

                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{issue.title}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{issue.category} · {issue.department}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>By {issue.reporterName}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "#64748B" }}>
                        {verCount} verification{verCount !== 1 ? "s" : ""}
                        {Array.from({ length: Math.min(verCount, 5) }).map((_, i) => (
                          <span key={i} style={{ color: "#10B981", marginLeft: 2 }}>✓</span>
                        ))}
                      </div>
                      <button
                        onClick={() => handleVerify(issue)}
                        disabled={verified || verifyLoading === issue.id}
                        style={{
                          background: verified ? "#D1FAE5" : "linear-gradient(135deg,#10B981,#059669)",
                          border: "none", borderRadius: 20, padding: "7px 16px",
                          color: verified ? "#065F46" : "#fff", fontSize: 12, fontWeight: 700,
                          cursor: verified ? "not-allowed" : "pointer",
                          boxShadow: verified ? "none" : "0 4px 12px rgba(16,185,129,0.3)",
                        }}
                      >
                        {verifyLoading === issue.id ? "..." : verified ? "✓ Verified" : "Verify +5 pts"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* BADGES TAB */}
        {activeTab === "badges" && (
          <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Points + level card */}
            <div style={{
              background: "linear-gradient(135deg,#071D3A,#0F4C75)",
              borderRadius: 18, padding: "24px 20px",
              boxShadow: "0 8px 24px rgba(15,76,117,0.3)", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", right: -30, top: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 36 }}>{level.icon}</span>
                <div>
                  <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{level.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{user?.points || 0} points total</div>
                </div>
              </div>
              {level.next && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Progress to {level.next.name}</span>
                    <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{level.progress}%</span>
                  </div>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#10B981,#34D399)", width: `${level.progress}%`, transition: "width 1s ease" }} />
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 6 }}>
                    {level.next.min - (user?.points || 0)} more pts for {level.next.name} {level.next.icon}
                  </div>
                </>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                {[{ label: "+10", sub: "per report" }, { label: "+5", sub: "per verify" }, { label: "+25", sub: "3-day streak" }].map(p => (
                  <div key={p.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 14px", flex: 1, textAlign: "center" }}>
                    <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>{p.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>{p.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>All Badges ({ALL_BADGES.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {ALL_BADGES.map(badge => {
                const earned = badge.points >= 0
                  ? (user?.points || 0) >= badge.points
                  : earnedBadgeIds.has(badge.id);
                return (
                  <div key={badge.id} className="card-hover" style={{
                    background: earned ? "linear-gradient(135deg,#ECFDF5,#E0F2FE)" : "#F8FAFC",
                    borderRadius: 14, padding: 16, textAlign: "center",
                    border: earned ? "1px solid #A7F3D0" : "1px solid #E2E8F0",
                    opacity: earned ? 1 : 0.55,
                    boxShadow: earned ? "0 4px 14px rgba(16,185,129,0.12)" : "none",
                  }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>{badge.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: earned ? "#065F46" : "#64748B" }}>{badge.label}</div>
                    <div style={{ fontSize: 10, color: earned ? "#10B981" : "#94A3B8", marginTop: 4, lineHeight: 1.4 }}>{badge.desc}</div>
                    {earned && <div style={{ fontSize: 10, color: "#10B981", marginTop: 6, fontWeight: 700 }}>Earned ✓</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {activeTab === "leaderboard" && (
          <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "linear-gradient(135deg,#FEF9C3,#FEF3C7)", borderRadius: 14, padding: "12px 16px", border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>🏆 Community Leaderboard</div>
              <div style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>Top citizens by points this week</div>
            </div>

            {leaderboard.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
                <div style={{ fontSize: 13, color: "#64748B" }}>No data yet</div>
              </div>
            ) : leaderboard.map((citizen, i) => {
              const isMe = citizen.uid === user?.uid;
              const lvl = getLevel(citizen.points);
              return (
                <div key={citizen.uid} className="card-hover" style={{
                  background: isMe ? "linear-gradient(135deg,#DBEAFE,#EDE9FE)" : "#fff",
                  borderRadius: 14, padding: "14px 16px",
                  border: isMe ? "2px solid #93C5FD" : "1px solid #F1F5F9",
                  boxShadow: isMe ? "0 4px 16px rgba(59,130,246,0.15)" : "0 2px 8px rgba(0,0,0,0.05)",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : i === 2 ? "#CD7C2F" : "#E2E8F0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 800, color: i < 3 ? "#fff" : "#64748B",
                    flexShrink: 0,
                  }}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                      {citizen.displayName} {isMe && <span style={{ fontSize: 10, color: "#3B82F6", fontWeight: 600 }}>(You)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{lvl.icon} {lvl.name}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: isMe ? "#1D4ED8" : "#0F172A" }}>{citizen.points}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>points</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}