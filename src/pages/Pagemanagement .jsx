import { useState, useEffect } from "react";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  TableCaption, TableContainer,
  Button, Switch, Badge, Spinner, Stack,
  useColorMode, useColorModeValue, useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { logAuditAction } from "../features/part/userSlice";

const API = "http://10.163.0.66:8002";

// ──────────────────────────────────────────────────────────────
// Kontrak API yang dibutuhkan dari backend (belum ada → perlu dibuat):
//
//   GET  /part/page-access
//     -> { "1": ["Maintenance"], "2": ["Maintenance","Utility"], ... }
//        key = level (1-5), value = array nama page yang diizinkan
//
//   PUT  /part/page-access     (body = object persis seperti di atas)
//     -> overwrite seluruh matrix dengan yang baru
//
// Sebelum endpoint ini ada di backend, tab ini akan menampilkan toast
// error pas pertama dibuka (gagal fetch) — itu wajar, switch akan
// default semua OFF sampai backend-nya siap.
// ──────────────────────────────────────────────────────────────

const LEVELS = [1, 2, 3, 4, 5];


// Samain warna aksen sama kartu module di Homepage (border-orange-400 dst)
const PAGES = [
  { key: "Maintenance", label: "Maintenance" },
  { key: "Utility",     label: "Utility" },
  { key: "Production",  label: "Production" },
  { key: "Building",    label: "Building" },
    { key: "Scadamonitor",    label: "Scadamonitor" }
];

export default function PageManagement() {
  const toast = useToast();

  const [matrix, setMatrix]   = useState({});   // { 1: ["Maintenance", ...], ... }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);

  // ── theming (pattern sama kaya User Management) ─────────────
  const { colorMode } = useColorMode();
  const tulisanColor  = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  // ─────────────────────────────────────────────────────────────

  // ── fetch matrix akses ───────────────────────────────────────
  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("user_token");
      const res   = await axios.get(`${API}/part/page-access`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const normalized = {};
      LEVELS.forEach((lvl) => {
        normalized[lvl] = res.data?.[lvl] ?? [];
      });
      setMatrix(normalized);
      setDirty(false);
    } catch (err) {
      toast({
        title: "Gagal memuat akses halaman",
        description: err?.response?.data?.message || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, []);
  // ─────────────────────────────────────────────────────────────

  const hasAccess = (level, pageKey) => (matrix[level] || []).includes(pageKey);

  const toggleAccess = (level, pageKey) => {
    setMatrix((prev) => {
      const current = prev[level] || [];
      const updated = current.includes(pageKey)
        ? current.filter((p) => p !== pageKey)
        : [...current, pageKey];
      return { ...prev, [level]: updated };
    });
    setDirty(true);
  };

  const toggleAllForLevel = (level, checked) => {
    setMatrix((prev) => ({
      ...prev,
      [level]: checked ? PAGES.map((p) => p.key) : [],
    }));
    setDirty(true);
  };
  // ─────────────────────────────────────────────────────────────

  // ── simpan matrix ────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("user_token");
      await axios.put(`${API}/part/page-access`, matrix, {
        headers: { Authorization: `Bearer ${token}` },
      });

      await logAuditAction("ADMIN_UPDATE_PAGE_ACCESS", { new_matrix: matrix });

      toast({
        title: "Akses halaman berhasil disimpan",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      setDirty(false);
    } catch (err) {
      toast({
        title: "Gagal menyimpan akses halaman",
        description: err?.response?.data?.message || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };
  // ─────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-center mx-6 mt-2 mb-4">
        <h2 className="text-lg font-bold text-text">Page Management</h2>
        <Stack direction="row" spacing={2}>
          <Button
            size="sm"
            colorScheme="blue"
            onClick={handleSave}
            isLoading={saving}
            loadingText="Menyimpan..."
            isDisabled={!dirty}
          >
            Save Changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchMatrix}
            isDisabled={loading || saving}
          >
            Reset
          </Button>
        </Stack>
      </div>

      {/* ── Matrix Table ──────────────────────────────────────── */}
      <div className="mt-4 mx-6 bg-card rounded-md shadow-lg">
        {loading ? (
          <div className="flex flex-col items-center py-12">
            <Spinner
              thickness="4px"
              speed="0.65s"
              emptyColor="gray.200"
              color="blue.500"
              size="xl"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <TableContainer>
              <Table key={colorMode} variant="simple">
                <TableCaption sx={{ color: tulisanColor }}>
                  Akses Halaman per Level — PT. Lapi Laboratories
                </TableCaption>
                <Thead>
                  <Tr>
                    <Th sx={{ color: tulisanColor }}>Level</Th>
                    {PAGES.map((p) => (
                      <Th
                        key={p.key}
                        textAlign="center"
                        sx={{
                          color: tulisanColor,
                          borderBottom: "3px solid",
                          borderBottomColor: `${p.accent}.400`,
                        }}
                      >
                        {p.emoji} {p.label}
                      </Th>
                    ))}
                    <Th textAlign="center" sx={{ color: tulisanColor }}>
                      All Access
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {LEVELS.map((lvl) => (
                    <Tr key={lvl}>
                      <Td>
                        <Badge colorScheme="blue">Level {lvl}</Badge>
                      </Td>
                      {PAGES.map((p) => (
                        <Td key={p.key} textAlign="center">
                          <Switch
                            colorScheme="green"
                            isChecked={hasAccess(lvl, p.key)}
                            onChange={() => toggleAccess(lvl, p.key)}
                          />
                        </Td>
                      ))}
                      <Td textAlign="center">
                        <Switch
                          size="sm"
                          colorScheme="purple"
                          isChecked={PAGES.every((p) => hasAccess(lvl, p.key))}
                          onChange={(e) => toggleAllForLevel(lvl, e.target.checked)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mx-6 mt-3">
        * Klik <strong>Save Changes</strong> untuk menyimpan ke server. User yang sedang
        login perlu refresh / login ulang supaya menu mengikuti akses terbaru.
      </p>
    </div>
  );
}