import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutWithAudit } from "../features/part/userSlice";   // ← UBAH import
import { Menu, MenuButton, MenuList, MenuItem, MenuDivider } from "@chakra-ui/react";

const navigation = [
  { name: "Maintenance", path: "/Maintenance" },
  { name: "Utility",     path: "/Utility" },
  { name: "Production",  path: "/production" },
  { name: "Building",    path: "/building" },
];

const IDLE_TIMEOUT = 10 * 60 * 1000;

function formatName(name = "") {
  return name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default function Navbar() {
  const userGlobal = useSelector((state) => state.user.user);
  const dispatch   = useDispatch();
  const navigate   = useNavigate();
  const location   = useLocation();

  // ── logOut: catat LOGOUT dulu, baru bersihkan sesi ──────────
  const logOut = useCallback(async () => {
    await dispatch(logoutWithAudit());   // ← pakai thunk baru
    navigate("/");
  }, [dispatch, navigate]);
  // ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userGlobal.id_users && !userGlobal.id) return;
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        alert("Sesi habis. Silakan login kembali.");
        logOut();
      }, IDLE_TIMEOUT);
    };
    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [userGlobal.id_users, userGlobal.id, logOut]);

  return (
    <nav className="bg-gray-900 border-b border-gray-700 shadow-md">
      <div className="px-4 lg:px-8">
        <div className="flex items-center h-14 gap-6">

          {/* Logo */}
          <img
            src="https://www.lapilaboratories.com/assets/images/logo%20lapi2-01.png"
            alt="Lapi"
            className="h-8 w-auto brightness-0 invert flex-shrink-0"
          />

          {/* Nav Links */}
          <div className="flex items-center gap-1 flex-1">
            {navigation.map((item) => {
              const isActive =
                location.pathname.toLowerCase() === item.path.toLowerCase();
              return (
                <button
                  key={item.name}
                  onClick={() => navigate(item.path)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-green-600 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex-shrink-0">
            <Menu placement="bottom-end">
              <MenuButton>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition">
                  <img
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-green-500 flex-shrink-0"
                    src="https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"
                    alt="avatar"
                  />
                  <span className="text-sm text-white font-medium max-w-[140px] truncate">
                    {formatName(userGlobal.name)}
                  </span>
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </MenuButton>

              <MenuList
                minW="180px"
                shadow="lg"
                borderRadius="lg"
                border="1px solid #e5e7eb"
                zIndex={50}
              >
                {/* Edit Profile */}
                <MenuItem
                  onClick={() => navigate("/editprofile")}
                  fontSize="sm"
                  _hover={{ bg: "gray.50" }}
                >
                  ✏️ &nbsp; Edit Profile
                </MenuItem>

                {/* ── AUDIT TRAIL — hanya tampil untuk isAdmin == 1 ── */}
                {Number(userGlobal.isAdmin) === 1 && (
                  <>
                    <MenuItem
                      onClick={() => navigate("/audit-trail")}
                      fontSize="sm"
                      _hover={{ bg: "blue.50" }}
                      color="blue.600"
                    >
                      📋 &nbsp; Audit Trail
                    </MenuItem>
                  </>
                )}
                {/* ─────────────────────────────────────────────────── */}

                <MenuDivider />

                {/* Logout */}
                <MenuItem
                  onClick={logOut}
                  fontSize="sm"
                  color="red.500"
                  _hover={{ bg: "red.50" }}
                >
                  🚪 &nbsp; Logout
                </MenuItem>
              </MenuList>
            </Menu>
          </div>

        </div>
      </div>
    </nav>
  );
}