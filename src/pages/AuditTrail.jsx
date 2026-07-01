import { useState, useEffect } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  TableCaption, TableContainer,
  Badge, Spinner, Button, Input, Select, Stack,
  useColorMode, useColorModeValue,
} from "@chakra-ui/react";

const BASE_URL = "http://10.163.0.66:8002";

const ACTION_CFG = {
  LOGIN:             { colorScheme: "green",  label: "Login"    },
  LOGOUT:            { colorScheme: "red",    label: "Logout"    },
  VIEW_UTILITY:      { colorScheme: "blue",   label: "Lihat Data"  },
  EXPORT_PDF:        { colorScheme: "yellow", label: "Export PDF" },
  ADMIN_EDIT_USER:   { colorScheme: "orange", label: "Edit User"},
  ADMIN_DELETE_USER: { colorScheme: "red",    label: "Hapus User" },
  SCADA_EDIT_LIMIT:  { colorScheme: "purple",    label: "Hapus User" },

};

const ROWS_PER_PAGE = 20;

/* ── helpers ── */
const formatIP   = (ip) => (!ip ? "—" : ip.replace("::ffff:", ""));
const formatTime = (t) => {
  if (!t) return "—";
  const str = String(t);
  // Jika backend sudah return plain string "YYYY-MM-DD HH:MM:SS" (WIB) → langsung pakai
  if (!str.includes("T") && !str.includes("Z")) return str.slice(0, 19);
  // Fallback: ISO UTC string → convert ke WIB (UTC+7)
  const date = new Date(str);
  if (isNaN(date.getTime())) return str.slice(0, 19);
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
};

/* ── sub-components ── */
function ActionBadge({ action }) {
  const cfg = ACTION_CFG[action] || { colorScheme: "gray", label: action, icon: "•" };
  return (
    <Badge colorScheme={cfg.colorScheme} fontSize="xs">
      {cfg.icon} {cfg.label}
    </Badge>
  );
}

function parseDetail(detailStr) {
  try {
    const d = JSON.parse(detailStr || "{}");

    // Empty object → —
    if (Object.keys(d).length === 0) return "—";

    // VIEW_UTILITY / EXPORT_PDF → { area, start, finish }
    if (d.area || d.start || d.finish) {
      const cleanArea = d.area
        ? d.area.replace("cMT-PMWorkshop_", "").replace("_data", "")
        : "";
      return (
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          {cleanArea && (
            <div>
              <span style={{ fontWeight: 600 }}>Ruang: </span>
              {cleanArea}
            </div>
          )}
          {d.start && (
            <div>
              <span style={{ fontWeight: 600 }}>Dari: </span>
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                {d.start.replace("T", " ")}
              </span>
            </div>
          )}
          {d.finish && (
            <div>
              <span style={{ fontWeight: 600 }}>Sampai: </span>
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                {d.finish.replace("T", " ")}
              </span>
            </div>
          )}
        </div>
      );
    }

    // ADMIN_EDIT_USER / ADMIN_DELETE_USER → { target_id, target_name, updated_fields }
    if (d.target_id !== undefined || d.target_name) {
      return (
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          {d.target_name && (
            <div>
              <span style={{ fontWeight: 600 }}>User: </span>
              {d.target_name}
            </div>
          )}
          {d.target_id !== undefined && (
            <div>
              <span style={{ fontWeight: 600 }}>ID: </span>
              {d.target_id}
            </div>
          )}
          {d.updated_fields && (
            <div>
              <span style={{ fontWeight: 600 }}>Fields: </span>
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                {Array.isArray(d.updated_fields)
                  ? d.updated_fields.join(", ")
                  : d.updated_fields}
              </span>
            </div>
          )}
        </div>
      );
    }

    // Fallback: tampilkan raw JSON
    return (
      <span style={{ fontFamily: "monospace", fontSize: 11 }}>
        {JSON.stringify(d)}
      </span>
    );
  } catch {
    return "—";
  }
}

/* ── main component ── */
export default function AuditTrail() {
  const userGlobal = useSelector((state) => state.user.user);
  const token      = localStorage.getItem("user_token");

  const [logs,    setLogs]    = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", userId: "all", action: "all" });
  const [currentPage, setCurrentPage] = useState(1);

  // ── theming (same pattern as Administrator.jsx) ──────────────
  const { colorMode } = useColorMode();
  const tulisanColor  = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (Number(userGlobal.isAdmin) !== 1) return;
    axios
      .get(`${BASE_URL}/audit/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setUsers(res.data))
      .catch((e) => console.error("Gagal ambil users:", e));
  }, []);

  const fetchLogs = async () => {
    setLoading(true); setFetched(false);
    try {
      const params = {};
      if (filters.startDate)        params.startDate = filters.startDate;
      if (filters.endDate)          params.endDate   = filters.endDate;
      if (filters.userId !== "all") params.userId    = filters.userId;

      const res = await axios.get(`${BASE_URL}/audit/list`, {
        params, headers: { Authorization: `Bearer ${token}` },
      });

      let data = res.data;
      if (filters.action !== "all") data = data.filter((l) => l.action === filters.action);
      setLogs(data); setCurrentPage(1); setFetched(true);
    } catch (e) {
      console.error("Gagal ambil audit trail:", e);
      alert("Gagal memuat data audit trail.");
    } finally { setLoading(false); }
  };

  /* ── guard ── */
  if (Number(userGlobal.isAdmin) !== 1) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-red-400 text-base font-semibold">
          ⛔ Akses ditolak. Hanya administrator yang dapat melihat halaman ini.
        </p>
      </div>
    );
  }

  const summary      = ["LOGIN", "LOGOUT", "VIEW_UTILITY", "EXPORT_PDF", "ADMIN_EDIT_USER", "ADMIN_DELETE_USER"].map((act) => ({
    act, count: logs.filter((l) => l.action === act).length,
  }));
  const totalPages    = Math.max(1, Math.ceil(logs.length / ROWS_PER_PAGE));
  const paginatedLogs = logs.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const labelStyle = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.1em", display: "block", marginBottom: 4,
    color: tulisanColor,
  };

  return (
    <div>
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-center mx-6 mt-6 mb-4">
        <h2 className="text-xl font-bold text-text"> Audit Trail</h2>
        {fetched && (
          <Badge colorScheme="purple" fontSize="0.8em" px={3} py={1}>
            Total: {logs.length} data
          </Badge>
        )}
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <div className="mx-6 mb-4 bg-card rounded-md shadow-lg p-4">
        <Stack direction="row" spacing={3} flexWrap="wrap" align="flex-end">
          <div>
            <label style={labelStyle}>Dari</label>
            <Input
              type="date" size="sm" w="155px"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              sx={{ color: tulisanColor }}
            />
          </div>

          <div>
            <label style={labelStyle}>Sampai</label>
            <Input
              type="date" size="sm" w="155px"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              sx={{ color: tulisanColor }}
            />
          </div>

          <div>
            <label style={labelStyle}>User</label>
            <Select
              size="sm" w="220px"
              value={filters.userId}
              onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
              sx={{ color: tulisanColor }}
            >
              <option value="all">Semua User</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
              ))}
            </Select>
          </div>

          <div>
            <label style={labelStyle}>Aksi</label>
            <Select
              size="sm" w="190px"
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              sx={{ color: tulisanColor }}
            >
              <option value="all">Semua Aksi</option>
              <option value="LOGIN"> Login</option>
              <option value="LOGOUT"> Logout</option>
              <option value="VIEW_UTILITY"> Lihat Data Utility</option>
              <option value="EXPORT_PDF"> Export PDF</option>
              <option value="ADMIN_EDIT_USER"> Edit User</option>
              <option value="ADMIN_DELETE_USER"> Hapus User</option>
            </Select>
          </div>

          <Button colorScheme="purple" size="sm" onClick={fetchLogs}>
            Tampilkan
          </Button>
        </Stack>
      </div>

      {/* ── Summary Badges ─────────────────────────────────────── */}
      {fetched && (
        <div className="flex flex-wrap gap-2 mx-6 mb-4">
          {summary.filter(({ count }) => count > 0).map(({ act, count }) => {
            const cfg = ACTION_CFG[act] || { colorScheme: "gray", label: act, icon: "•" };
            return (
              <Badge key={act} colorScheme={cfg.colorScheme} fontSize="0.8em" px={3} py={1}>
                {cfg.icon} {cfg.label}: {count}
              </Badge>
            );
          })}
          <Badge colorScheme="gray" fontSize="0.8em" px={3} py={1}>
             Total: {logs.length}
          </Badge>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="mt-2 mx-6 bg-card rounded-md shadow-lg">
        {loading ? (
          <div className="flex flex-col items-center py-12">
            <Spinner
              thickness="4px"
              speed="0.65s"
              emptyColor="gray.200"
              color="purple.500"
              size="xl"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <TableContainer>
              <Table key={colorMode} variant="simple">
                <TableCaption sx={{ color: tulisanColor }}>
                  Audit Trail — PT. Lapi Laboratories
                </TableCaption>
                <Thead>
                  <Tr>
                    <Th sx={{ color: tulisanColor }}>No</Th>
                    <Th sx={{ color: tulisanColor }}>Waktu Server</Th>
                    <Th sx={{ color: tulisanColor }}>User</Th>
                    <Th sx={{ color: tulisanColor }}>Aksi</Th>
                    <Th sx={{ color: tulisanColor }}>Detail</Th>
                    <Th sx={{ color: tulisanColor }}>IP Address</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {paginatedLogs.length === 0 ? (
                    <Tr>
                      <Td colSpan={6} textAlign="center" display="table-cell" sx={{ color: tulisanColor }}>
                        {!fetched
                          ? "  Pilih filter lalu klik Tampilkan"
                          : "Tidak ada data yang cocok dengan filter ini"}
                      </Td>
                    </Tr>
                  ) : (
                    paginatedLogs.map((log, i) => (
                      <Tr key={log.id}>
                        <Td sx={{ color: tulisanColor }} fontSize="sm">
                          {(currentPage - 1) * ROWS_PER_PAGE + i + 1}
                        </Td>
                        <Td sx={{ color: tulisanColor }} fontFamily="mono" fontSize="sm" whiteSpace="nowrap">
                          {formatTime(log.server_time)}
                        </Td>
                        <Td sx={{ color: tulisanColor }} fontWeight="semibold">
                          {log.user_name}
                        </Td>
                        <Td>
                          <ActionBadge action={log.action} />
                        </Td>
                        <Td sx={{ color: tulisanColor }}>
                          {parseDetail(log.detail)}
                        </Td>
                        <Td sx={{ color: tulisanColor }} fontFamily="mono" fontSize="sm">
                          {formatIP(log.ip_address)}
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-4 mx-6 pb-4">
          <Button
            size="sm"
            variant="outline"
            isDisabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          >
            ← Prev
          </Button>
          <span className="text-text" style={{ fontSize: 13 }}>
            Hal. <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
            <span className="text-gray-400 ml-2">({logs.length} data)</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}