import { useState, useEffect } from "react";
import { useAuthStore } from "../../store/authStore";
import { useNavigate } from "react-router-dom";

type Tab = "login" | "register";

export default function Login() {
  const { login, loginWithEmail, register, user, firebaseUser } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
    else if (firebaseUser) navigate("/role-select");
  }, [user, firebaseUser, navigate]);

  const handleEmailAuth = async () => {
    setError("");
    setLoading(true);
    try {
      if (tab === "register") {
        if (!name.trim()) { setError("Please enter your name"); setLoading(false); return; }
        await register(name, email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.includes("invalid-credential") || msg.includes("wrong-password")) {
        setError("Invalid email or password");
      } else if (msg.includes("email-already-in-use")) {
        setError("Email already registered. Please login.");
      } else if (msg.includes("weak-password")) {
        setError("Password must be at least 6 characters");
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await login();
    } catch {
      setError("Google sign-in failed. Try again.");
    }
    setLoading(false);
  };

  const inputStyle = {
    width: "100%", padding: "14px 16px", borderRadius: "14px",
    border: "1px solid #E2E8F0", background: "#F8FAFC",
    fontSize: "14px", color: "#0F172A", outline: "none",
    boxSizing: "border-box" as const, transition: "all 0.3s ease"
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .login-container { min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; background: linear-gradient(135deg, #071D3A 0%, #0F4C75 50%, #10B981 100%); display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow: hidden; }
        .login-bg-shape1 { position: absolute; top: -10%; left: -10%; width: 50vw; height: 50vw; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%); }
        .login-bg-shape2 { position: absolute; bottom: -10%; right: -10%; width: 60vw; height: 60vw; border-radius: 50%; background: radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(255,255,255,0) 70%); }
        @keyframes cardEnter { 0% { opacity: 0; transform: translateY(30px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .glass-card { background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(20px); border-radius: 28px; padding: 40px 32px; width: 100%; max-width: 420px; box-shadow: 0 24px 50px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.6); animation: cardEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; position: relative; z-index: 10; }
        .auth-input:focus { border-color: #10B981 !important; background: #fff !important; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1); }
        .btn-scale { transition: all 0.2s ease; cursor: pointer; }
        .btn-scale:active:not(:disabled) { transform: scale(0.97); }
        .btn-scale:hover:not(:disabled) { filter: brightness(1.05); }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-field { animation: fadeInDown 0.3s ease forwards; }
      `}</style>
      <div className="login-container">
        <div className="login-bg-shape1" />
        <div className="login-bg-shape2" />
        <div className="glass-card">
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ background: "#F1F5F9", display: "inline-block", padding: "12px 20px", borderRadius: "20px", marginBottom: "16px", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }}>
              <img src="/logo.png" alt="SunwAI" style={{ height: "42px", objectFit: "contain" }} />
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px", letterSpacing: "-0.5px" }}>Welcome to SunwAI</h1>
            <p style={{ color: "#64748B", fontSize: "14px", margin: 0, fontWeight: 500 }}>AI-Powered Civic Issue Resolution</p>
          </div>
          <div style={{ display: "flex", background: "#F1F5F9", borderRadius: "16px", padding: "6px", marginBottom: "24px" }}>
            {(["login", "register"] as Tab[]).map((t) => {
              const isActive = tab === t;
              return (
                <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", fontSize: "14px", fontWeight: isActive ? 700 : 600, cursor: "pointer", background: isActive ? "#fff" : "transparent", color: isActive ? "#0F4C75" : "#64748B", boxShadow: isActive ? "0 4px 12px rgba(0,0,0,0.05)" : "none", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>
                  {t === "login" ? "Sign In" : "Register"}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {tab === "register" && (
              <div className="animate-field">
                <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" style={inputStyle} />
              </div>
            )}
            <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()} className="auth-input" style={inputStyle} />
            {error && <div className="animate-field" style={{ background: "#FFE4E6", color: "#BE123C", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, border: "1px solid #FECDD3" }}>{error}</div>}
            <button onClick={handleEmailAuth} disabled={loading} className="btn-scale" style={{ background: loading ? "#94A3B8" : "linear-gradient(135deg, #0F4C75 0%, #10B981 100%)", color: "#fff", border: "none", borderRadius: "14px", padding: "16px", fontSize: "15px", fontWeight: 700, marginTop: "8px", boxShadow: loading ? "none" : "0 8px 20px rgba(16,185,129,0.25)", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Processing..." : tab === "login" ? "Sign In Securely" : "Create Account"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "24px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }} />
            <span style={{ color: "#94A3B8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>Or</span>
            <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }} />
          </div>
          <button onClick={handleGoogle} disabled={loading} className="btn-scale" style={{ width: "100%", background: "#fff", border: "1px solid #CBD5E1", borderRadius: "14px", padding: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", color: "#334155", fontSize: "14px", fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.02)", opacity: loading ? 0.7 : 1 }}>
            <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: "18px", height: "18px" }} /> Continue with Google
          </button>
          <div style={{ marginTop: "32px", background: "#FFFBEB", border: "1px dashed #FCD34D", borderRadius: "16px", padding: "16px", textAlign: "center" }}>
            <p style={{ color: "#D97706", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Test Credentials (Authorities)</p>
            <div style={{ color: "#92400E", fontSize: "12px", fontWeight: 500, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "2px" }}>
              <span>ward@sunwai.com</span><span>municipalco@sunwai.com</span><span>departmentofficer@sunwai.com</span>
            </div>
            <div style={{ background: "#FEF3C7", display: "inline-block", padding: "4px 12px", borderRadius: "10px", color: "#B45309", fontSize: "12px", fontWeight: 700, marginTop: "10px" }}>Pass: 123456</div>
          </div>
        </div>
      </div>
    </>
  );
}