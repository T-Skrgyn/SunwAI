import { useEffect, useState } from "react";
import { collection, getDocs, query, doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import type { Issue } from "../../types";
import { generateReport } from "../../lib/generateReport";

const statusStyle: Record<string, { bg: string; text: string; border: string }> = {
  Reported:      { bg:"#F8FAFC", text:"#475569", border:"#E2E8F0" },
  Assigned:      { bg:"#E0F2FE", text:"#0369A1", border:"#BAE6FD" },
  "In Progress": { bg:"#FEF3C7", text:"#D97706", border:"#FDE68A" },
  Resolved:      { bg:"#D1FAE5", text:"#047857", border:"#A7F3D0" },
  Escalated:     { bg:"#FFE4E6", text:"#BE123C", border:"#FECDD3" },
};

const severityStyle: Record<string, { bg: string; text: string; border: string }> = {
  LOW:      { bg:"#D1FAE5", text:"#047857", border:"#A7F3D0" },
  MEDIUM:   { bg:"#FEF9C3", text:"#854D0E", border:"#FEF08A" },
  HIGH:     { bg:"#FFEDD5", text:"#C2410C", border:"#FED7AA" },
  CRITICAL: { bg:"#FFE4E6", text:"#BE123C", border:"#FECDD3" },
};

export default function DeptDashboard() {
  const { user, logout } = useAuthStore();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active"|"resolved"|"report">("active");
  const [reportLoading, setReportLoading] = useState(false);

  const fetchIssues = async () => {
    const snap = await getDocs(query(collection(db, "issues")));
    const all = snap.docs.map(d=>{ const { imageBase64: _b, ...rest } = d.data(); return {id:d.id,...rest} as Issue; });
    all.sort((a,b)=>b.priorityScore-a.priorityScore);
    setIssues(all);
    setLoading(false);
  };

  useEffect(()=>{fetchIssues();},[]);

  const markInProgress = async (id:string) => {
    await updateDoc(doc(db,"issues",id),{status:"In Progress",updatedAt:Date.now()});
    fetchIssues();
  };

  const markResolved = async (id:string) => {
    await updateDoc(doc(db,"issues",id),{status:"Resolved",resolvedAt:Date.now(),updatedAt:Date.now(),resolvedBy:user?.displayName});
    fetchIssues();
  };

  const handleDownloadReport = async () => {
    setReportLoading(true);
    await generateReport(issues,"Department Officer Report","Dept Dashboard");
    setReportLoading(false);
  };

  const active   = issues.filter(i=>["Assigned","In Progress"].includes(i.status));
  const resolved = issues.filter(i=>i.status==="Resolved");
  const displayed = tab==="active"?active:resolved;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .dept-container{min-height:100vh;background:#F4F7F9;font-family:'Inter',system-ui,sans-serif;padding-bottom:60px}
        @keyframes slideUpFade{0%{opacity:0;transform:translateY(15px)}100%{opacity:1;transform:translateY(0)}}
        .dept-card{transition:all 0.3s cubic-bezier(0.25,0.8,0.25,1);animation:slideUpFade 0.4s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0}
        .dept-card:hover{transform:translateY(-4px);box-shadow:0 12px 24px -8px rgba(0,0,0,0.12)}
        .btn-action{transition:all 0.2s ease;cursor:pointer}
        .btn-action:active{transform:scale(0.96)}
        .btn-action:hover{filter:brightness(1.05)}
      `}</style>

      <div className="dept-container">
        {/* HEADER */}
        <div style={{ background:"linear-gradient(135deg,#1E3A8A 0%,#2563EB 100%)", padding:"24px 20px 80px", position:"relative", overflow:"hidden", borderBottomLeftRadius:24, borderBottomRightRadius:24, boxShadow:"0 10px 30px rgba(37,99,235,0.2)" }}>
          <div style={{ position:"absolute", top:-40, left:-20, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0) 70%)" }} />
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:2 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ background:"rgba(255,255,255,0.2)", padding:8, borderRadius:12 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              </div>
              <div>
                </div><img src="/logo.png" alt="SunwAI" style={{ height:30, objectFit:"contain", filter:"brightness(0) invert(1)", marginRight:4 }} /><div><h1 style={{ color:"#fff", fontSize:20, fontWeight:800, margin:0 }}>Dept. Officer</h1>
                <p style={{ color:"#BFDBFE", fontSize:12, margin:"2px 0 0", fontWeight:500 }}>{user?.displayName}</p>
              </div>
            </div>
            <button onClick={logout} className="btn-action" style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, padding:"8px 16px", color:"#fff", fontSize:13, fontWeight:600 }}>Logout</button>
          </div>
        </div>

        {/* STATS */}
        <div style={{ padding:"0 16px", marginTop:-48, position:"relative", zIndex:10 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, maxWidth:600, margin:"0 auto" }}>
            {[
              { label:"Assigned",    value:issues.filter(i=>i.status==="Assigned").length,    color:"#1E40AF" },
              { label:"In Progress", value:issues.filter(i=>i.status==="In Progress").length, color:"#D97706" },
              { label:"Resolved",    value:resolved.length,                                   color:"#047857" },
            ].map((s,idx)=>(
              <div key={s.label} style={{ background:"#fff", borderRadius:16, padding:"16px 8px", textAlign:"center", boxShadow:"0 4px 15px rgba(0,0,0,0.06)", border:"1px solid #E2E8F0", animation:`slideUpFade 0.4s ease forwards ${idx*0.1}s`, opacity:0 }}>
                <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748B", marginTop:4, textTransform:"uppercase" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth:600, margin:"0 auto", padding:"24px 16px" }}>
          {/* TABS */}
          <div style={{ display:"flex", background:"#E2E8F0", borderRadius:16, padding:6, marginBottom:24, gap:4 }}>
            {([
              { key:"active",   label:`Active (${active.length})`   },
              { key:"resolved", label:`Resolved (${resolved.length})` },
              { key:"report",   label:"📄 Report"                    },
            ] as const).map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)} style={{ flex:1, padding:10, borderRadius:12, border:"none", fontSize:12, fontWeight:tab===t.key?700:600, cursor:"pointer", background:tab===t.key?"#fff":"transparent", color:tab===t.key?"#1E3A8A":"#64748B", boxShadow:tab===t.key?"0 4px 12px rgba(0,0,0,0.05)":"none", transition:"all 0.3s ease", whiteSpace:"nowrap" }}>{t.label}</button>
            ))}
          </div>

          {/* ACTIVE / RESOLVED */}
          {(tab==="active"||tab==="resolved") && (
            <>
              {loading ? (
                <div style={{ textAlign:"center", padding:40 }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                  <p style={{ color:"#64748B", fontSize:14, fontWeight:500 }}>Loading...</p>
                </div>
              ) : displayed.length===0 ? (
                <div style={{ background:"#fff", borderRadius:20, padding:48, textAlign:"center", border:"2px dashed #CBD5E1" }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>{tab==="active"?"✅":"📭"}</div>
                  <h3 style={{ fontSize:18, fontWeight:700, color:"#0F172A", margin:"0 0 8px" }}>{tab==="active"?"All Caught Up!":"No Resolved Issues"}</h3>
                  <p style={{ color:"#64748B", fontSize:14, margin:0 }}>{tab==="active"?"No pending tasks assigned right now.":"Resolved issues will appear here."}</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {displayed.map((issue,index)=>{
                    const sStyle = statusStyle[issue.status]||statusStyle.Reported;
                    const sevStyle = severityStyle[issue.severity]||severityStyle.MEDIUM;
                    return (
                      <div key={issue.id} className="dept-card" style={{ background:"#fff", borderRadius:20, overflow:"hidden", border:"1px solid #E2E8F0", animationDelay:`${index*0.05}s` }}>
                        {issue.isMegaComplaint ? (
                          <div style={{ background:"linear-gradient(135deg,#DC2626,#F97316)", color:"#fff", padding:"8px 14px", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", gap:6 }}>
                            🔥 MEGA COMPLAINT &nbsp;·&nbsp; {issue.megaCount || 1} REPORTS &nbsp;·&nbsp; {issue.megaReporters?.length || 1} CITIZENS
                            <span style={{ marginLeft:"auto", background:"rgba(0,0,0,0.25)", padding:"2px 8px", borderRadius:8 }}>P{issue.priorityScore}/10</span>
                          </div>
                        ) : (
                          <div style={{ padding:"6px 14px", fontSize:11, fontWeight:700, color:"#475569", textAlign:"right", background:"#F8FAFC" }}>P{issue.priorityScore}/10</div>
                        )}
                        <div style={{ padding:20 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, gap:12 }}>
                            <div>
                              <span style={{ fontSize:11, fontWeight:800, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.5px" }}>{issue.category}</span>
                              <h3 style={{ fontSize:17, fontWeight:800, color:"#0F172A", margin:"4px 0 0", lineHeight:1.3 }}>{issue.title}</h3>
                            </div>
                            <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
                              <span style={{ background:sevStyle.bg, color:sevStyle.text, border:`1px solid ${sevStyle.border}`, padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:800, textTransform:"uppercase" }}>{issue.severity}</span>
                              <span style={{ background:sStyle.bg, color:sStyle.text, border:`1px solid ${sStyle.border}`, padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:800, textTransform:"uppercase" }}>{issue.status}</span>
                            </div>
                          </div>
                          <p style={{ fontSize:13, color:"#475569", lineHeight:1.5, margin:"0 0 16px" }}>{issue.description}</p>
                          <div style={{ background:"#F8FAFC", padding:12, borderRadius:12, marginBottom:16, display:"flex", flexDirection:"column", gap:6 }}>
                            <div style={{ display:"flex", gap:8 }}><span>📍</span><span style={{ fontSize:12, color:"#334155", fontWeight:500 }}>{issue.location?.address||"Location unavailable"}</span></div>
                            <div style={{ display:"flex", gap:8, fontSize:12, color:"#64748B" }}><span>👤</span>Reported by: <strong style={{ color:"#0F172A" }}>{issue.reporterName}</strong></div>
                          </div>
                          {issue.status==="Resolved" ? (
                            <div style={{ background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:12, padding:"12px 16px" }}>
                              <div style={{ color:"#047857", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                Resolved by {issue.resolvedBy||"Department"}
                              </div>
                              {issue.resolvedAt && <div style={{ color:"#10B981", fontSize:11, fontWeight:600, marginTop:4 }}>{new Date(issue.resolvedAt).toLocaleString("en-IN")}</div>}
                            </div>
                          ) : (
                            <div style={{ display:"flex", gap:8, paddingTop:8, borderTop:"1px dashed #E2E8F0" }}>
                              {issue.status==="Assigned" && <button onClick={()=>markInProgress(issue.id)} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#D97706,#B45309)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Start Working</button>}
                              <button onClick={()=>markResolved(issue.id)} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#10B981,#059669)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Mark Resolved ✓</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* REPORT TAB */}
          {tab==="report" && (
            <div style={{ background:"#fff", borderRadius:20, padding:24, border:"1px solid #E2E8F0", display:"flex", flexDirection:"column", gap:20 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:56, marginBottom:12 }}>📄</div>
                <h3 style={{ fontSize:20, fontWeight:800, color:"#0F172A", margin:"0 0 8px" }}>Department Report</h3>
                <p style={{ fontSize:13, color:"#64748B", margin:0 }}>AI-powered PDF with task summary, category breakdown and full issue list.</p>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { label:"Total Tasks", value:issues.length,                                        color:"#1E3A8A", bg:"#EFF6FF" },
                  { label:"Resolved",    value:resolved.length,                                      color:"#047857", bg:"#ECFDF5" },
                  { label:"Active",      value:active.length,                                        color:"#D97706", bg:"#FFFBEB" },
                  { label:"Critical",    value:issues.filter(i=>i.severity==="CRITICAL").length,     color:"#BE123C", bg:"#FFF1F2" },
                ].map(s=>(
                  <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"14px 16px", textAlign:"center", border:"1px solid rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:11, color:"#64748B", fontWeight:600, marginTop:4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:"#EFF6FF", borderRadius:14, padding:16, border:"1px solid #BFDBFE" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#2563EB", margin:"0 0 8px" }}>🤖 AI Analysis included</p>
                <p style={{ fontSize:12, color:"#3B82F6", margin:0, lineHeight:1.5 }}>Gemma AI will analyze task data and generate performance insights and recommendations.</p>
              </div>
              <div style={{ background:"#F8FAFC", borderRadius:14, padding:16, border:"1px solid #E2E8F0" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#64748B", margin:"0 0 10px", textTransform:"uppercase", letterSpacing:"0.5px" }}>Report includes</p>
                {["Task summary with resolution rate","AI-generated performance analysis","Category-wise breakdown","Priority score distribution","Complete task list with timestamps"].map(item=>(
                  <div key={item} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#2563EB", flexShrink:0 }} />
                    <span style={{ fontSize:13, color:"#475569", fontWeight:500 }}>{item}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleDownloadReport} disabled={reportLoading} className="btn-action" style={{ width:"100%", background:reportLoading?"#94A3B8":"linear-gradient(135deg,#1E3A8A,#2563EB)", border:"none", borderRadius:14, padding:16, color:"#fff", fontSize:15, fontWeight:700, cursor:reportLoading?"not-allowed":"pointer", boxShadow:reportLoading?"none":"0 8px 20px rgba(37,99,235,0.25)", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                {reportLoading?<><span>⏳</span> Generating AI analysis...</>:<><span>⬇️</span> Download PDF Report</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}