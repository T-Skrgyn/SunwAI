import { useState, useRef, useEffect } from "react";
import { chatWithAssistant, analyzeIssueImage, processMediaToBase64 } from "../../lib/gemini";
import { useAuthStore } from "../../store/authStore";
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { IssueCategory, IssueSeverity } from "../../types";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  imagePreview?: string;
  isVideo?: boolean;
}

interface PendingReport {
  imageBase64: string;
  priorityScore: number;
  location: { lat: number; lng: number; address: string };
}

const DEPARTMENTS = ["Public Works", "Water Board", "Electrical Department", "Sanitation", "Traffic Police", "Police", "Drainage Department", "Revenue Department"];
const CATEGORIES: IssueCategory[] = ["Road Damage", "Water Leakage", "Streetlight Failure", "Waste Management", "Traffic Issues", "Public Safety", "Drainage Problems", "Encroachment"];

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (key) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=en&region=IN`);
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) return data.results[0].formatted_address;
    } catch {}
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export default function ChatBot() {
  const { user, addPoints } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "assistant",
    text: `Namaste${user?.displayName ? " " + user.displayName.split(" ")[0] : ""}! 🙏 Apni civic samasya batayein ya 📎 se media bhejein.`,
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [pendingReport, setPendingReport] = useState<PendingReport | null>(null);
  const [hasAction, setHasAction] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editCategory, setEditCategory] = useState<IssueCategory>("Waste Management");
  const [editSeverity, setEditSeverity] = useState<IssueSeverity>("MEDIUM");
  const [editAddress, setEditAddress] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const address = await reverseGeocode(lat, lng);
      setUserLocation({ lat, lng, address });
      setEditAddress(address);
    }, () => {
      setUserLocation({ lat: 22.7196, lng: 75.8577, address: "Indore, Madhya Pradesh" });
      setEditAddress("Indore, Madhya Pradesh");
    }, { enableHighAccuracy: true });
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 100);
    }
  }, [open, messages]);

  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\|\|\|.*?\|\|\|/g, "").trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "hi-IN";
    window.speechSynthesis.speak(utterance);
  };

  const handleListen = () => {
    if (!SpeechRecognition) return alert("Voice input not supported in your browser.");
    const rec = new SpeechRecognition();
    rec.lang = "hi-IN";
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.onresult = (e: any) => setInput(prev => prev + (prev ? " " : "") + e.results[0][0].transcript);
    rec.start();
  };

  const getDistanceM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleConfirmReport = async () => {
    if (!pendingReport || !user) return;
    setSubmitting(true);
    try {
      const loc = pendingReport.location;

      // Check for nearby issues (10m radius, same category)
      const snapshot = await getDocs(query(collection(db, "issues"), where("category", "==", editCategory)));
      const nearby = snapshot.docs.filter(d => {
        const dl = d.data().location;
        return dl?.lat && getDistanceM(loc.lat, loc.lng, dl.lat, dl.lng) <= 10;
      });

      if (nearby.length >= 1) {
        const existingDoc = nearby[0];
        const existingData = existingDoc.data();
        const reporters: string[] = existingData.megaReporters || [existingData.reporterName];
        if (!reporters.includes(user.displayName || user.uid)) reporters.push(user.displayName || "Anonymous");
        const newPriority = Math.min(10, (existingData.priorityScore || 5) + 1);
        const newSeverity = newPriority >= 9 ? "CRITICAL" : newPriority >= 7 ? "HIGH" : newPriority >= 5 ? "MEDIUM" : "LOW";
        await updateDoc(doc(db, "issues", existingDoc.id), {
          isMegaComplaint: true, megaCount: (existingData.megaCount || 1) + 1,
          megaReporters: reporters, priorityScore: newPriority, severity: newSeverity, updatedAt: Date.now(),
        });
        setMessages(prev => [...prev, { role: "assistant", text: `🔥 Mega Complaint ban gayi! ${reporters.length} logon ne ek hi jagah ki samasya report ki hai. Priority automatically badhha di gayi hai! +10 points mile hain! 🎉` }]);
        speakText("Mega complaint ban gayi! Priority badh gayi hai.");
      } else {
        await addDoc(collection(db, "issues"), {
          title: editTitle, description: editDesc, category: editCategory, severity: editSeverity, department: editDept,
          priorityScore: pendingReport.priorityScore, imageBase64: pendingReport.imageBase64 || null,
          location: { ...loc, address: editAddress },
          status: "Reported", reportedBy: user.uid, reporterName: user.displayName,
          verifications: 0, isMegaComplaint: false, megaCount: 1,
          megaReporters: [user.displayName || "Anonymous"],
          createdAt: Date.now(), updatedAt: Date.now(),
        });
        setMessages(prev => [...prev, { role: "assistant", text: "✅ Report submit ho gayi! +10 points mile hain! 🎉" }]);
        speakText("Report submit ho gayi. Dhanyawad!");
      }

      await addPoints(10);
      setPendingReport(null); setHasAction(false); setEditMode(false);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Error submitting report." }]);
      speakText("Report submit nahi hui. Kripya dobara try karein.");
    }
    setSubmitting(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages: ChatMessage[] = [...messages, { role: "user", text: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    
    try {
      const reply = await chatWithAssistant(userMsg, newMessages);
      
      if (reply.includes("|||SUBMIT|||")) {
        const cleanText = reply.replace("|||SUBMIT|||", "").trim();
        setMessages([...newMessages, { role: "assistant", text: cleanText }]);
        speakText(cleanText);
        await handleConfirmReport();
      } else if (reply.includes("|||REPORT|||")) {
        const parts = reply.split("|||REPORT|||");
        const conversationalText = parts[0].trim();
        let jsonString = parts[1].trim();
        if (jsonString.endsWith("|||")) jsonString = jsonString.slice(0, -3).trim();

        try {
          const data = JSON.parse(jsonString);
          const loc = userLocation || { lat: 22.7196, lng: 75.8577, address: "Location pending" };
          
          setEditTitle(data.title || "Civic Issue");
          setEditDesc(data.description || userMsg);
          setEditDept(data.department || "Public Works");
          setEditCategory((data.category as IssueCategory) || "Waste Management");
          setEditSeverity((data.severity as IssueSeverity) || "MEDIUM");
          setEditAddress(loc.address);
          setEditMode(false);
          setPendingReport({ imageBase64: pendingReport?.imageBase64 || "", priorityScore: data.severity === "CRITICAL" ? 9 : 5, location: loc });
          setHasAction(true);
          
          setMessages([...newMessages, { role: "assistant", text: conversationalText }]);
          speakText(conversationalText);
        } catch (e) {
          setMessages([...newMessages, { role: "assistant", text: conversationalText }]);
          speakText(conversationalText);
        }
      } else {
        setMessages([...newMessages, { role: "assistant", text: reply }]);
        speakText(reply);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", text: "Kuch technical issue aa gaya." }]);
      speakText("Kuch technical issue aa gaya.");
    }
    setLoading(false);
  };

  const handleMedia = async (file: File) => {
    setAnalyzing(true);
    const isVideo = file.type.startsWith("video/");
    const preview = URL.createObjectURL(file);
    
    try {
      const base64 = await processMediaToBase64(file);
      const withPhoto: ChatMessage[] = [...messages, { 
        role: "user", 
        text: isVideo ? "📹 Video upload ki hai." : "📷 Photo upload ki hai.", 
        imagePreview: preview,
        isVideo 
      }];
      setMessages(withPhoto);
      
      const result = await analyzeIssueImage(base64);
      const loc = userLocation || { lat: 22.7196, lng: 75.8577, address: "Indore, Madhya Pradesh" };
      setEditTitle(result.title); setEditDesc(result.description); setEditDept(result.department);
      setEditCategory(result.category as IssueCategory); setEditSeverity(result.severity as IssueSeverity);
      setEditAddress(loc.address);
      setEditMode(false);
      setPendingReport({ imageBase64: base64, priorityScore: result.priorityScore, location: loc });
      setHasAction(true);
      
      const replyText = `Maine aapki ${isVideo ? 'video' : 'photo'} analyze ki:\n\n📌 ${result.category}\n⚠️ ${result.severity} Priority\n🏢 ${result.department}\n📝 ${result.title}\n📍 ${loc.address.slice(0, 80)}\n\nKya aap iski description mein kuch add ya edit karna chahte hain, ya main isko submit kar doon?`;
      setMessages([...withPhoto, { role: "assistant", text: replyText }]);
      speakText(`Maine ${isVideo ? 'video' : 'photo'} analyze kar li hai. Kya aap iski description mein kuch edit karna chahte hain, ya main isko submit kar doon?`);
    } catch {
      setMessages([...messages, { role: "assistant", text: "Media analyze nahi ho saki. Dobara try karein." }]);
      speakText("Analyze nahi ho saki.");
    }
    setAnalyzing(false);
  };

  const handleCancel = () => {
    setPendingReport(null); setHasAction(false); setEditMode(false);
    const text = "Report cancel kar di. Koi aur samasya ho toh batayein!";
    setMessages(prev => [...prev, { role: "assistant", text }]);
    speakText(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid #CBD5E1", borderRadius: "8px",
    padding: "8px 10px", fontSize: "13px", outline: "none",
    background: "#F8FAFC", boxSizing: "border-box", color: "#0F172A",
    transition: "border-color 0.2s ease",
  };
  
  const labelStyle: React.CSSProperties = {
    fontSize: "11px", color: "#64748B", fontWeight: 600,
    marginBottom: "4px", display: "block", textTransform: "uppercase", letterSpacing: "0.5px",
  };

  return (
    <>
      <style>{`
        .chat-slide-up { animation: chatSlideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards; transform-origin: bottom right; }
        @keyframes chatSlideUp { 0%{opacity:0;transform:scale(0.9) translateY(20px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        .msg-enter { animation: msgFadeIn 0.3s ease forwards; }
        @keyframes msgFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .chat-input-focus:focus { border-color:#10B981!important; box-shadow:0 0 0 3px rgba(16,185,129,0.1); }
        .quick-reply:hover { background:#D1FAE5!important; transform:translateY(-1px); }
        .quick-reply { transition:all 0.2s ease; }
        .chat-scroll::-webkit-scrollbar { width:6px; }
        .chat-scroll::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:10px; }
        .fab-btn:hover { transform:scale(1.05)!important; }
        @keyframes pulseMic {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>

      {open && (
        <div className="chat-slide-up" style={{
          position: "fixed", bottom: "90px", right: "20px", width: "min(380px, calc(100vw - 40px))",
          zIndex: 1000, borderRadius: "24px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.2)", background: "#fff", display: "flex", flexDirection: "column", maxHeight: "75vh",
        }}>

          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg,#071D3A 0%,#0F4C75 100%)", padding: "16px 20px", display: "flex", 
            alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ background: "#fff", padding: "6px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                <img src="/logo.png" alt="SunwAI" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
              </div>
              <div>
                <p style={{ color: "#fff", fontSize: "15px", fontWeight: 700, margin: 0 }}>SunwAI Assistant</p>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />
                  <p style={{ color: "#A7F3D0", fontSize: "11px", margin: 0, fontWeight: 500 }}>Hindi · English</p>
                </div>
              </div>
            </div>
            
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setVoiceEnabled(!voiceEnabled)} title={voiceEnabled ? "Voice Output ON" : "Voice Output OFF"} style={{
                background: voiceEnabled ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.1)", 
                border: voiceEnabled ? "1px solid rgba(16, 185, 129, 0.5)" : "none",
                borderRadius: "50%", color: voiceEnabled ? "#A7F3D0" : "#fff", width: "32px", height: "32px", cursor: "pointer",
                fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {voiceEnabled ? "🔊" : "🔇"}
              </button>
              
              <button onClick={() => setOpen(false)} style={{
                background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
                color: "#fff", width: "32px", height: "32px", cursor: "pointer",
                fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-scroll" style={{
            flex: 1, overflowY: "auto", padding: "20px 16px",
            display: "flex", flexDirection: "column", gap: "12px", background: "#F4F7F9",
          }}>
            {messages.map((msg, i) => (
              <div key={i} className="msg-enter" style={{
                display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: "6px",
              }}>
                {msg.imagePreview && msg.isVideo && (
                  <video src={msg.imagePreview} autoPlay loop muted playsInline style={{
                    width: "200px", height: "140px", objectFit: "cover",
                    borderRadius: "16px", border: "2px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }} />
                )}
                {msg.imagePreview && !msg.isVideo && (
                  <img src={msg.imagePreview} alt="Uploaded" style={{
                    width: "200px", height: "140px", objectFit: "cover",
                    borderRadius: "16px", border: "2px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }} />
                )}
                {msg.text && (
                  <div style={{
                    maxWidth: "85%", padding: "12px 16px",
                    borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: msg.role === "user" ? "linear-gradient(135deg,#10B981,#059669)" : "#fff",
                    color: msg.role === "user" ? "#fff" : "#0F172A",
                    fontSize: "14px", lineHeight: "1.5", fontWeight: 500,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: msg.role === "assistant" ? "1px solid #E2E8F0" : "none",
                    whiteSpace: "pre-line",
                  }}>
                    {msg.text}
                  </div>
                )}
              </div>
            ))}

            {/* Action area */}
            {hasAction && pendingReport && (
              <div className="msg-enter" style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                {editMode && (
                  <div style={{
                    background: "#fff", border: "1px solid #E2E8F0", borderRadius: "16px", padding: "16px",
                    display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <span style={labelStyle}>Category</span>
                        <select className="chat-input-focus" value={editCategory} onChange={e => setEditCategory(e.target.value as IssueCategory)} style={inputStyle}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <span style={labelStyle}>Severity</span>
                        <select className="chat-input-focus" value={editSeverity} onChange={e => setEditSeverity(e.target.value as IssueSeverity)} style={inputStyle}>
                          {["LOW","MEDIUM","HIGH","CRITICAL"].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <span style={labelStyle}>Department</span>
                      <select className="chat-input-focus" value={editDept} onChange={e => setEditDept(e.target.value)} style={inputStyle}>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <span style={labelStyle}>Title</span>
                      <input className="chat-input-focus" type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={labelStyle}>Description</span>
                      <textarea className="chat-input-focus" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
                    </div>
                    <div>
                      <span style={labelStyle}>Address</span>
                      <textarea className="chat-input-focus" value={editAddress} onChange={e => setEditAddress(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
                    </div>
                    <button onClick={() => setEditMode(false)} style={{
                      background: "#E0F2FE", border: "1px solid #BAE6FD", borderRadius: "10px", padding: "10px", 
                      color: "#0369A1", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                    }}>✓ Save Changes</button>
                  </div>
                )}

                {!editMode && (
                  <div style={{
                    background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "16px", padding: "14px 16px",
                    fontSize: "13px", color: "#334155", lineHeight: 1.6, whiteSpace: "pre-line", fontWeight: 500,
                  }}>
                    {`📌 ${editCategory}\n⚠️ ${editSeverity} Priority\n🏢 ${editDept}\n📝 ${editTitle}\n📍 ${editAddress.slice(0, 60)}...`}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={handleConfirmReport} disabled={submitting} style={{
                    background: submitting ? "#94A3B8" : "linear-gradient(135deg,#10B981,#059669)",
                    border: "none", borderRadius: "12px", padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer", flex: 1, boxShadow: submitting ? "none" : "0 4px 12px rgba(16,185,129,0.2)",
                  }}>
                    {submitting ? "Submitting..." : "✅ Submit Report"}
                  </button>
                  <button onClick={() => setEditMode(prev => !prev)} disabled={submitting} style={{
                    background: editMode ? "#E0F2FE" : "#F1F5F9", border: editMode ? "1px solid #BAE6FD" : "1px solid #E2E8F0",
                    borderRadius: "12px", padding: "12px 16px", color: editMode ? "#0369A1" : "#475569", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                  }}>
                    {editMode ? "Done" : "✏️ Edit"}
                  </button>
                  <button onClick={handleCancel} disabled={submitting} style={{
                    background: "#FFE4E6", border: "1px solid #FECDD3", borderRadius: "12px", padding: "12px 16px",
                    color: "#BE123C", fontSize: "14px", cursor: "pointer", fontWeight: 700,
                  }}>✕</button>
                </div>
              </div>
            )}

            {(loading || analyzing || submitting) && (
              <div className="msg-enter" style={{
                background: "#fff", border: "1px solid #E2E8F0", borderRadius: "18px 18px 18px 4px", padding: "10px 16px",
                fontSize: "13px", color: "#64748B", alignSelf: "flex-start", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}>
                <span>⏳</span>
                {analyzing ? "Analyzing media..." : submitting ? "Submitting report..." : "Typing..."}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick replies */}
          {messages.length <= 1 && (
            <div style={{
              padding: "12px 16px", display: "flex", gap: "8px", flexWrap: "wrap", background: "#fff", borderTop: "1px solid #F1F5F9",
            }}>
              {["Road pothole issue","Streetlight broken","Garbage uncollected"].map(q => (
                <button key={q} className="quick-reply" onClick={() => { setInput(q); inputRef.current?.focus(); }} style={{
                  background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "20px", padding: "6px 12px",
                  fontSize: "12px", color: "#0F4C75", cursor: "pointer", fontWeight: 600,
                }}>{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: "12px 16px", display: "flex", gap: "8px", borderTop: "1px solid #E2E8F0", background: "#fff", flexShrink: 0, alignItems: "center",
          }}>
            {/* Camera button */}
            <button onClick={() => fileRef.current?.click()} disabled={analyzing || loading || submitting} title="Take photo" style={{
              background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: "12px", width: "42px", height: "42px",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "18px", flexShrink: 0,
            }}>📷</button>
            {/* Gallery button */}
            <button onClick={() => galleryRef.current?.click()} disabled={analyzing || loading || submitting} title="Choose from gallery" style={{
              background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: "12px", width: "42px", height: "42px",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "18px", flexShrink: 0,
            }}>🖼️</button>
            <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm"
              capture="environment" style={{ display: "none" }}
              onChange={e => { if (e.target.files?.[0]) handleMedia(e.target.files[0]); e.target.value = ""; }} />
            <input ref={galleryRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm"
              style={{ display: "none" }}
              onChange={e => { if (e.target.files?.[0]) handleMedia(e.target.files[0]); e.target.value = ""; }} />
            
            {/* Voice Input Mic Button */}
            <button onClick={handleListen} disabled={analyzing || loading || submitting} title="Speak" style={{
              background: isListening ? "#EF4444" : "#F1F5F9", border: "1px solid", borderColor: isListening ? "#EF4444" : "#E2E8F0",
              color: isListening ? "#fff" : "#0F172A", borderRadius: "12px", width: "42px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: "16px", flexShrink: 0, animation: isListening ? "pulseMic 1.5s infinite" : "none", transition: "all 0.2s ease"
            }}>🎤</button>

            <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening..." : "Type your issue..."} disabled={submitting} className="chat-input-focus" style={{
                flex: 1, border: "1px solid #CBD5E1", borderRadius: "12px", padding: "12px 16px", fontSize: "14px", outline: "none", background: "#F8FAFC", color: "#0F172A", width: "100%"
            }} />
            
            <button onClick={handleSend} disabled={loading || analyzing || submitting || !input.trim()} style={{
              background: input.trim() && !loading && !analyzing && !submitting ? "#0F4C75" : "#CBD5E1",
              border: "none", borderRadius: "12px", padding: "0 16px", color: "#fff", fontSize: "14px", fontWeight: 700,
              cursor: input.trim() ? "pointer" : "not-allowed", flexShrink: 0, height: "42px", boxShadow: input.trim() ? "0 4px 12px rgba(15,76,117,0.2)" : "none", transition: "all 0.2s ease",
            }}>Send</button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button className="fab-btn" onClick={() => setOpen(prev => !prev)} style={{
        position: "fixed", bottom: "24px", right: "24px", width: "64px", height: "64px", borderRadius: "50%",
        background: open ? "linear-gradient(135deg,#071D3A,#0F4C75)" : "linear-gradient(135deg,#0F4C75,#10B981)",
        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1001, boxShadow: open ? "0 4px 15px rgba(0,0,0,0.2)" : "0 8px 30px rgba(16,185,129,0.4)",
        transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)", transform: open ? "scale(0.95)" : "scale(1)",
      }}>
        <div style={{
          transition: "transform 0.4s cubic-bezier(0.68,-0.55,0.265,1.55)", display: "flex", alignItems: "center", justifyContent: "center",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
        }}>
          {open ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          )}
        </div>
      </button>
    </>
  );
}