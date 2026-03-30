import { NavLink } from "react-router-dom";
import { useActor } from "../../context/ActorContext";
import { useAuth } from "../../context/AuthContext";
import logo from "../../../assets/images/Provisa.svg";

export default function Header() {
  const { actor, isAdmin } = useActor();
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="ConstitutionalERP" className="h-8 w-auto" />
          <span className="text-lg font-semibold">ConstitutionalERP</span>
        </div>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <NavLink to="/" className="nav-link">Home</NavLink>
          <NavLink to="/canvas" className="nav-link">Canvas</NavLink>
          <NavLink to="/navigator-sessions" className="nav-link">Navigator Sessions</NavLink>
          {isAdmin ? <NavLink to="/admin" className="nav-link">Admin</NavLink> : null}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1">{actor?.actorId ?? "anonymous"}</span>
          <button className="rounded-xl bg-slate-900 px-3 py-1.5 text-white" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
