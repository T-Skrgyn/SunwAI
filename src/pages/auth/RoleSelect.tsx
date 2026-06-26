import { useAuthStore } from "../../store/authStore";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function RoleSelect() {
  const { setRole, firebaseUser, user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleSelect = async () => {
    await setRole("citizen");
    navigate("/");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .role-container { min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; background: linear-gradient(135deg, #071D3A 0%, #0F4C75 50%, #10B981 100%); display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow: hidden; }
        .bg-shape1 { position: absolute; top: -10%; left: -10%; width: 50vw; height: 50vw; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%); }
        .bg-shape2 { position: absolute; bottom: -10%; right: -10%; width: 60vw; height: 60vw; border-radius: 50%; background: radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(255,255,255,0) 70%); }
        @keyframes cardEnter { 0% { opacity: 0; transform: translateY(30px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .glass-card { background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(20px); border-radius: 28px; padding: 40px 32px; width: 100%; max-width: 420px; box-shadow: 0 24px 50px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.6); animation: cardEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; position: relative; z-index: 10; text-align: center; }
        .btn-scale { transition: all 0.2s ease; cursor: pointer; }
        .btn-scale:active { transform: scale(0.97); }
        .btn-scale:hover { filter: brightness(1.05); transform: translateY(-2px); box-shadow: 0 12px 24px rgba(16,185,129,0.3); }
        .role-box { background: #F8FAFC; border: 2px solid #E2E8F0; border-radius: 24px; padding: 32px 24px; transition: all 0.3s ease; }
        .role-box:hover { border-color: #10B981; background: #F0FDF4; }
      `}</style>
      <div className="role-container">
        <div className="bg-shape1" />
        <div className="bg-shape2" />
        <div className="glass-card">
          <div style={{ marginBottom: "32px" }}>
            <div style={{ background: "#F1F5F9", display: "inline-block", padding: "12px 20px", borderRadius: "20px", marginBottom: "20px", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }}>
              <img src="/logo.png" alt="SunwAI" style={{ height: "42px", objectFit: "contain" }} />
            </div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px", letterSpacing: "-0.5px" }}>Welcome, {firebaseUser?.displayName?.split(" ")[0]}! 👋</h1>
            <p style={{ color: "#64748B", fontSize: "14px", margin: 0, fontWeight: 500 }}>Let's get your account set up.</p>
          </div>
          <div className="role-box">
            <div style={{ width: "72px", height: "72px", background: "linear-gradient(135deg, #0F4C75, #10B981)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", margin: "0 auto 20px", boxShadow: "0 8px 20px rgba(16,185,129,0.3)" }}>🏘️</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "8px" }}>Citizen Profile</div>
            <div style={{ fontSize: "14px", color: "#64748B", lineHeight: 1.5, marginBottom: "24px", fontWeight: 500 }}>Report civic issues, earn impact points, and help improve your community.</div>
            <button onClick={handleSelect} className="btn-scale" style={{ width: "100%", background: "linear-gradient(135deg, #0F4C75 0%, #10B981 100%)", color: "#fff", border: "none", borderRadius: "16px", padding: "16px", fontSize: "15px", fontWeight: 700, boxShadow: "0 8px 20px rgba(16,185,129,0.2)" }}>
              Continue as Citizen
            </button>
          </div>
          <p style={{ textAlign: "center", color: "#94A3B8", fontSize: "12px", marginTop: "24px", fontWeight: 500 }}>Note: Authority accounts must use the secure email login portal.</p>
        </div>
      </div>
    </>
  );
}