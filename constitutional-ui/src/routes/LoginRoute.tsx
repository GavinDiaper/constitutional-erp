import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";
import { useAuth } from "../context/AuthContext";
import logo from "../../assets/images/Provisa.svg";

export default function LoginRoute() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(username: string, password: string) {
    setError(null);
    setIsLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <img src={logo} alt="ConstitutionalERP" className="mb-4 h-10 w-auto" />
        <h1 className="mb-1 text-2xl font-semibold">ConstitutionalERP</h1>
        <p className="mb-4 text-sm text-slate-600">Sign in</p>
        {error ? <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
        <LoginForm onSubmit={handleLogin} isLoading={isLoading} />
        <p className="mt-4 text-center text-xs text-slate-500">Powered by FoundationERP</p>
      </div>
    </div>
  );
}
