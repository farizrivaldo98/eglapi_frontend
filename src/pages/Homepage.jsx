import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const modules = [
  { name: "Maintenance", path: "/maintenance" },
  { name: "Utility",     path: "/Utility"},
  { name: "Production",  path: "/production"},
  { name: "Building",    path: "/building"},
    { name: "Scadamonitor",    path: "/Scadamonitor"},
];



// Starting point — ganti isinya sesuai kebutuhan (ringkasan audit trail
// terbaru, status alarm, dsb). Path module di atas ngikutin App.js.
export default function HomePage() {
  const [allowedPages, setAllowedPages] = useState([]);
  const userGlobal = useSelector((state) => state.user.user);
  const navigate = useNavigate();

useEffect(() => {
  const fetchAccess = async () => {
    try {
      const token = localStorage.getItem("user_token");

      const res = await axios.get(
        "http://10.163.0.66:8002/part/page-access",
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setAllowedPages(res.data[userGlobal.level] || []);
    } catch (err) {
      console.error("Gagal load access", err);
    }
  };

  if (userGlobal?.level) fetchAccess();
}, [userGlobal?.level]);

  return (
    <div className="min-h-screen bg-gray-100 px-8 py-10">
      <h1 className="text-2xl font-bold text-gray-800">
        Welcome back, {userGlobal.name || "User"}
      </h1>
      <p className="text-gray-500 mb-8">PT. Lapi Laboratories — Internal System</p>

<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {modules
    .filter(m =>
      allowedPages.some(p =>
        typeof p === "string"
          ? p === m.name
          : p.name === m.name
      )
    )
    .map((item) => (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
      >
        {item.name}
      </button>
    ))}
</div>
    </div>
  );
}