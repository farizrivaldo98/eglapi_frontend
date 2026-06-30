import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

const modules = [
  { name: "Maintenance", path: "/maintenance", color: "border-orange-400" },
  { name: "Utility",     path: "/Utility",     color: "border-blue-400" },
  { name: "Production",  path: "/production",  color: "border-green-400" },
  { name: "Building",    path: "/building",    color: "border-purple-400" },
];

// Starting point — ganti isinya sesuai kebutuhan (ringkasan audit trail
// terbaru, status alarm, dsb). Path module di atas ngikutin App.js.
export default function HomePage() {
  const userGlobal = useSelector((state) => state.user.user);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-100 px-8 py-10">
      <h1 className="text-2xl font-bold text-gray-800">
        Welcome back, {userGlobal.name || "User"}
      </h1>
      <p className="text-gray-500 mb-8">PT. Lapi Laboratories — Internal System</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {modules.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition text-left border-t-4 ${item.color}`}
          >
            <span className="font-semibold text-gray-700">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}