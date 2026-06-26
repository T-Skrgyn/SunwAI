import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { analyzeIssueImage, processMediaToBase64 } from "../../lib/gemini";
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { IssueCategory, IssueSeverity } from "../../types";
import ChatBot from "../../components/chat/ChatBot";

type Step = "capture" | "analyzing" | "review" | "submitting" | "done";

const DEPARTMENTS = [
  "Public Works", "Water Board", "Electrical Department",
  "Sanitation", "Traffic Police", "Police",
  "Drainage Department", "Revenue Department",
];

const CATEGORIES: IssueCategory[] = [
  "Road Damage", "Water Leakage", "Streetlight Failure",
  "Waste Management", "Traffic Issues", "Public Safety",
  "Drainage Problems", "Encroachment",
];

export default function ReportIssue() {
  const { user, addPoints } = useAuthStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [imageBase64, setImageBase64] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editCategory, setEditCategory] = useState<IssueCategory>("Road Damage");
  const [editSeverity, setEditSeverity] = useState<IssueSeverity>("MEDIUM");
  const [editAddress, setEditAddress] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [priorityScore, setPriorityScore] = useState(5);

  const fetchLocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
          if (key) {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=en&region=IN`);
            const data = await res.json();
            if (data.status === "OK" && data.results?.[0]) {
              address = data.results[0].formatted_address;
            }
          } else {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`);
            const data = await res.json();
            address = data.display_name || address;
          }
        } catch {}
        setLocation({ lat, lng, address });
        setEditAddress(address);
      },
      () => {
        setLocation({ lat: 22.7196, lng: 75.8577, address: "Indore, Madhya Pradesh" });
        setEditAddress("Indore, Madhya Pradesh");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleMedia = async (file: File) => {
    setError("");
    const isVid = file.type.startsWith("video/");
    setIsVideo(isVid);
    setImagePreview(URL.createObjectURL(file));
    
    setStep("analyzing");
    fetchLocation();
    
    try {
      const base64 = await processMediaToBase64(file);
      setImageBase64(base64);
      const result = await analyzeIssueImage(base64);
      setEditTitle(result.title);
      setEditDesc(result.description);
      setEditDept(result.department);
      setEditCategory(result.category as IssueCategory);
      setEditSeverity(result.severity as IssueSeverity);
      setPriorityScore(result.priorityScore);
      setStep("review");
    } catch (err) {
      console.error("Analysis error:", err);
      setError("AI analysis failed. Please try again.");
      setStep("capture");
    }
  };

  // Haversine distance in metres between two lat/lng points
  const getDistanceM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleSubmit = async () => {
    if (!user || !location) return;
    setStep("submitting");
    try {
      // Check for existing issues within 10m radius with same category
      const snapshot = await getDocs(query(collection(db, "issues"), where("category", "==", editCategory)));
      const nearby = snapshot.docs.filter(d => {
        const loc = d.data().location;
        return loc?.lat && getDistanceM(location.lat, location.lng, loc.lat, loc.lng) <= 10;
      });

      if (nearby.length >= 1) {
        // MEGA COMPLAINT — update the existing issue
        const existingDoc = nearby[0];
        const existingData = existingDoc.data();
        const reporterNames: string[] = existingData.megaReporters || [existingData.reporterName];
        if (!reporterNames.includes(user.displayName || user.uid)) {
          reporterNames.push(user.displayName || "Anonymous");
        }
        const newPriority = Math.min(10, (existingData.priorityScore || 5) + 1);
        const newSeverity = newPriority >= 9 ? "CRITICAL" : newPriority >= 7 ? "HIGH" : newPriority >= 5 ? "MEDIUM" : "LOW";

        await updateDoc(doc(db, "issues", existingDoc.id), {
          isMegaComplaint: true,
          megaCount: (existingData.megaCount || 1) + 1,
          megaReporters: reporterNames,
          priorityScore: newPriority,
          severity: newSeverity,
          updatedAt: Date.now(),
        });
      } else {
        // Normal new issue
        await addDoc(collection(db, "issues"), {
          title: editTitle,
          description: editDesc,
          category: editCategory,
          severity: editSeverity,
          status: "Reported",
          department: editDept,
          priorityScore,
          imageBase64,
          location: { ...location, address: editAddress },
          reportedBy: user.uid,
          reporterName: user.displayName,
          verifications: 0,
          isMegaComplaint: false,
          megaCount: 1,
          megaReporters: [user.displayName || "Anonymous"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      await addPoints(10);
      setStep("done");
    } catch (err) {
      console.error("Submit error:", err);
      setError("Failed to submit. Please try again.");
      setStep("review");
    }
  };

  const inputStyle = {
    width: "100%", padding: "12px 16px", borderRadius: "12px",
    border: "1px solid #CBD5E1", background: "#F8FAFC", fontSize: "14px",
    color: "#0F172A", outline: "none", boxSizing: "border-box" as const,
    transition: "all 0.2s ease",
  };
  const labelStyle = {
    display: "block", fontSize: "11px", fontWeight: 700, color: "#64748B",
    textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "6px",
  };

  const getSeverityStyle = (sev: IssueSeverity) => {
    switch (sev) {
      case "CRITICAL": return { bg: "#FFE4E6", border: "#FECDD3", text: "#BE123C" };
      case "HIGH":     return { bg: "#FFEDD5", border: "#FED7AA", text: "#C2410C" };
      case "LOW":      return { bg: "#D1FAE5", border: "#A7F3D0", text: "#047857" };
      default:         return { bg: "#FEF9C3", border: "#FEF08A", text: "#854D0E" };
    }
  };
  const currentSevStyle = getSeverityStyle(editSeverity);

  if (step === "done") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F7F9", padding: "20px" }}>
        <style>{`@keyframes scaleUp { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} } .animate-success{animation:scaleUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards}`}</style>
        <div className="animate-success" style={{ background: "#fff", borderRadius: "24px", padding: "40px 32px", textAlign: "center", maxWidth: "400px", width: "100%", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)", border: "1px solid #E2E8F0" }}>
          <div style={{ width: "80px", height: "80px", background: "linear-gradient(135deg,#10B981,#059669)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 10px 25px rgba(16,185,129,0.3)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>Issue Reported!</h2>
          <div style={{ background: "#E0F2FE", color: "#0369A1", padding: "6px 16px", borderRadius: "20px", display: "inline-block", fontSize: "14px", fontWeight: 700, marginBottom: "16px" }}>+10 Points Earned 🎉</div>
          <p style={{ color: "#64748B", fontSize: "14px", margin: "0 0 32px", lineHeight: 1.5 }}>
            Routed to <strong style={{ color: "#0F172A" }}>{editDept}</strong>
          </p>
          <button
            onClick={() => navigate("/citizen")}
            style={{ background: "linear-gradient(135deg,#071D3A,#0F4C75)", color: "#fff", border: "none", borderRadius: "16px", padding: "16px", width: "100%", fontSize: "15px", fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 20px rgba(15,76,117,0.2)" }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .report-container { min-height:100vh; background:#F4F7F9; font-family:'Inter',system-ui,sans-serif; padding-bottom:80px; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .animate-fade { animation:fadeIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
        .upload-area:hover { border-color:#10B981!important; transform:translateY(-2px); }
        .upload-area { transition:all 0.3s ease; }
        .input-focus:focus { border-color:#10B981!important; box-shadow:0 0 0 3px rgba(16,185,129,0.1); }
        @keyframes spinSlow { 100%{transform:rotate(360deg)} }
        .spin-icon { animation:spinSlow 3s linear infinite; }
        @keyframes subtlePulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.05);opacity:0.8} }
        .pulse-icon { animation:subtlePulse 2s infinite ease-in-out; }
      `}</style>

      <div className="report-container">
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#071D3A 0%,#0F4C75 100%)", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <button
            onClick={() => navigate("/citizen")}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", width: "40px", height: "40px", borderRadius: "12px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <h1 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: 0 }}>Report Civic Issue</h1>
        </div>

        <div className="animate-fade" style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {error && (
            <div style={{ background: "#FFE4E6", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: "16px", padding: "16px", fontSize: "14px", fontWeight: 500, display: "flex", alignItems: "center", gap: "12px" }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* CAPTURE */}
          {step === "capture" && (
            <div>
              <div style={{ background: "#fff", border: "2px dashed #CBD5E1", borderRadius: "24px", padding: "40px 24px", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                <div style={{ width: "80px", height: "80px", background: "#F1F5F9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0F4C75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>Report Civic Issue</h3>
                <p style={{ fontSize: "14px", color: "#64748B", margin: "0 0 24px" }}>AI will auto-detect the issue type, severity and department.</p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0F4C75", color: "#fff", border: "none", borderRadius: "14px", padding: "12px 22px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Take Photo
                  </button>
                  <button onClick={() => galleryRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#F1F5F9", color: "#0F172A", border: "2px solid #E2E8F0", borderRadius: "14px", padding: "12px 22px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Choose from Gallery
                  </button>
                </div>
                <div style={{ marginTop: "20px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "14px", padding: "12px 16px", textAlign: "left" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#C2410C", marginBottom: "4px" }}>💡 Tip: Describe your issue better</div>
                  <div style={{ fontSize: "12px", color: "#92400E", lineHeight: "1.5" }}>
                    For a more accurate report with full details, use the <strong>SunwAI ChatBot</strong> below — just type or speak your problem in Hindi, English, or Hinglish!
                    <br /><span style={{ color: "#B45309" }}>बेहतर रिपोर्ट के लिए नीचे दिए <strong>SunwAI ChatBot</strong> का उपयोग करें — हिंदी, इंग्लिश या हिंगलिश में बताएं!</span>
                  </div>
                  <div style={{ marginTop: "10px", display: "inline-block", background: "#E0F2FE", color: "#0369A1", fontSize: "12px", fontWeight: 700, padding: "6px 16px", borderRadius: "20px" }}>
                    Use ChatBot below ↘
                  </div>
                </div>
              </div>
{/* Camera input */}
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm"
                capture="environment" style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleMedia(e.target.files[0])} />
              {/* Gallery input */}
              <input ref={galleryRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleMedia(e.target.files[0])} />
            </div>
          )}

          {/* ANALYZING */}
          {step === "analyzing" && (
            <div style={{ background: "#fff", borderRadius: "24px", padding: "60px 24px", textAlign: "center", border: "1px solid #E2E8F0", boxShadow: "0 10px 25px rgba(0,0,0,0.05)" }}>
              <div className="spin-icon" style={{ fontSize: "48px", marginBottom: "20px" }}>⚙️</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>Analyzing Media with AI...</h3>
              <p style={{ fontSize: "14px", color: "#64748B", margin: "0 0 4px" }}>Detecting category, department, and priority score.</p>
              <p style={{ fontSize: "12px", color: "#94A3B8", margin: 0 }}>Also fetching your precise GPS location...</p>
            </div>
          )}

          {/* REVIEW */}
          {step === "review" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {imagePreview && (
                <div style={{ position: "relative", borderRadius: "20px", overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,0.1)" }}>
                  {isVideo ? (
                    <video src={imagePreview} autoPlay loop muted playsInline style={{ width: "100%", height: "220px", objectFit: "cover", display: "block" }} />
                  ) : (
                    <img src={imagePreview} style={{ width: "100%", height: "220px", objectFit: "cover", display: "block" }} alt="Issue" />
                  )}
                  <div style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: "6px 12px", borderRadius: "12px", color: "#fff", fontSize: "12px", fontWeight: 600 }}>AI Scanned ✓</div>
                </div>
              )}

              <div style={{ background: "#fff", borderRadius: "24px", padding: "24px", border: "1px solid #E2E8F0", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #F1F5F9", paddingBottom: "16px" }}>
                  <div style={{ width: "36px", height: "36px", background: "linear-gradient(135deg,#0F4C75,#10B981)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div>
                    <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", margin: 0 }}>Review & Edit</h2>
                    <p style={{ fontSize: "11px", color: "#94A3B8", margin: 0 }}>All fields are editable before submitting</p>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select className="input-focus" value={editCategory} onChange={e => setEditCategory(e.target.value as IssueCategory)} style={{ ...inputStyle, cursor: "pointer" }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Severity</label>
                    <select className="input-focus" value={editSeverity} onChange={e => setEditSeverity(e.target.value as IssueSeverity)} style={{ ...inputStyle, background: currentSevStyle.bg, color: currentSevStyle.text, borderColor: currentSevStyle.border, fontWeight: 700, cursor: "pointer" }}>
                      {["LOW","MEDIUM","HIGH","CRITICAL"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Assigned Department</label>
                  <select className="input-focus" value={editDept} onChange={e => setEditDept(e.target.value)} style={{ ...inputStyle, background: "#F1F5F9", fontWeight: 600, cursor: "pointer" }}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Title</label>
                  <input className="input-focus" type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea className="input-focus" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none" }} />
                </div>

                <div>
                  <label style={labelStyle}>
                    Location Address
                    {!editAddress && <span style={{ color: "#F59E0B", marginLeft: 6, fontWeight: 500, textTransform: "none" }}>— fetching GPS...</span>}
                  </label>
                  <textarea className="input-focus" value={editAddress} onChange={e => setEditAddress(e.target.value)} rows={2} placeholder="Detecting your precise location..." style={{ ...inputStyle, resize: "none" }} />
                </div>

                {/* Priority bar */}
                <div style={{ background: "#F8FAFC", borderRadius: "12px", padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI Priority Score</span>
                    <span style={{ fontSize: "14px", fontWeight: 800, color: priorityScore >= 8 ? "#BE123C" : priorityScore >= 5 ? "#C2410C" : "#047857" }}>{priorityScore}/10</span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} style={{
                        flex: 1, height: 6, borderRadius: 3,
                        background: i < priorityScore
                          ? priorityScore >= 8 ? "#EF4444" : priorityScore >= 5 ? "#F97316" : "#10B981"
                          : "#E2E8F0",
                        transition: "background 0.3s",
                      }} />
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!editTitle || !editAddress}
                style={{
                  background: !editTitle || !editAddress ? "#94A3B8" : "linear-gradient(135deg,#10B981,#059669)",
                  color: "#fff", border: "none", borderRadius: "16px", padding: "18px",
                  fontSize: "16px", fontWeight: 800,
                  cursor: !editTitle || !editAddress ? "not-allowed" : "pointer",
                  boxShadow: !editTitle || !editAddress ? "none" : "0 10px 25px rgba(16,185,129,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  width: "100%",
                }}
              >
                Confirm & Submit Report
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <button onClick={() => { setStep("capture"); setImagePreview(""); setError(""); }} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: "14px", fontWeight: 600, cursor: "pointer", padding: "12px", width: "100%" }}>
                ← Retake Photo/Video
              </button>
            </div>
          )}

          {/* SUBMITTING */}
          {step === "submitting" && (
            <div style={{ background: "#fff", borderRadius: "24px", padding: "60px 24px", textAlign: "center", border: "1px solid #E2E8F0" }}>
              <div style={{ fontSize: "48px", marginBottom: "20px" }}>📡</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>Submitting Report...</h3>
              <p style={{ fontSize: "14px", color: "#64748B", margin: 0 }}>Routing to {editDept}</p>
            </div>
          )}
        </div>

        <ChatBot />
      </div>
    </>
  );
}