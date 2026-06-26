import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import type { Issue } from "../../types";
import { generateReport } from "../../lib/generateReport";
import HeatMap from "../../components/map/HeatMap";

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

export default function CorpDashboard() {
  const { user, logout } = useAuthStore();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"escalated"|"all"|"stats"|"heatmap"|"report">("escalated");
  const [reportLoading, setReportLoading] = useState(false);

  const fetchIssues = async () => {
    const snap = await getDocs(query(collection(db,"issues"),orderBy("createdAt","desc")));
    setIssues(snap.docs.map(d=>{ const { imageBase64: _b, ...rest } = d.data(); return {id:d.id,...rest} as Issue; }));
    setLoading(false);
  };

  useEffect(()=>{fetchIssues();},[]);

  const forceResolve = async (id:string) => {
    await updateDoc(doc(db,"issues",id),{status:"Resolved",resolvedAt:Date.now(),updatedAt:Date.now(),resolvedBy:"Municipal Corporation",resolutionNote:"Force resolved by Municipal Corporation"});
    fetchIssues();
  };

  const sendBackToWard = async (id:string) => {
    await updateDoc(doc(db,"issues",id),{status:"Assigned",updatedAt:Date.now(),escalatedAt:null,escalationNote:null,corpNote:"Sent back to Ward Officer by Municipal Corporation"});
    fetchIssues();
  };

  const handleDownloadReport = async () => {
    setReportLoading(true);
    await generateReport(issues,"Municipal Corporation Report","City Dashboard");
    setReportLoading(false);
  };

  const escalated = issues.filter(i=>i.status==="Escalated");
  const resolved  = issues.filter(i=>i.status==="Resolved").length;
  const rate      = issues.length?Math.round((resolved/issues.length)*100):0;
  const cats      = [...new Set(issues.map(i=>i.category))];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .corp-container{min-height:100vh;background:#F4F7F9;font-family:'Inter',system-ui,sans-serif;padding-bottom:60px}
        @keyframes slideUpFade{0%{opacity:0;transform:translateY(15px)}100%{opacity:1;transform:translateY(0)}}
        .corp-card{transition:all 0.3s cubic-bezier(0.25,0.8,0.25,1);animation:slideUpFade 0.4s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0}
        .corp-card:hover{transform:translateY(-4px);box-shadow:0 12px 24px -8px rgba(0,0,0,0.12)}
        .btn-action{transition:all 0.2s ease;cursor:pointer}
        .btn-action:active{transform:scale(0.96)}
        .btn-action:hover{filter:brightness(1.05)}
        .stat-bar-fill{transition:width 1s cubic-bezier(0.16,1,0.3,1)}
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>

      <div className="corp-container">
        {/* HEADER */}
        <div style={{ background:"linear-gradient(135deg,#92400E 0%,#D97706 100%)", padding:"24px 20px 80px", position:"relative", overflow:"hidden", borderBottomLeftRadius:24, borderBottomRightRadius:24, boxShadow:"0 10px 30px rgba(217,119,6,0.2)" }}>
          <div style={{ position:"absolute", top:-50, right:-30, width:220, height:220, borderRadius:"50%", background:"radial-gradient(circle,rgba(255,255,255,0.15) 0%,rgba(255,255,255,0) 70%)" }} />
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:2 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ background:"rgba(255,255,255,0.2)", padding:8, borderRadius:12, backdropFilter:"blur(4px)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <div>
                </div><img src="/logo.png" alt="SunwAI" style={{ height:30, objectFit:"contain", filter:"brightness(0) invert(1)", marginRight:4 }} /><div><h1 style={{ color:"#fff", fontSize:20, fontWeight:800, margin:0 }}>Municipal Corp.</h1>
                <p style={{ color:"#FDE68A", fontSize:12, margin:"2px 0 0", fontWeight:500 }}>{user?.displayName}</p>
              </div>
            </div>
            <button onClick={logout} className="btn-action" style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, padding:"8px 16px", color:"#fff", fontSize:13, fontWeight:600 }}>Logout</button>
          </div>
        </div>

        {/* STATS */}
        <div style={{ padding:"0 16px", marginTop:-48, position:"relative", zIndex:10 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {[
              { label:"Total",     value:issues.length, color:"#92400E", bg:"#fff", special:false },
              { label:"Resolved",  value:resolved,      color:"#047857", bg:"#fff", special:false },
              { label:"Rate",      value:`${rate}%`,    color:"#D97706", bg:"#fff", special:false },
              { label:"Escalated", value:escalated.length, color:escalated.length>0?"#fff":"#BE123C", bg:escalated.length>0?"linear-gradient(135deg,#E11D48,#BE123C)":"#fff", special:escalated.length>0 },
            ].map((s,idx)=>(
              <div key={s.label} style={{ background:s.bg, borderRadius:16, padding:"12px 8px", textAlign:"center", boxShadow:"0 4px 15px rgba(0,0,0,0.06)", border:s.special?"none":"1px solid #E2E8F0", animation:`slideUpFade 0.4s ease forwards ${idx*0.1}s`, opacity:0 }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:10, fontWeight:700, color:s.special?"#FFE4E6":"#64748B", marginTop:4, textTransform:"uppercase" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth:640, margin:"0 auto", padding:"24px 16px" }}>

          {/* TABS */}
          <div className="no-scrollbar" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:24, paddingBottom:4 }}>
            {([
              { key:"escalated", label:`🚨 Escalated (${escalated.length})` },
              { key:"all",       label:"📋 All Issues" },
              { key:"stats",     label:"📊 Stats" },
              { key:"heatmap",   label:"🗺️ Heatmap" },
              { key:"report",    label:"📄 Report" },
            ] as const).map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)} style={{ background:tab===t.key?"#D97706":"#fff", color:tab===t.key?"#fff":"#475569", border:tab===t.key?"none":"1px solid #E2E8F0", padding:"8px 14px", borderRadius:20, fontSize:12, fontWeight:700, whiteSpace:"nowrap", cursor:"pointer", boxShadow:tab===t.key?"0 4px 12px rgba(217,119,6,0.25)":"none", transition:"all 0.2s ease" }}>{t.label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
              <p style={{ color:"#64748B", fontSize:14, fontWeight:500 }}>Loading...</p>
            </div>
          ) : (
            <>
              {/* ESCALATED */}
              {tab==="escalated" && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {escalated.length===0 ? (
                    <div style={{ background:"#fff", borderRadius:20, padding:48, textAlign:"center", border:"2px dashed #CBD5E1" }}>
                      <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
                      <h3 style={{ fontSize:18, fontWeight:700, color:"#0F172A", margin:"0 0 8px" }}>Zero Escalations</h3>
                      <p style={{ color:"#64748B", fontSize:14, margin:0 }}>All issues handled at ward level.</p>
                    </div>
                  ) : escalated.map((issue,index)=>(
                    <div key={issue.id} className="corp-card" style={{ background:"#fff", borderRadius:20, overflow:"hidden", border:"2px solid #FECDD3", animationDelay:`${index*0.05}s`, boxShadow:"0 8px 24px rgba(225,29,72,0.08)" }}>
                      <div style={{ background:"#FFE4E6", padding:"12px 16px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span>🚨</span>
                          <span style={{ color:"#BE123C", fontSize:12, fontWeight:800, textTransform:"uppercase" }}>High Priority Escalation</span>
                        </div>
                        {issue.escalationNote && <p style={{ color:"#9F1239", fontSize:13, fontWeight:500, margin:"6px 0 0" }}>"{issue.escalationNote}"</p>}
                        {issue.escalatedAt && <p style={{ color:"#E11D48", fontSize:11, margin:"4px 0 0", fontWeight:600 }}>Escalated: {new Date(issue.escalatedAt).toLocaleString("en-IN")}</p>}
                      </div>
                      {issue.isMegaComplaint ? (
                        <div style={{ background:"linear-gradient(135deg,#DC2626,#F97316)", color:"#fff", padding:"8px 14px", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", gap:6 }}>
                          🔥 MEGA COMPLAINT · {issue.megaCount || 1} REPORTS · {issue.megaReporters?.length || 1} CITIZENS
                        </div>
                      ) : null}

                      <div style={{ padding:20 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, gap:12 }}>
                          <div>
                            <span style={{ fontSize:11, fontWeight:800, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.5px" }}>{issue.category} · {issue.department}</span>
                            <h3 style={{ fontSize:17, fontWeight:800, color:"#0F172A", margin:"4px 0 0", lineHeight:1.3 }}>{issue.title}</h3>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
                            <span style={{ background:severityStyle[issue.severity]?.bg, color:severityStyle[issue.severity]?.text, border:`1px solid ${severityStyle[issue.severity]?.border}`, padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:800, textTransform:"uppercase" }}>{issue.severity}</span>
                            <span style={{ background:"#0F172A", color:"#fff", padding:"4px 10px", borderRadius:12, fontSize:10, fontWeight:800 }}>P{issue.priorityScore}/10</span>
                          </div>
                        </div>
                        <p style={{ fontSize:13, color:"#475569", lineHeight:1.5, margin:"0 0 16px" }}>{issue.description}</p>
                        <div style={{ background:"#F8FAFC", padding:12, borderRadius:12, fontSize:12, color:"#475569", marginBottom:16, display:"flex", flexDirection:"column", gap:6 }}>
                          <div>📍 <strong style={{ color:"#0F172A" }}>{issue.location?.address||"Location unavailable"}</strong></div>
                          <div>👤 Reported by: <strong style={{ color:"#0F172A" }}>{issue.reporterName}</strong></div>
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={()=>forceResolve(issue.id)} className="btn-action" style={{ flex:1, background:"linear-gradient(135deg,#10B981,#059669)", color:"#fff", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Force Resolve</button>
                          <button onClick={()=>sendBackToWard(issue.id)} className="btn-action" style={{ flex:1, background:"#fff", color:"#D97706", border:"1px solid #FCD34D", borderRadius:12, padding:12, fontSize:13, fontWeight:700 }}>Return to Ward</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ALL ISSUES */}
              {tab==="all" && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {issues.map((issue,index)=>{
                    const sStyle = statusStyle[issue.status]||statusStyle.Reported;
                    return (
                      <div key={issue.id} className="corp-card" style={{ background:"#fff", borderRadius:16, padding:16, border:issue.status==="Escalated"?"1px solid #FECDD3":"1px solid #E2E8F0", animationDelay:`${index*0.03}s` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                          <div style={{ flex:1 }}>
                            <h3 style={{ fontSize:15, fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>{issue.title}</h3>
                            <p style={{ fontSize:12, color:"#64748B", margin:0, fontWeight:500 }}>{issue.department} · {new Date(issue.createdAt).toLocaleDateString("en-IN")}</p>
                            <p style={{ fontSize:11, color:"#94A3B8", margin:"2px 0 0" }}>By {issue.reporterName}</p>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                            <span style={{ background:sStyle.bg, color:sStyle.text, border:`1px solid ${sStyle.border}`, padding:"4px 10px", borderRadius:10, fontSize:10, fontWeight:800, textTransform:"uppercase" }}>{issue.status}</span>
                            <span style={{ fontSize:10, fontWeight:800, color:severityStyle[issue.severity]?.text||"#64748B" }}>{issue.severity}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* STATS */}
              {tab==="stats" && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {[
                      { label:"Total Issues", value:issues.length,                                         color:"#0F172A", bg:"#F8FAFC" },
                      { label:"Resolved",     value:resolved,                                              color:"#047857", bg:"#ECFDF5" },
                      { label:"Critical",     value:issues.filter(i=>i.severity==="CRITICAL").length,      color:"#BE123C", bg:"#FFF1F2" },
                      { label:"Pending",      value:issues.filter(i=>i.status!=="Resolved").length,        color:"#D97706", bg:"#FFFBEB" },
                    ].map(s=>(
                      <div key={s.label} style={{ background:s.bg, borderRadius:16, padding:16, border:"1px solid rgba(0,0,0,0.05)" }}>
                        <div style={{ fontSize:28, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                        <div style={{ fontSize:12, color:"#64748B", fontWeight:600, marginTop:6 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:"#fff", borderRadius:20, padding:20, border:"1px solid #E2E8F0" }}>
                    <h2 style={{ fontSize:16, fontWeight:800, color:"#0F172A", margin:"0 0 16px" }}>By Category</h2>
                    {cats.map(cat=>{
                      const count=issues.filter(i=>i.category===cat).length;
                      const pct=Math.round((count/issues.length)*100);
                      return (
                        <div key={cat} style={{ marginBottom:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#475569", fontWeight:600, marginBottom:6 }}><span>{cat}</span><span>{count} ({pct}%)</span></div>
                          <div style={{ height:8, background:"#F1F5F9", borderRadius:4, overflow:"hidden" }}>
                            <div className="stat-bar-fill" style={{ height:"100%", background:"linear-gradient(90deg,#D97706,#F59E0B)", width:`${pct}%`, borderRadius:4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ background:"#fff", borderRadius:20, padding:20, border:"1px solid #E2E8F0" }}>
                    <h2 style={{ fontSize:16, fontWeight:800, color:"#0F172A", margin:"0 0 16px" }}>By Status</h2>
                    {(["Reported","Assigned","In Progress","Resolved","Escalated"] as const).map(status=>{
                      const count=issues.filter(i=>i.status===status).length;
                      const pct=issues.length?Math.round((count/issues.length)*100):0;
                      const sStyle=statusStyle[status];
                      return (
                        <div key={status} style={{ marginBottom:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#475569", fontWeight:600, marginBottom:6 }}><span>{status}</span><span>{count}</span></div>
                          <div style={{ height:8, background:"#F1F5F9", borderRadius:4, overflow:"hidden" }}>
                            <div className="stat-bar-fill" style={{ height:"100%", background:sStyle.text, width:`${pct}%`, borderRadius:4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* HEATMAP */}
              {tab==="heatmap" && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ background:"#fff", borderRadius:20, padding:20, border:"1px solid #E2E8F0" }}>
                    <h2 style={{ fontSize:16, fontWeight:800, color:"#0F172A", margin:"0 0 4px" }}>City Issue Heatmap</h2>
                    <p style={{ fontSize:12, color:"#64748B", margin:"0 0 16px" }}>Red = high issue density · Weighted by priority score · Click markers for details</p>
                    <HeatMap issues={issues} />
                  </div>

                  {/* Category density grid */}
                  <div style={{ background:"#fff", borderRadius:20, padding:20, border:"1px solid #E2E8F0" }}>
                    <h2 style={{ fontSize:14, fontWeight:800, color:"#0F172A", margin:"0 0 12px" }}>Category Density</h2>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      {(()=>{
                        const catMap:Record<string,number>={};
                        issues.forEach(i=>{catMap[i.category]=(catMap[i.category]||0)+1;});
                        const max=Math.max(...Object.values(catMap),1);
                        return Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,count])=>{
                          const intensity=count/max;
                          const alpha=0.1+intensity*0.85;
                          const textDark=intensity>0.5;
                          return (
                            <div key={cat} style={{ background:`rgba(220,38,38,${alpha})`, borderRadius:12, padding:"12px 14px", border:`1px solid rgba(220,38,38,${Math.min(alpha+0.1,1)})` }}>
                              <div style={{ fontSize:22, fontWeight:800, color:textDark?"#fff":"#7F1D1D" }}>{count}</div>
                              <div style={{ fontSize:10, color:textDark?"rgba(255,255,255,0.85)":"#991B1B", fontWeight:700, lineHeight:1.3, marginTop:2 }}>{cat}</div>
                              {intensity>=0.7 && <div style={{ fontSize:9, color:textDark?"rgba(255,255,255,0.7)":"#B91C1C", marginTop:4, fontWeight:600 }}>🔴 HIGH</div>}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Severity distribution */}
                  <div style={{ background:"#fff", borderRadius:20, padding:20, border:"1px solid #E2E8F0" }}>
                    <h2 style={{ fontSize:14, fontWeight:800, color:"#0F172A", margin:"0 0 12px" }}>Severity Distribution</h2>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                      {[
                        { sev:"CRITICAL", color:"#BE123C", bg:"#FFE4E6" },
                        { sev:"HIGH",     color:"#C2410C", bg:"#FFEDD5" },
                        { sev:"MEDIUM",   color:"#854D0E", bg:"#FEF9C3" },
                        { sev:"LOW",      color:"#047857", bg:"#D1FAE5" },
                      ].map(s=>{
                        const count=issues.filter(i=>i.severity===s.sev).length;
                        const pct=issues.length?Math.round((count/issues.length)*100):0;
                        return (
                          <div key={s.sev} style={{ background:s.bg, borderRadius:12, padding:"12px 10px", textAlign:"center" }}>
                            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{count}</div>
                            <div style={{ fontSize:9, fontWeight:700, color:s.color, marginTop:2, textTransform:"uppercase" }}>{s.sev}</div>
                            <div style={{ fontSize:10, color:s.color, marginTop:4, fontWeight:600 }}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* REPORT */}
              {tab==="report" && (
                <div style={{ background:"#fff", borderRadius:20, padding:24, border:"1px solid #E2E8F0", display:"flex", flexDirection:"column", gap:20 }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>📊</div>
                    <h3 style={{ fontSize:20, fontWeight:800, color:"#0F172A", margin:"0 0 8px" }}>City Report</h3>
                    <p style={{ fontSize:13, color:"#64748B", margin:0 }}>AI-powered PDF with city-wide analysis, stats, and complete issue list.</p>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {[
                      { label:"Total Issues",   value:issues.length,  color:"#92400E", bg:"#FFFBEB" },
                      { label:"Resolved",        value:resolved,       color:"#047857", bg:"#ECFDF5" },
                      { label:"Resolution Rate", value:`${rate}%`,     color:"#D97706", bg:"#FEF9C3" },
                      { label:"Escalated",       value:escalated.length, color:"#BE123C", bg:"#FFF1F2" },
                    ].map(s=>(
                      <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"14px 16px", textAlign:"center", border:"1px solid rgba(0,0,0,0.05)" }}>
                        <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:11, color:"#64748B", fontWeight:600, marginTop:4 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:"#FFFBEB", borderRadius:14, padding:16, border:"1px solid #FDE68A" }}>
                    <p style={{ fontSize:12, fontWeight:700, color:"#D97706", margin:"0 0 8px" }}>🤖 AI Analysis included</p>
                    <p style={{ fontSize:12, color:"#B45309", margin:0, lineHeight:1.5 }}>Gemma AI will analyze city-wide civic data and generate an executive summary with policy recommendations for the corporation.</p>
                  </div>
                  <div style={{ background:"#F8FAFC", borderRadius:14, padding:16, border:"1px solid #E2E8F0" }}>
                    <p style={{ fontSize:12, fontWeight:700, color:"#64748B", margin:"0 0 10px", textTransform:"uppercase", letterSpacing:"0.5px" }}>Report includes</p>
                    {["City-wide executive summary","AI-generated policy analysis","Department performance ranking","Category breakdown with percentages","Status distribution analysis","Complete issue list with all details"].map(item=>(
                      <div key={item} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:"#D97706", flexShrink:0 }} />
                        <span style={{ fontSize:13, color:"#475569", fontWeight:500 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleDownloadReport} disabled={reportLoading} className="btn-action" style={{ width:"100%", background:reportLoading?"#94A3B8":"linear-gradient(135deg,#92400E,#D97706)", border:"none", borderRadius:14, padding:16, color:"#fff", fontSize:15, fontWeight:700, cursor:reportLoading?"not-allowed":"pointer", boxShadow:reportLoading?"none":"0 8px 20px rgba(217,119,6,0.25)", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                    {reportLoading?<><span>⏳</span> Generating AI analysis...</>:<><span>⬇️</span> Download City PDF Report</>}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}