import { useState, useEffect } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { Spinner } from "@chakra-ui/react";

const BASE_URL = "http://10.163.0.66:8002";

const ACTION = {
  LOGIN:        { color: "#34D399", bg: "#064E3B22", border: "#34D39933", label: "Login",       icon: "🔑" },
  LOGOUT:       { color: "#F87171", bg: "#450A0A22", border: "#F8717133", label: "Logout",      icon: "🚪" },
  VIEW_UTILITY: { color: "#60A5FA", bg: "#1E3A5F22", border: "#60A5FA33", label: "Lihat Data",  icon: "👁️" },
  EXPORT_PDF:   { color: "#FBBF24", bg: "#451A0322", border: "#FBBF2433", label: "Export PDF",  icon: "📄" },
};

const ROWS_PER_PAGE = 20;

/* ── helpers ── */
const formatIP  = (ip) => (!ip ? "—" : ip.replace("::ffff:", ""));
const formatTime = (t)  => (!t  ? "—" : String(t).replace("T", " ").slice(0, 19));

/* ── sub-components ── */
function ActionBadge({ action }) {
  const cfg = ACTION[action] || { color: "#94A3B8", bg: "#1E293B22", border: "#94A3B833", label: action, icon: "•" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 9999,
      fontSize: 11, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      letterSpacing: "0.03em", whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: cfg.color, flexShrink: 0,
        boxShadow: `0 0 5px ${cfg.color}`,
      }}/>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function SummaryCard({ action, count }) {
  const cfg = ACTION[action] || { color: "#94A3B8", label: action, icon: "•" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: "#141720",
      border: "1px solid #1E2235",
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: 10, padding: "12px 18px", minWidth: 140,
    }}>
      <span style={{ fontSize: 20 }}>{cfg.icon}</span>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: cfg.color, lineHeight: 1 }}>{count}</div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 3, fontWeight: 500 }}>{cfg.label}</div>
      </div>
    </div>
  );
}

function parseDetail(detailStr) {
  try {
    const d = JSON.parse(detailStr || "{}");
    if (!d.area && !d.start && !d.finish) return <span style={{ color: "#334155" }}>—</span>;
    const cleanArea = d.area
      ? d.area.replace("cMT-PMWorkshop_", "").replace("_data", "")
      : "";
    return (
      <div style={{ fontSize: 12, lineHeight: "1.7" }}>
        {cleanArea && (
          <div>
            <span style={{ color: "#475569", fontWeight: 600 }}>Ruang: </span>
            <span style={{ color: "#CBD5E1" }}>{cleanArea}</span>
          </div>
        )}
        {d.start && (
          <div>
            <span style={{ color: "#475569", fontWeight: 600 }}>Dari: </span>
            <span style={{ color: "#94A3B8", fontFamily: "monospace" }}>{d.start.replace("T", " ")}</span>
          </div>
        )}
        {d.finish && (
          <div>
            <span style={{ color: "#475569", fontWeight: 600 }}>Sampai: </span>
            <span style={{ color: "#94A3B8", fontFamily: "monospace" }}>{d.finish.replace("T", " ")}</span>
          </div>
        )}
      </div>
    );
  } catch {
    return <span style={{ color: "#334155" }}>—</span>;
  }
}

const inputStyle = {
  background: "#0D0F17",
  border: "1px solid #1E2235",
  borderRadius: 8,
  padding: "7px 12px",
  color: "#CBD5E1",
  fontSize: 13,
  outline: "none",
  width: "100%",
  colorScheme: "dark",
};

const labelStyle = {
  fontSize: 10, fontWeight: 700, color: "#475569",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em",
  display: "block",
};

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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 256 }}>
        <p style={{ color: "#F87171", fontSize: 16, fontWeight: 600 }}>
          ⛔ Akses ditolak. Hanya administrator yang dapat melihat halaman ini.
        </p>
      </div>
    );
  }

  const summary      = ["LOGIN", "LOGOUT", "VIEW_UTILITY", "EXPORT_PDF"].map((act) => ({
    act, count: logs.filter((l) => l.action === act).length,
  }));
  const totalPages    = Math.max(1, Math.ceil(logs.length / ROWS_PER_PAGE));
  const paginatedLogs = logs.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  /* ── render ── */
  return (
    <div style={{ padding: "28px 32px", maxWidth: 1300, margin: "0 auto", color: "#E2E8F0" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, boxShadow: "0 0 16px #4F46E544",
        }}>📋</div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#475569", margin: 0 }}>Audit Trail</h1>
          <p style={{ fontSize: 12, color: "#475569", margin: "4px 0 0" }}>
            Rekam aktivitas seluruh pengguna sistem — login, logout, akses data, export PDF.
          </p>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{
        background: "#141720",
        border: "1px solid #1E2235",
        borderRadius: 12, padding: "16px 20px", marginBottom: 20,
        display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
      }}>
        <div style={{ flex: "0 0 auto" }}>
          <label style={labelStyle}>Dari</label>
          <input type="date" value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            style={{ ...inputStyle, width: 155 }} />
        </div>

        <div style={{ flex: "0 0 auto" }}>
          <label style={labelStyle}>Sampai</label>
          <input type="date" value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            style={{ ...inputStyle, width: 155 }} />
        </div>

        <div style={{ flex: "0 0 auto" }}>
          <label style={labelStyle}>User</label>
          <select value={filters.userId}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
            style={{ ...inputStyle, width: 220 }}>
            <option value="all">Semua User</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
            ))}
          </select>
        </div>

        <div style={{ flex: "0 0 auto" }}>
          <label style={labelStyle}>Aksi</label>
          <select value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            style={{ ...inputStyle, width: 190 }}>
            <option value="all">Semua Aksi</option>
            <option value="LOGIN">🔑 Login</option>
            <option value="LOGOUT">🚪 Logout</option>
            <option value="VIEW_UTILITY">👁️ Lihat Data Utility</option>
            <option value="EXPORT_PDF">📄 Export PDF</option>
          </select>
        </div>

        <button onClick={fetchLogs} style={{
          background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
          color: "#fff", border: "none", borderRadius: 8,
          padding: "8px 26px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", letterSpacing: "0.02em",
          boxShadow: "0 0 18px #4F46E533",
          transition: "opacity 0.15s",
        }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseOut={(e)  => (e.currentTarget.style.opacity = "1")}>
          Tampilkan
        </button>
      </div>

      {/* ── Summary ── */}
      {fetched && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          {summary.map(({ act, count }) => <SummaryCard key={act} action={act} count={count} />)}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#1A1D2B", border: "1px solid #252A40",
            borderRadius: 10, padding: "12px 20px",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#E2E8F0", lineHeight: 1 }}>{logs.length}</div>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 500 }}>Total</div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 72 }}>
          <Spinner size="xl" color="purple.400" thickness="3px" />
        </div>
      )}

      {/* ── Table ── */}
      {!loading && (
        <>
          <div style={{
            background: "#141720", border: "1px solid #1E2235",
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0D0F17", borderBottom: "1px solid #1E2235" }}>
                    {[
                      { label: "No",       w: 50  },
                      { label: "Waktu Server", w: 155 },
                      { label: "User",     w: 160 },
                      { label: "Aksi",     w: 150 },
                      { label: "Detail Ruang / Tanggal Data", w: "auto" },
                      { label: "IP Address", w: 140 },
                    ].map(({ label, w }) => (
                      <th key={label} style={{
                        padding: "11px 16px", textAlign: "left",
                        fontSize: 10, fontWeight: 700, color: "#475569",
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        whiteSpace: "nowrap", width: w,
                      }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{
                        textAlign: "center", padding: "72px 0",
                        color: "#2D3149", fontSize: 13,
                      }}>
                        {!fetched
                          ? "⬆️  Pilih filter lalu klik Tampilkan"
                          : "Tidak ada data yang cocok dengan filter ini"}
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log, i) => {
                      const isEven = i % 2 === 0;
                      return (
                        <tr key={log.id}
                          style={{
                            borderBottom: "1px solid #1A1D2B",
                            background: isEven ? "#141720" : "#121520",
                            transition: "background 0.12s",
                            cursor: "default",
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.background = "#1C2030")}
                          onMouseOut={(e)  => (e.currentTarget.style.background = isEven ? "#141720" : "#121520")}
                        >
                          <td style={{ padding: "10px 16px", fontSize: 11, color: "#2D3149" }}>
                            {(currentPage - 1) * ROWS_PER_PAGE + i + 1}
                          </td>
                          <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#64748B", whiteSpace: "nowrap" }}>
                            {formatTime(log.server_time)}
                          </td>
                          <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#CBD5E1" }}>
                            {log.user_name}
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <ActionBadge action={log.action} />
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            {parseDetail(log.detail)}
                          </td>
                          <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#334155" }}>
                            {formatIP(log.ip_address)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div style={{
              display: "flex", justifyContent: "center", alignItems: "center",
              gap: 12, marginTop: 20,
            }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                style={{
                  background: "#141720", color: currentPage === 1 ? "#2D3149" : "#94A3B8",
                  border: "1px solid #1E2235", borderRadius: 8,
                  padding: "6px 18px", fontSize: 13, cursor: currentPage === 1 ? "not-allowed" : "pointer",
                }}>
                ← Prev
              </button>

              <span style={{ fontSize: 13, color: "#475569" }}>
                Hal. <strong style={{ color: "#CBD5E1" }}>{currentPage}</strong>
                {" / "}
                <strong style={{ color: "#475569" }}>{totalPages}</strong>
                <span style={{ color: "#2D3149", marginLeft: 10 }}>({logs.length} data)</span>
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{
                  background: "#141720", color: currentPage === totalPages ? "#2D3149" : "#94A3B8",
                  border: "1px solid #1E2235", borderRadius: 8,
                  padding: "6px 18px", fontSize: 13, cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}