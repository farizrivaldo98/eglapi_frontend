import { useState, useEffect } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import {
  Select,
  Input,
  Button,
  Spinner,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
} from "@chakra-ui/react";

const BASE_URL = "http://10.163.0.66:8002";

const ACTION_COLOR = {
  LOGIN:        "green",
  LOGOUT:       "red",
  VIEW_UTILITY: "blue",
  EXPORT_PDF:   "orange",
};

const ACTION_LABEL = {
  LOGIN:        "🔑 Login",
  LOGOUT:       "🚪 Logout",
  VIEW_UTILITY: "👁️ Lihat Data",
  EXPORT_PDF:   "📄 Export PDF",
};

const ROWS_PER_PAGE = 20;

function parseDetail(detailStr) {
  try {
    const d = JSON.parse(detailStr || "{}");
    if (!d.area && !d.start && !d.finish) return <span className="text-gray-400">—</span>;
    const cleanArea = d.area
      ? d.area.replace("cMT-PMWorkshop_", "").replace("_data", "")
      : "";
    return (
      <div className="text-xs leading-5">
        {cleanArea && (
          <div>
            <span className="font-semibold">Ruang:</span> {cleanArea}
          </div>
        )}
        {d.start && (
          <div>
            <span className="font-semibold">Dari:</span>{" "}
            {d.start.replace("T", " ")}
          </div>
        )}
        {d.finish && (
          <div>
            <span className="font-semibold">Sampai:</span>{" "}
            {d.finish.replace("T", " ")}
          </div>
        )}
      </div>
    );
  } catch {
    return <span className="text-gray-400">—</span>;
  }
}

export default function AuditTrail() {
  const userGlobal = useSelector((state) => state.user.user);
  const token      = localStorage.getItem("user_token");

  const [logs,    setLogs]    = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const [filters, setFilters] = useState({
    startDate: "",
    endDate:   "",
    userId:    "all",
    action:    "all",
  });

  const [currentPage, setCurrentPage] = useState(1);

  // ── ambil daftar user untuk dropdown ──────────────────────
  useEffect(() => {
    if (Number(userGlobal.isAdmin) !== 1) return;
    axios
      .get(`${BASE_URL}/audit/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUsers(res.data))
      .catch((e) => console.error("Gagal ambil users:", e));
  }, []);

  // ── fetch log dari backend ─────────────────────────────────
  const fetchLogs = async () => {
    setLoading(true);
    setFetched(false);
    try {
      const params = {};
      if (filters.startDate)        params.startDate = filters.startDate;
      if (filters.endDate)          params.endDate   = filters.endDate;
      if (filters.userId !== "all") params.userId    = filters.userId;

      const res = await axios.get(`${BASE_URL}/audit/list`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });

      let data = res.data;
      if (filters.action !== "all") {
        data = data.filter((l) => l.action === filters.action);
      }
      setLogs(data);
      setCurrentPage(1);
      setFetched(true);
    } catch (e) {
      console.error("Gagal ambil audit trail:", e);
      alert("Gagal memuat data audit trail.");
    } finally {
      setLoading(false);
    }
  };

  // ── guard: hanya admin ─────────────────────────────────────
  if (Number(userGlobal.isAdmin) !== 1) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-red-500 text-lg font-semibold">
          ⛔ Akses ditolak. Hanya administrator yang dapat melihat halaman ini.
        </p>
      </div>
    );
  }

  // ── summary per aksi ───────────────────────────────────────
  const summary = ["LOGIN", "LOGOUT", "VIEW_UTILITY", "EXPORT_PDF"].map((act) => ({
    act,
    count: logs.filter((l) => l.action === act).length,
  }));

  // ── pagination ─────────────────────────────────────────────
  const totalPages    = Math.max(1, Math.ceil(logs.length / ROWS_PER_PAGE));
  const paginatedLogs = logs.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  return (
    <div className="p-6 max-w-screen-xl mx-auto">

      {/* ── Judul ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📋 Audit Trail</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rekam aktivitas seluruh pengguna sistem (login, logout, akses data, export PDF).
        </p>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap gap-4 mb-6 bg-gray-100 dark:bg-gray-800 p-4 rounded-xl shadow-sm">
        <div>
          <p className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-300">
            Tanggal Mulai
          </p>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) =>
              setFilters((f) => ({ ...f, startDate: e.target.value }))
            }
            size="sm"
            width="160px"
            bg="white"
            _dark={{ bg: "gray.700" }}
          />
        </div>

        <div>
          <p className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-300">
            Tanggal Akhir
          </p>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) =>
              setFilters((f) => ({ ...f, endDate: e.target.value }))
            }
            size="sm"
            width="160px"
            bg="white"
            _dark={{ bg: "gray.700" }}
          />
        </div>

        <div>
          <p className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-300">
            User
          </p>
          <Select
            value={filters.userId}
            onChange={(e) =>
              setFilters((f) => ({ ...f, userId: e.target.value }))
            }
            size="sm"
            width="220px"
            bg="white"
            _dark={{ bg: "gray.700" }}
          >
            <option value="all">Semua User</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username})
              </option>
            ))}
          </Select>
        </div>

        <div>
          <p className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-300">
            Aksi
          </p>
          <Select
            value={filters.action}
            onChange={(e) =>
              setFilters((f) => ({ ...f, action: e.target.value }))
            }
            size="sm"
            width="190px"
            bg="white"
            _dark={{ bg: "gray.700" }}
          >
            <option value="all">Semua Aksi</option>
            <option value="LOGIN">🔑 Login</option>
            <option value="LOGOUT">🚪 Logout</option>
            <option value="VIEW_UTILITY">👁️ Lihat Data Utility</option>
            <option value="EXPORT_PDF">📄 Export PDF</option>
          </Select>
        </div>

        <div className="flex items-end">
          <Button onClick={fetchLogs} colorScheme="blue" size="sm" px={6}>
            Tampilkan
          </Button>
        </div>
      </div>

      {/* ── Summary Tiles ── */}
      {fetched && (
        <div className="flex flex-wrap gap-3 mb-5">
          {summary.map(({ act, count }) => (
            <div
              key={act}
              className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-lg px-4 py-2 shadow-sm border border-gray-100 dark:border-gray-600"
            >
              <Badge colorScheme={ACTION_COLOR[act]} fontSize="xs">
                {ACTION_LABEL[act]}
              </Badge>
              <span className="text-sm font-bold">{count}</span>
              <span className="text-xs text-gray-500">kejadian</span>
            </div>
          ))}
          <div className="flex items-center gap-2 bg-gray-800 text-white rounded-lg px-4 py-2 shadow-sm">
            <span className="text-sm font-bold">Total: {logs.length}</span>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center mt-16">
          <Spinner size="xl" color="blue.500" thickness="4px" />
        </div>
      )}

      {/* ── Tabel ── */}
      {!loading && (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-x-auto">
            <TableContainer>
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr bg="gray.700">
                    <Th color="white" width="50px">No</Th>
                    <Th color="white" whiteSpace="nowrap">Waktu Server</Th>
                    <Th color="white">User</Th>
                    <Th color="white">Aksi</Th>
                    <Th color="white">Detail Ruang / Tanggal Data</Th>
                    <Th color="white">IP Address</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {paginatedLogs.length === 0 ? (
                    <Tr>
                      <Td colSpan={6} textAlign="center" py={12} color="gray.400">
                        {!fetched
                          ? "Pilih filter lalu klik Tampilkan"
                          : "Tidak ada data yang cocok dengan filter ini"}
                      </Td>
                    </Tr>
                  ) : (
                    paginatedLogs.map((log, i) => (
                      <Tr
                        key={log.id}
                        _hover={{ bg: "gray.50", _dark: { bg: "gray.800" } }}
                      >
                        <Td color="gray.400" fontSize="xs">
                          {(currentPage - 1) * ROWS_PER_PAGE + i + 1}
                        </Td>
                        <Td whiteSpace="nowrap" fontSize="sm">
                          {log.server_time
                            ? String(log.server_time).replace("T", " ").slice(0, 19)
                            : "—"}
                        </Td>
                        <Td fontWeight="semibold" fontSize="sm">
                          {log.user_name}
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={ACTION_COLOR[log.action] || "gray"}
                            px={2}
                            py={0.5}
                            borderRadius="full"
                          >
                            {ACTION_LABEL[log.action] || log.action}
                          </Badge>
                        </Td>
                        <Td>{parseDetail(log.detail)}</Td>
                        <Td fontSize="xs" color="gray.400">
                          {log.ip_address || "—"}
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-5 gap-4">
              <Button
                size="sm"
                colorScheme="blue"
                variant="outline"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                isDisabled={currentPage === 1}
              >
                ← Previous
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Halaman <strong>{currentPage}</strong> dari{" "}
                <strong>{totalPages}</strong> &nbsp;|&nbsp; {logs.length} data
              </span>
              <Button
                size="sm"
                colorScheme="blue"
                variant="outline"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                isDisabled={currentPage === totalPages}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}