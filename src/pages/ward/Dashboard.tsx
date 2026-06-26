import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import type { Issue } from "../../types";
import { generateReport } from "../../lib/generateReport";

const statusStyle: Record<string, { bg: string; text: string; border: string }> = {
  Reported:      { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
  Assigned:      { bg: "#E0F2FE", text: "#0369A1", border: "#BAE6FD" },
  "In Progress": { bg: "#FEF3C7", text: "#D97706", border: "#FDE68A" },
  Resolved:      { bg: "#D1FAE5", text: "#047857", border: "#A7F3D0" },
  Escalated:     { bg: "#FFE4E6", text: "#BE123C", border: "#FECDD3" },
};

const severityStyle: Record<string, { bg: string; text: string; border: string }> = {
  LOW:      { bg: "#D1FAE5", text: "#047857", border: "#A7F3D0" },
  MEDIUM:   { bg: "#FEF9C3", text: "#854D0E", border: "#FEF08A" },
  HIGH:     { bg: "#FFEDD5", text: "#C2410C", border: "#FED7AA" },
  CRITICAL: { bg: "#FFE4E6", text: "#BE123C", border: "#FECDD3" },
};

export default function WardDashboard() {
  const { user, logout } = useAuthStore();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "escalated" | "resolved">("all");
  const [activeTab, setActiveTab] = useState<"queue" | "report">("queue");
  const [reportLoading, setReportLoading] = useState(false);

  const fetchIssues = async () => {
    const snap = await getDocs(query(collection(db, "issues"), orderBy("priorityScore", "desc")));
    setIssues(snap.docs.map(d => {
      const data = d.data();
      const { imageBase64: _, ...rest } = data; // exclude heavy base64
      return { id: d.id, ...rest } as Issue;
    }));
    setLoading(false);
  };

  useEffect(() => { fetchIssues(); }, []);

  const updateStatus = async (id: string, status: string, extra?: Record<string, unknown>) => {
    await updateDoc(doc(db, "issues", id), { status, updatedAt: Date.now(), ...(extra || {}) });
    fetchIssues();
  };

  const handleDownloadReport = async () => {
    setReportLoading(true);
    await generateReport(issues, "Ward Officer Report", "Ward Dashboard");
    setReportLoading(false);
  };

  const filtered = issues.filter(i => {
    if (filter === "pending")   return ["Reported","Assigned","In Progress"].includes(i.status);
    if (filter === "escalated") return i.status === "Escalated";
    if (filter === "resolved")  return i.status === "Resolved";
    return true;
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .ward-container{min-height:100vh;background:#F4F7F9;font-family:'Inter',system-ui,sans-serif;padding-bottom:60px}
        @keyframes slideUpFade{0%{opacity:0;transform:translateY(15px)}100%{opacity:1;transform:translateY(0)}}
        .issue-card{transition:all 0.3s cubic-bezier(0.25,0.8,0.25,1);animation:slideUpFade 0.4s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0}
        .issue-card:hover{transform:translateY(-4px);box-shadow:0 12px 24px -8px rgba(0,0,0,0.12)}
        .btn-action{transition:all 0.2s ease;cursor:pointer}
        .btn-action:active{transform:scale(0.96)}
        .btn-action:hover{filter:brightness(1.05)}
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>

      <div className="ward-container">
        {/* HEADER */}
        <div style={{ background:"linear-gradient(135deg,#312E81 0%,#4F46E5 100%)", padding:"24px 20px 80px", position:"relative", overflow:"hidden", borderBottomLeftRadius:24, borderBottomRightRadius:24, boxShadow:"0 10px 30px rgba(79,70,229,0.2)" }}>
          <div style={{ position:"absolute", top:-40, right:-20, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0) 70%)" }} />
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:2 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ background:"rgba(255,255,255,0.2)", padding:8, borderRadius:12, backdropFilter:"blur(4px)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                </div><img src="/logo.png" alt="SunwAI" style={{ height:30, objectFit:"contain", filter:"brightness(0) invert(1)", marginRight:4 }} /><div><h1 style={{ color:"#fff", fontSize:20, fontWeight:800, margin:0 }}>Ward Officer</h1>
                <p style={{ color:"#C7D2FE", fontSize:12, margin:"2px 0 0", fontWeight:500 }}>{user?.displayName}</p>
              </div>
            </div>
            <button onClick={logout} className="btn-action" style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, padding:"8px 16px", color:"#fff", fontSize:13, fontWeight:600 }}>Logout</button>
          </div>
        </div>

        {/* STATS */}
        <div style={{ padding:"0 16px", marginTop:-48, position:"relative", zIndex:10 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {[
              { label:"Total",     value:issues.length,                                                              color:"#312E81" },
              { label:"Pending",   value:issues.filter(i=>["Reported","Assigned","In Progress"].includes(i.status)).length, color:"#D97706" },
              { label:"Escalated", value:issues.filter(i=>i.status==="Escalated").length,                            color:"#BE123C" },
              { label:"Resolved",  value:issues.filter(i=>i.status==="Resolved").length,                             color:"#047857" },
            ].map((s,idx)=>(
              <div key={s.label} style={{ background:"#fff", borderRadius:16, padding:"12px 8px", textAlign:"center", boxShadow:"0 4px 15px rgba(0,0,0,0.06)", border:"1px solid #E2E8F0", animation:`slideUpFade 0.4s ease forwards ${idx*0.1}s`, opacity:0 }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:10, fontWeight:700, color:"#64748B", marginTop:4, textTransform:"uppercase" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth:600, margin:"0 auto", padding:"24px 16px" }}>
          {/* Main tabs */}
          <div style={{ display:"flex", background:"#E2E8F0", borderRadius:16, padding:6, marginBottom:20, gap:4 }}>
            {(["queue","report"] as const).map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)} style={{ flex:1, padding:10, borderRadius:12, border:"none", fontSize:13, fontWeight:activeTab===t?700:600, cursor:"pointer", background:activeTab===t?"#fff":"transparent", color:activeTab===t?"#4F46E5":"#64748B", boxShadow:activeTab===t?"0 4px 12px rgba(0,0,0,0.05)":"none", transition:"all 0.3s ease" }}>
                {t==="queue"?"📋 Issue Queue":"📄 Report"}
              </button>
            ))}
          </div>

          {/* QUEUE TAB */}
          {activeTab === "queue" && (
            <>
              <div className="no-scrollbar" style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:16 }}>
                {(["all","pending","escalated","resolved"] as const).map(f=>{
                  const isActive = filter===f;
                  const escCount = issues.filter(i=>i.status==="Escalated").length;
                  return (
                    <button key={f} onClick={()=>setFilter(f)} style={{ background:isActive?"#4F46E5":"#fff", color:isActive?"#fff":"#475569", border:isActive?"1px solid #4F46E5":"1px solid #E2E8F0", padding:"8px 16px", borderRadius:20, fontSize:13, fontWeight:600, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, cursor:"pointer", boxShadow:isActive?"0 4px 12px rgba(79,70,229,0.25)":"none" }}>
                      {f.charAt(0).toUpperCase()+f.slice(1)}
                      {f==="escalated" && escCount>0 && <span style={{ background:"#EF4444", color:"#fff", fontSize:11, padding:"2px 6px", borderRadius:10, fontWeight:700 }}>{escCount}</span>}
                    </button>
                  );
                })}
              </div>

              {loading ? (
                <div style={{ textAlign:"center", padding:40 }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                  <p style={{ color:"#64748B", fontSize:14, fontWeight:500 }}>Loading...</p>
                </div>
              ) : filtered.length===0 ? (
                <div style={{ background:"#fff", borderRadius:20, padding:40, textAlign:"center", border:"2px dashed #CBD5E1" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                  <p style={{ color:"#475569", fontSize:15, fontWeight:600, margin:0 }}>No issues in this category.</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {filtered.map((issue,index)=>{
                    const sStyle = statusStyle[issue.status]||statusStyle.Reported;
                    const sevStyle = severityStyle[issue.severity]||severityStyle.MEDIUM;
                    const isEscalated = issue.status==="Escalated";
                    return (
                      <div key={issue.id} className="issue-card" style={{ background:"#fff", borderRadius:20, overflow:"hidden", border:isEscalated?"2px solid #FECDD3":"1px solid #E2E8F0", animationDelay:`${index*0.05}s`, boxShadow:isEscalated?"0 8px 24px rgba(225,29,72,0.08)":"none" }}>
                        {isEscalated && (
                          <div style={{ background:"#FFE4E6", padding:"10px 16px", display:"flex", alignItems:"center", gap:8 }}>
                            <span>🚨</span>
                            <span style={{ color:"#BE123C", fontSize:12, fontWeight:700 }}>ESCALATED TO MUNICIPAL CORPORATION</span>
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

                        <div style={{ padding:20 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, gap:12 }}>
                            <div>
                              <span style={{ fontSize:11, fontWeight:800, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.5px" }}>{issue.category} · {issue.department}</span>
                              <h3 style={{ fontSize:17, fontWeight:800, color:"#0F172A", margin:"4px 0 0", lineHeight:1.3 }}>{issue.title}</h3>
                            </div>
                            <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
                              <span style={{ background:sevStyle.bg, color:sevStyle.text, border:`1px solid ${sevStyle.border}`, padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:800, textTransform:"uppercase" }}>{issue.severity}</span>
                              <span style={{ background:sStyle.bg, color:sStyle.text, border:`1px solid ${sStyle.border}`, padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:800, textTransform:"uppercase" }}>{issue.status}</span>
                            </div>
                          </div>
                          <p style={{ fontSize:13, color:"#475569", lineHeight:1.5, margin:"0 0 16px" }}>{issue.description}</p>
                          <div style={{ background:"#F8FAFC", padding:12, borderRadius:12, marginBottom:16 }}>
                            <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                              <span>📍</span>
                              <span style={{ fontSize:12, color:"#334155", fontWeight:500, lineHeight:1.4 }}>{issue.location?.address||"Location unavailable"}</span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#64748B" }}>
                              <span>👤</span>
                              Reported by: <strong style={{ color:"#0F172A" }}>{issue.reporterName}</strong>
                            </div>
                            {(issue.verifications||0)>0 && (
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, background:"#D1FAE5", padding:"6px 10px", borderRadius:8, color:"#047857", fontSize:11, fontWeight:700 }}>
                                ✓ {issue.verifications} Citizen Confirmation{(issue.verifications||0)>1?"s":""}
                                {(issue.verifications||0)>=3?" · Community Verified":""}
                              </div>
                            )}
                          </div>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap", paddingTop:8, borderTop:"1px dashed #E2E8F0" }}>
                            {issue.status==="Reported" && <button onClick={()=>updateStatus(issue.id,"Assigned")} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#4F46E5,#4338CA)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700, boxShadow:"0 4px 12px rgba(79,70,229,0.2)" }}>Assign to Dept</button>}
                            {issue.status==="Assigned" && <button onClick={()=>updateStatus(issue.id,"In Progress")} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#D97706,#B45309)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Mark In Progress</button>}
                            {issue.status==="In Progress" && <button onClick={()=>updateStatus(issue.id,"Resolved",{resolvedAt:Date.now()})} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#10B981,#059669)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Mark Resolved</button>}
                            {issue.status==="Escalated" && <button onClick={()=>updateStatus(issue.id,"Assigned",{escalatedAt:null,escalationNote:null})} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#4F46E5,#4338CA)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Re-assign to Dept</button>}
                            {!["Resolved","Escalated"].includes(issue.status) && <button onClick={()=>updateStatus(issue.id,"Escalated",{escalatedAt:Date.now(),escalatedBy:user?.uid,escalationNote:"Escalated by Ward Officer"})} className="btn-action" style={{ flex:1, background:"#fff", color:"#BE123C", border:"1px solid #FECDD3", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Escalate Issue</button>}
                          </div>
                          <p style={{ fontSize:11, color:"#94A3B8", textAlign:"right", marginTop:16, fontWeight:500 }}>
                            {new Date(issue.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* REPORT TAB */}
          {activeTab==="report" && (
            <div style={{ background:"#fff", borderRadius:20, padding:24, border:"1px solid #E2E8F0", display:"flex", flexDirection:"column", gap:20 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:56, marginBottom:12 }}>📄</div>
                <h3 style={{ fontSize:20, fontWeight:800, color:"#0F172A", margin:"0 0 8px" }}>Ward Officer Report</h3>
                <p style={{ fontSize:13, color:"#64748B", margin:0 }}>AI-powered PDF with executive analysis, category breakdown and full issue list.</p>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { label:"Total Issues",  value:issues.length,                                        color:"#312E81", bg:"#F5F3FF" },
                  { label:"Resolved",      value:issues.filter(i=>i.status==="Resolved").length,        color:"#047857", bg:"#ECFDF5" },
                  { label:"Escalated",     value:issues.filter(i=>i.status==="Escalated").length,       color:"#BE123C", bg:"#FFF1F2" },
                  { label:"Critical",      value:issues.filter(i=>i.severity==="CRITICAL").length,      color:"#C2410C", bg:"#FFF7ED" },
                ].map(s=>(
                  <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"14px 16px", textAlign:"center", border:"1px solid rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:11, color:"#64748B", fontWeight:600, marginTop:4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:"#F5F3FF", borderRadius:14, padding:16, border:"1px solid #DDD6FE" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#4F46E5", margin:"0 0 8px" }}>🤖 AI Analysis included</p>
                <p style={{ fontSize:12, color:"#6D28D9", margin:0, lineHeight:1.5 }}>Gemma AI will analyze your issue data and generate an executive summary with actionable insights embedded in the PDF.</p>
              </div>
              <div style={{ background:"#F8FAFC", borderRadius:14, padding:16, border:"1px solid #E2E8F0" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#64748B", margin:"0 0 10px", textTransform:"uppercase", letterSpacing:"0.5px" }}>Report includes</p>
                {["Executive summary with key metrics","AI-generated analysis and recommendations","Category-wise breakdown with percentages","Status distribution analysis","Complete issue list with all details"].map(item=>(
                  <div key={item} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#4F46E5", flexShrink:0 }} />
                    <span style={{ fontSize:13, color:"#475569", fontWeight:500 }}>{item}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleDownloadReport} disabled={reportLoading} className="btn-action" style={{ width:"100%", background:reportLoading?"#94A3B8":"linear-gradient(135deg,#4F46E5,#4338CA)", border:"none", borderRadius:14, padding:16, color:"#fff", fontSize:15, fontWeight:700, cursor:reportLoading?"not-allowed":"pointer", boxShadow:reportLoading?"none":"0 8px 20px rgba(79,70,229,0.25)", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                {reportLoading ? (
                  <><span>⏳</span> Generating AI analysis...</>
                ) : (
                  <><span>⬇️</span> Download PDF Report</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}