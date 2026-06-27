import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../features/part/userSlice";
import { Menu, MenuButton, MenuList, MenuItem, MenuDivider } from "@chakra-ui/react";

const navigation = [
  { name: "Maintenance", path: "/Maintenance" },
  { name: "Utility", path: "/Utility" },
  { name: "Production", path: "/production" },
  { name: "Building", path: "/building" },
];

const IDLE_TIMEOUT = 10 * 60 * 1000;

export default function Navbar() {
  const userGlobal = useSelector((state) => state.user.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const logOut = useCallback(() => {
    dispatch(logout());
    localStorage.removeItem("user_token");
    navigate("/");
  }, [dispatch, navigate]);

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
      <div className="mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <div className="flex items-center gap-8">
            <img
              src="https://www.lapilaboratories.com/assets/images/logo%20lapi2-01.png"
              alt="Lapi"
              className="h-8 w-auto brightness-0 invert"
            />

            {/* Nav Links */}
            <div className="hidden sm:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = location.pathname.toLowerCase() === item.path.toLowerCase();
                return (
                  <button
                    key={item.name}
                    onClick={() => navigate(item.path)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
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
          </div>

          {/* User Menu */}
          <Menu>
            <MenuButton className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition">
              <img
                className="h-7 w-7 rounded-full object-cover ring-2 ring-green-500"
                src="https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"
                alt="avatar"
              />
              <span className="text-sm text-white font-medium hidden sm:block">
                {userGlobal.name?.split(" ")[0].charAt(0).toUpperCase() + userGlobal.name?.split(" ")[0].slice(1).toLowerCase()}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </MenuButton>
            <MenuList minW="160px" shadow="lg" borderRadius="lg" border="1px solid #e5e7eb">
              <MenuItem
                onClick={() => navigate("/editprofile")}
                fontSize="sm"
                _hover={{ bg: "gray.50" }}
              >
                ✏️ &nbsp; Edit Profile
              </MenuItem>
              <MenuDivider />
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
    </nav>
  );
}