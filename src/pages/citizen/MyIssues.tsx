import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import type { Issue } from "../../types";

const statusStyle: Record<string, { bg: string; text: string; dot: string }> = {
  Reported:      { bg: "#F1F5F9", text: "#475569", dot: "#94A3B8" },
  Assigned:      { bg: "#E0F2FE", text: "#0369A1", dot: "#0284C7" },
  "In Progress": { bg: "#FFEDD5", text: "#C2410C", dot: "#EA580C" },
  Resolved:      { bg: "#D1FAE5", text: "#047857", dot: "#10B981" },
  Escalated:     { bg: "#FFE4E6", text: "#BE123C", dot: "#E11D48" },
};

export default function MyIssues() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "issues"), where("reportedBy", "==", user.uid), orderBy("createdAt", "desc"));
    getDocs(q).then((snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Issue)));
      setLoading(false);
    });
  }, [user]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        .issues-container { min-height: 100vh; background: #F4F7F9; font-family: 'Inter', system-ui, sans-serif; padding-bottom: 40px; }
        
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        
        .issue-card {
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        .issue-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px -8px rgba(0,0,0,0.12);
          border-color: #CBD5E1;
        }

        @keyframes pulseLoad {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div className="issues-container">
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #071D3A 0%, #0F4C75 100%)",
          padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px",
          position: "sticky", top: 0, zIndex: 50, boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
        }}>
          <button onClick={() => navigate("/citizen")} style={{
            background: "rgba(255,255,255,0.1)", border: "none", width: "40px", height: "40px",
            borderRadius: "12px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.2s"
          }} onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"} onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h1 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>My Issues History</h1>
            <span style={{ color: "#A7F3D0", fontSize: "11px", fontWeight: 600 }}>{issues.length} Total Reports</span>
          </div>
        </div>

        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", animation: "pulseLoad 1.5s infinite" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📂</div>
              <p style={{ color: "#64748B", fontSize: "14px", fontWeight: 500 }}>Fetching your reports...</p>
            </div>
          ) : issues.length === 0 ? (
            <div style={{
              background: "#fff", borderRadius: "24px", padding: "48px 24px", 
              textAlign: "center", border: "2px dashed #CBD5E1", marginTop: "20px"
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px", filter: "grayscale(100%) opacity(60%)" }}>📭</div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>No issues found</h3>
              <p style={{ fontSize: "14px", color: "#64748B", margin: 0 }}>You haven't reported any civic issues yet.</p>
              <button 
                onClick={() => navigate("/citizen/report")}
                style={{
                  background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff",
                  border: "none", borderRadius: "12px", padding: "12px 24px",
                  fontSize: "14px", fontWeight: 700, marginTop: "24px", cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(16,185,129,0.2)"
                }}
              >
                Report an Issue Now
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {issues.map((issue, index) => {
                const sc = statusStyle[issue.status] || statusStyle.Reported;
                return (
                  <div key={issue.id} className="issue-card" style={{
                    background: "#fff", borderRadius: "20px", overflow: "hidden", 
                    border: "1px solid #E2E8F0", animationDelay: `${index * 0.08}s`
                  }}>
                    {issue.imageBase64 && (
                      <div style={{ position: "relative" }}>
                        <img src={`data:image/jpeg;base64,${issue.imageBase64}`} 
                             style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }} 
                             alt={issue.title} />
                        <div style={{ position: "absolute", top: "12px", right: "12px", 
                          background: sc.bg, color: sc.text, padding: "6px 12px", 
                          borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                          display: "flex", alignItems: "center", gap: "6px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)", border: `1px solid ${sc.text}20`
                        }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: sc.dot, boxShadow: `0 0 0 2px ${sc.bg}` }} />
                          {issue.status}
                        </div>
                      </div>
                    )}
                    
                    <div style={{ padding: "20px" }}>
                      {!issue.imageBase64 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {issue.category}
                          </span>
                          <div style={{ 
                            background: sc.bg, color: sc.text, padding: "4px 10px", 
                            borderRadius: "12px", fontSize: "11px", fontWeight: 700,
                            display: "flex", alignItems: "center", gap: "4px"
                          }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: sc.dot }} />
                            {issue.status}
                          </div>
                        </div>
                      )}

                      {issue.imageBase64 && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "4px" }}>
                          {issue.category}
                        </span>
                      )}

                      <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", margin: "0 0 6px", lineHeight: 1.3 }}>
                        {issue.title}
                      </h3>

                      {/* ADDED: DESCRIPTION DISPLAY */}
                      {issue.description && (
                        <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px", lineHeight: 1.5 }}>
                          {issue.description}
                        </p>
                      )}
                      
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748B", fontSize: "12px", fontWeight: 500, marginBottom: "12px" }}>
                        <span>🏢</span> {issue.department}
                      </div>

                      <div style={{ background: "#F8FAFC", padding: "12px", borderRadius: "12px", display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "16px" }}>
                        <span style={{ fontSize: "14px" }}>📍</span>
                        <span style={{ fontSize: "12px", color: "#475569", lineHeight: 1.4 }}>
                          {issue.location?.address || "Location unavailable"}
                        </span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "16px", borderTop: "1px dashed #E2E8F0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#94A3B8", fontWeight: 600 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                          {new Date(issue.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                        
                        {issue.severity && (
                          <span style={{
                            fontSize: "10px", fontWeight: 800, padding: "4px 8px", borderRadius: "8px", textTransform: "uppercase",
                            background: issue.severity === "CRITICAL" ? "#FFE4E6" : issue.severity === "HIGH" ? "#FFEDD5" : issue.severity === "MEDIUM" ? "#FEF9C3" : "#D1FAE5",
                            color: issue.severity === "CRITICAL" ? "#BE123C" : issue.severity === "HIGH" ? "#C2410C" : issue.severity === "MEDIUM" ? "#854D0E" : "#047857",
                          }}>
                            {issue.severity} Priority
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}