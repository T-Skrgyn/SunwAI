import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import Login from "./pages/auth/Login";
import RoleSelect from "./pages/auth/RoleSelect";
import CitizenDashboard from "./pages/citizen/Dashboard";
import ReportIssue from "./pages/citizen/ReportIssue";
import MyIssues from "./pages/citizen/MyIssues";
import WardDashboard from "./pages/ward/Dashboard";
import DeptDashboard from "./pages/dept/Dashboard";
import CorpDashboard from "./pages/corp/Dashboard";
import ChatBot from "./components/chat/ChatBot";

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { user, firebaseUser, loading } = useAuthStore();
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  if (!firebaseUser) return <Navigate to="/login" />;
  if (!user) return <Navigate to="/role-select" />;
  if (allowedRoles && !allowedRoles.includes(user.role))
    return <Navigate to="/" />;
  return <>{children}</>;
}

function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" />;
  const routes: Record<string, string> = {
    citizen: "/citizen",
    ward: "/ward",
    dept: "/dept",
    corp: "/corp",
  };
  return <Navigate to={routes[user.role] || "/login"} />;
}

function AppShell() {
  const { user } = useAuthStore();
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/role-select" element={<RoleSelect />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoleRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/citizen"
          element={
            <ProtectedRoute allowedRoles={["citizen"]}>
              <CitizenDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/citizen/report"
          element={
            <ProtectedRoute allowedRoles={["citizen"]}>
              <ReportIssue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/citizen/my-issues"
          element={
            <ProtectedRoute allowedRoles={["citizen"]}>
              <MyIssues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ward"
          element={
            <ProtectedRoute allowedRoles={["ward"]}>
              <WardDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dept"
          element={
            <ProtectedRoute allowedRoles={["dept"]}>
              <DeptDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/corp"
          element={
            <ProtectedRoute allowedRoles={["corp"]}>
              <CorpDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {/* Show chatbot only when logged in */}
      {user && <ChatBot />}
    </>
  );
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => {
    init();
  }, []);

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}