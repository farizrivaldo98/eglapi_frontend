// ════════════════════════════════════════════════════════════════════════
// ENERGY NITROGEN (N2) - HISTORICAL
// Sumber data per DETIK (L/min), jadi semua angka di sini hasil agregasi
// di backend (getEnergyNitrogenFlow & getEnergyNitrogenTotalizer):
//
//  1) Flow rata-rata  : AVG per MENIT / JAM / HARI (+ band Max/Min), pilih range.
//  2) Totalizer       : volume (Liter) per JAM / HARI dihitung dari data per-detik,
//                       pilih range. Ada tabel dengan kolom kumulatif.
//  3) Analisa         : Avg / Max / Min per seksi.
//
// Aturan input range (ikut periode yang dipilih):
//   - Per Hari  -> pilih tanggal saja (jam gak ditampilkan)
//   - Per Jam   -> pilih tanggal + jam (menit gak ditampilkan)
//   - Per Menit -> pilih tanggal + jam + menit lengkap
// Start dibulatkan ke awal satuan, Finish ke akhir satuan (mis. Per Hari:
// 00:00:00 s/d 23:59:59), jadi bucket pinggir selalu penuh.
//
// Sumber lain (Sterile, Liquid, LT3, Lapi1) sudah ada di dropdown tapi
// di-disable - lihat SOURCES di EnergyNitrogenConstants.js.
// ════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import {
  Select,
  Input,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableCaption,
  TableContainer,
  Stack,
  Spinner,
} from "@chakra-ui/react";
import CanvasJSReact from "../canvasjs.react";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useColorMode, useColorModeValue } from "@chakra-ui/react";
import { logAuditAction } from "../features/part/userSlice";
import logo from "../assets/logolapi.png";
import {
  SOURCES,
  FLOW_PERIODS,
  TOTALIZER_PERIODS,
  MAX_RANGE_DAYS,
  VOLUME_UNITS,
  FLOW_UNIT,
  FLOW_COLOR,
  TOTALIZER_COLOR,
} from "./EnergyNitrogenConstants";

var CanvasJS = CanvasJSReact.CanvasJS;
var CanvasJSChart = CanvasJSReact.CanvasJSChart;

const API_BASE = "http://10.163.0.66:8002/part";

// ─────────────────────────────────────────────────────────────────────────
// Helper tanggal / label / range
// ─────────────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");

// Tanggal lokal (BUKAN toISOString - itu UTC dan bisa mundur sehari di WIB)
const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));

// Nilai picker disimpan kanonik: "YYYY-MM-DDTHH:mm" (format datetime-local).
// Dari situ dibangun start/finish buat API sesuai periode.
const buildRange = (startVal, finishVal, period) => {
  const s = startVal;
  const f = finishVal;
  if (period === "daily") {
    return { start: `${s.slice(0, 10)} 00:00:00`, finish: `${f.slice(0, 10)} 23:59:59` };
  }
  if (period === "hourly") {
    return {
      start: `${s.slice(0, 10)} ${s.slice(11, 13)}:00:00`,
      finish: `${f.slice(0, 10)} ${f.slice(11, 13)}:59:59`,
    };
  }
  return { start: `${s.replace("T", " ")}:00`, finish: `${f.replace("T", " ")}:59` };
};

// Label periode yang ditampilkan di chart/tabel/PDF.
//   daily  : 2026-10-28
//   hourly : 2026-10-28 14        (jam saja, tanpa menit)
//   minute : 2026-10-28 14:37     (menit lengkap)
// Backend sudah ngirim label dengan format persis itu, jadi ini tinggal
// dipakai apa adanya. Kalau mau tampilan "14:00" buat per jam, ubah di sini.
const formatPeriodLabel = (label) => label;

const fmtNum = (v, decimals = 2) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? "-"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      });

// ─────────────────────────────────────────────────────────────────────────
// RangePicker: input Start/Finish yang bentuknya ikut periode
// ─────────────────────────────────────────────────────────────────────────
function RangePicker({ label, value, onChange, period, isDarkMode, fieldSx, defaultHour }) {
  const date = value ? value.slice(0, 10) : "";
  const hour = value ? value.slice(11, 13) : defaultHour;
  const minute = value ? value.slice(14, 16) : "00";

  const calendarCss = {
    "&::-webkit-calendar-picker-indicator": {
      color: isDarkMode ? "white" : "black",
      filter: isDarkMode ? "invert(1)" : "none",
    },
  };

  return (
    <div>
      <h5 className="mb-1">{label}</h5>
      {period === "minute" ? (
        <Input
          type="datetime-local"
          size="md"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          css={calendarCss}
          sx={fieldSx}
        />
      ) : (
        <div className="flex flex-row gap-2">
          <Input
            type="date"
            size="md"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return onChange("");
              onChange(`${e.target.value}T${hour}:${minute}`);
            }}
            css={calendarCss}
            sx={fieldSx}
          />
          {period === "hourly" && (
            <Select
              size="md"
              width="90px"
              value={hour}
              onChange={(e) => onChange(`${date || localDateStr()}T${e.target.value}:00`)}
              sx={fieldSx}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ChartBox: loading / error / chart
// ─────────────────────────────────────────────────────────────────────────
function ChartBox({ loading, error, hasData, options }) {
  return (
    <div className="w-full bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
      {loading ? (
        <div className="flex flex-col items-center py-10">
          <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="lg" />
        </div>
      ) : !hasData ? (
        <div className={`${error ? "text-red-500" : "text-text"} flex flex-col items-center py-10`}>
          {error || "Pilih rentang lalu klik Tampilkan"}
        </div>
      ) : (
        <CanvasJSChart options={options} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PaginatedTable: tabel + rows-per-page + Hide/Show + Prev/Next
// headers: [string], rows: [{ key, cells: [any] }]
// ─────────────────────────────────────────────────────────────────────────
function PaginatedTable({ caption, headers, rows, resetKey, tulisanColor, colorMode }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isVisible, setIsVisible] = useState(true);

  // data baru (Submit / ganti sumber / ganti satuan) -> balik ke halaman 1.
  // Pakai resetKey (referensi array data asli), BUKAN `rows`, karena `rows`
  // dibuat ulang tiap render parent dan bakal reset halaman terus.
  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  const totalPages = Math.max(Math.ceil(rows.length / rowsPerPage), 1);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const visibleRows = rows.slice(startIndex, startIndex + rowsPerPage);

  return (
    <>
      <Stack className="flex flex-row justify-center gap-2" direction="row" spacing={2} align="center">
        <div className="mt-2">
          <Select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            width="80px"
          >
            {[5, 10, 20, 40, 60, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Button className="w-40 mt-2" colorScheme="red" onClick={() => setIsVisible(!isVisible)}>
            {isVisible ? "Hide All Data" : "Show All Data"}
          </Button>
        </div>
      </Stack>

      {isVisible && (
        <div className="mt-8 mx-4 md:mx-20 bg-card rounded-md">
          <TableContainer>
            <Table key={colorMode} variant="simple">
              <TableCaption sx={{ color: tulisanColor }}>{caption}</TableCaption>
              <Thead>
                <Tr>
                  {headers.map((h) => (
                    <Th key={h} sx={{ color: tulisanColor }}>
                      {h}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {rows.length === 0 ? (
                  <Tr>
                    <Td colSpan={headers.length} textAlign="center" display="table-cell">
                      No data available
                    </Td>
                  </Tr>
                ) : (
                  visibleRows.map((row) => (
                    <Tr key={row.key}>
                      {row.cells.map((c, i) => (
                        <Td key={i}>{c}</Td>
                      ))}
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      <div className="flex justify-center items-center my-4 gap-4">
        <Button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          isDisabled={currentPage === 1}
          colorScheme="blue"
        >
          Previous
        </Button>
        <span className="text-text">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          isDisabled={currentPage === totalPages}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PDF (dipakai flow & totalizer): header perusahaan + tabel analisa + tabel data
// ─────────────────────────────────────────────────────────────────────────
function savePdfReport({
  username,
  heading,
  summaryHead,
  summaryBody,
  columns,
  bodyRows,
  footerTitle,
  filePrefix,
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalPagesExp = "{p}";

  const now = new Date();
  const day = pad2(now.getDate());
  const month = pad2(now.getMonth() + 1);
  const year = now.getFullYear();
  const hours = pad2(now.getHours());
  const minutes = pad2(now.getMinutes());
  const formattedDateTime = `${day}/${month}/${year} ${hours}:${minutes}`;
  const fileSuffix = `${year}${month}${day}_${hours}${minutes}`;

  const drawHeader = () => {
    doc.addImage(logo, "JPEG", 10, 8, 25, 12);

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("PT LAPI LABORATORIES", pageWidth / 2, 13, { align: "center" });

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Jl. Kawasan Industri Modern Kav. 18, Industrial Estate, Cikande, Nambo Ilir, Serang, Kabupaten Serang, Banten 42186",
      pageWidth / 2,
      19.5,
      { align: "center" }
    );
    doc.text(
      "Phone: (0254) 402150, Fax (0254)402151, Homepage: www.lapilaboratories.com",
      pageWidth / 2,
      22,
      { align: "center" }
    );

    doc.line(10, 27, pageWidth - 10, 27);
  };

  drawHeader();

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(heading, 14, 32);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    head: [summaryHead],
    body: summaryBody,
    startY: 34,
    margin: { left: 10, right: 10 },
    styles: { fontSize: 8, cellPadding: 2, halign: "center" },
    headStyles: {
      fillColor: [52, 144, 220],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    columnStyles: {
      0: {
        fontStyle: "bold",
        halign: "center",
        fillColor: [235, 245, 255],
        textColor: [0, 0, 100],
        cellWidth: 45,
      },
    },
    theme: "grid",
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.1,
  });

  const summaryFinalY = doc.lastAutoTable.finalY;

  autoTable(doc, {
    columns,
    body: bodyRows,
    startY: summaryFinalY + 5,
    margin: { top: 35, bottom: 20 },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.height;
      const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
      if (currentDocPage > 1) drawHeader();

      doc.setFontSize(9);
      doc.text(`${footerTitle} - ${formattedDateTime} - ${username}`, 14, pageHeight - 10);
      doc.text(
        `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${totalPagesExp}`,
        pageWidth - 14,
        pageHeight - 10,
        { align: "right" }
      );
    },
  });

  if (typeof doc.putTotalPages === "function") {
    doc.putTotalPages(totalPagesExp);
  }

  doc.save(`${filePrefix}-${fileSuffix}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────
// KOMPONEN UTAMA
// ─────────────────────────────────────────────────────────────────────────
function EnergyNitrogen() {
  const today = localDateStr();

  const [selectedSourceKey, setSelectedSourceKey] = useState(
    (SOURCES.find((s) => s.available) || SOURCES[0]).key
  );
  const selectedSource = SOURCES.find((s) => s.key === selectedSourceKey) || SOURCES[0];

  // ── Seksi 1: Flow rata-rata ──
  const [flowPeriod, setFlowPeriod] = useState("hourly");
  const [flowStart, setFlowStart] = useState(`${today}T00:00`);
  const [flowFinish, setFlowFinish] = useState(`${today}T23:59`);
  const [flowData, setFlowData] = useState([]); // [{ id, label, avg, max, min, samples }]
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowError, setFlowError] = useState(null);
  const flowFetchedRef = useRef(false);
  // periode yang dipakai data yang SEDANG tampil (bukan dropdown saat ini),
  // supaya judul chart/tabel gak berubah sebelum Submit ditekan
  const [flowShownPeriod, setFlowShownPeriod] = useState("hourly");
  const [flowShownRange, setFlowShownRange] = useState(null);

  // ── Seksi 2: Totalizer ──
  const [totPeriod, setTotPeriod] = useState("hourly");
  const [totStart, setTotStart] = useState(`${today}T00:00`);
  const [totFinish, setTotFinish] = useState(`${today}T23:59`);
  const [totData, setTotData] = useState([]); // [{ id, label, value (Liter), samples }]
  const [totLoading, setTotLoading] = useState(false);
  const [totError, setTotError] = useState(null);
  const totFetchedRef = useRef(false);
  const [totShownPeriod, setTotShownPeriod] = useState("hourly");
  const [totShownRange, setTotShownRange] = useState(null);
  const [volumeUnitKey, setVolumeUnitKey] = useState("L");
  const volumeUnit = VOLUME_UNITS.find((u) => u.key === volumeUnitKey) || VOLUME_UNITS[0];

  // ── Tema (sama kayak ParameterListrik) ──
  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue("rgba(var(--color-border))", "rgba(var(--color-border))");
  const tulisanColor = useColorModeValue("rgba(var(--color-text))", "rgba(var(--color-text))");
  const hoverBorderColor = useColorModeValue("rgba(var(--color-border2))", "rgba(var(--color-border2))");

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );
  const userGlobal = useSelector((state) => state.user.user);

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      setIsDarkMode(currentTheme === "dark");
    };
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const fieldSx = {
    border: "1px solid",
    borderColor: borderColor,
    borderRadius: "0.395rem",
    background: "var(--color-background)",
    _hover: { borderColor: hoverBorderColor },
  };

  const flowPeriodLabel = FLOW_PERIODS.find((p) => p.value === flowShownPeriod)?.label || "";
  const totPeriodLabel = TOTALIZER_PERIODS.find((p) => p.value === totShownPeriod)?.label || "";

  // ──────────────────────────────────────────────────────────────────────
  // FETCH
  // ──────────────────────────────────────────────────────────────────────
  const getFlow = async () => {
    if (!flowStart || !flowFinish) {
      setFlowError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    const { start, finish } = buildRange(flowStart, flowFinish, flowPeriod);
    if (finish < start) {
      setFlowError("Finish harus setelah Start");
      return;
    }

    flowFetchedRef.current = true;
    setFlowLoading(true);
    setFlowError(null);

    try {
      const response = await axios.get(`${API_BASE}/getEnergyNitrogenFlow`, {
        params: { start, finish, period: flowPeriod, source: selectedSourceKey },
      });

      const rows = response.data.data || [];
      setFlowData(rows);
      setFlowShownPeriod(flowPeriod);
      setFlowShownRange({ start, finish });
      if (rows.length === 0) setFlowError("Tidak ada data pada rentang ini");

      try {
        await logAuditAction("VIEW_ENERGY_NITROGEN_FLOW", {
          start,
          finish,
          period: flowPeriod,
          area: selectedSourceKey,
        });
      } catch (auditErr) {
        console.error("Audit log failed:", auditErr);
      }
    } catch (err) {
      console.error("Error fetching nitrogen flow:", err);
      setFlowData([]);
      setFlowError(err?.response?.data?.message || "Failed to fetch data. Please try again.");
    } finally {
      setFlowLoading(false);
    }
  };

  const getTotalizer = async () => {
    if (!totStart || !totFinish) {
      setTotError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    const { start, finish } = buildRange(totStart, totFinish, totPeriod);
    if (finish < start) {
      setTotError("Finish harus setelah Start");
      return;
    }

    totFetchedRef.current = true;
    setTotLoading(true);
    setTotError(null);

    try {
      const response = await axios.get(`${API_BASE}/getEnergyNitrogenTotalizer`, {
        params: { start, finish, period: totPeriod, source: selectedSourceKey },
      });

      const rows = response.data.data || [];
      setTotData(rows);
      setTotShownPeriod(totPeriod);
      setTotShownRange({ start, finish });
      if (rows.length === 0) setTotError("Tidak ada data pada rentang ini");

      try {
        await logAuditAction("VIEW_ENERGY_NITROGEN_TOTALIZER", {
          start,
          finish,
          period: totPeriod,
          area: selectedSourceKey,
        });
      } catch (auditErr) {
        console.error("Audit log failed:", auditErr);
      }
    } catch (err) {
      console.error("Error fetching nitrogen totalizer:", err);
      setTotData([]);
      setTotError(err?.response?.data?.message || "Failed to fetch data. Please try again.");
    } finally {
      setTotLoading(false);
    }
  };

  // Ganti sumber -> tarik ulang seksi yang sudah pernah di-Submit,
  // pakai rentang yang sama.
  useEffect(() => {
    if (flowFetchedRef.current) getFlow();
    if (totFetchedRef.current) getTotalizer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceKey]);

  // ──────────────────────────────────────────────────────────────────────
  // ANALISA
  // ──────────────────────────────────────────────────────────────────────
  // Flow: avg dibobot jumlah sample tiap bucket (jadi sama dengan rata-rata
  // dari seluruh data per-detik di rentang itu), max/min = ekstrem antar bucket.
  const flowStats = useMemo(() => {
    const valid = flowData.filter((r) => r.avg !== null && r.avg !== undefined);
    if (valid.length === 0) return { avg: 0, max: 0, min: 0, samples: 0 };

    const totalSamples = valid.reduce((a, r) => a + (r.samples || 0), 0);
    const avg =
      totalSamples > 0
        ? valid.reduce((a, r) => a + r.avg * (r.samples || 0), 0) / totalSamples
        : valid.reduce((a, r) => a + r.avg, 0) / valid.length;

    return {
      avg: Number(avg.toFixed(2)),
      max: Number(Math.max(...valid.map((r) => r.max)).toFixed(2)),
      min: Number(Math.min(...valid.map((r) => r.min)).toFixed(2)),
      samples: totalSamples,
    };
  }, [flowData]);

  const convertVol = (liters) => Number((Number(liters) * volumeUnit.factor).toFixed(volumeUnit.decimals));

  // Totalizer: total volume rentang, rata-rata per periode, periode terbesar
  // & terkecil (lengkap dengan labelnya).
  const totStats = useMemo(() => {
    if (totData.length === 0) {
      return { total: 0, avg: 0, max: 0, min: 0, maxLabel: "-", minLabel: "-" };
    }
    const total = totData.reduce((a, r) => a + (Number(r.value) || 0), 0);
    let maxRow = totData[0];
    let minRow = totData[0];
    totData.forEach((r) => {
      if (r.value > maxRow.value) maxRow = r;
      if (r.value < minRow.value) minRow = r;
    });
    return {
      total,
      avg: total / totData.length,
      max: maxRow.value,
      min: minRow.value,
      maxLabel: maxRow.label,
      minLabel: minRow.label,
    };
  }, [totData]);

  // Baris tabel totalizer dengan kolom kumulatif (running total)
  const totRows = useMemo(() => {
    let running = 0;
    return totData.map((r) => {
      running += Number(r.value) || 0;
      return {
        id: r.id,
        label: r.label,
        volume: convertVol(r.value),
        cumulative: convertVol(running),
        samples: r.samples,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totData, volumeUnitKey]);

  // ──────────────────────────────────────────────────────────────────────
  // CHART OPTIONS
  // ──────────────────────────────────────────────────────────────────────
  const baseAxis = {
    lineColor: isDarkMode ? "#d6d6d6" : "#474747",
    labelFontColor: isDarkMode ? "white" : "black",
    tickColor: isDarkMode ? "#d6d6d6" : "#474747",
  };

  const flowChartOptions = useMemo(() => {
    const color = isDarkMode ? FLOW_COLOR.dark : FLOW_COLOR.light;
    const bandColor = isDarkMode ? "#8a8a8a" : "#9a9a9a";
    const mk = (key) =>
      flowData.map((r, idx) => ({
        x: idx,
        y: r[key] ?? null,
        label: formatPeriodLabel(r.label),
      }));

    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      title: {
        text: `Flow Rata-rata ${selectedSource.label} (${FLOW_UNIT})`,
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `${flowPeriodLabel}${flowShownRange ? ` | ${flowShownRange.start} s/d ${flowShownRange.finish}` : ""}`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 11,
        },
      ],
      axisY: {
        title: FLOW_UNIT,
        titleFontColor: isDarkMode ? "white" : "black",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor: baseAxis.lineColor,
        tickColor: baseAxis.tickColor,
      },
      axisX: { ...baseAxis, labelAngle: -30 },
      legend: { fontColor: isDarkMode ? "white" : "black", fontSize: 11 },
      toolTip: { shared: true },
      data: [
        {
          type: "line",
          name: "Max",
          showInLegend: true,
          color: bandColor,
          lineColor: bandColor,
          lineDashType: "dot",
          markerSize: 0,
          dataPoints: mk("max"),
        },
        {
          type: "line",
          name: "Avg",
          showInLegend: true,
          color,
          lineColor: color,
          markerColor: color,
          markerSize: flowData.length > 200 ? 0 : 5,
          dataPoints: mk("avg"),
        },
        {
          type: "line",
          name: "Min",
          showInLegend: true,
          color: bandColor,
          lineColor: bandColor,
          lineDashType: "dot",
          markerSize: 0,
          dataPoints: mk("min"),
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowData, isDarkMode, flowShownPeriod, flowShownRange, selectedSource]);

  const totChartOptions = useMemo(() => {
    const color = isDarkMode ? TOTALIZER_COLOR.dark : TOTALIZER_COLOR.light;
    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      title: {
        text: `Totalizer ${selectedSource.label} (${volumeUnit.short})`,
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `${totPeriodLabel}${totShownRange ? ` | ${totShownRange.start} s/d ${totShownRange.finish}` : ""}`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 11,
        },
      ],
      axisY: {
        title: volumeUnit.short,
        titleFontColor: isDarkMode ? "white" : "black",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor: baseAxis.lineColor,
        tickColor: baseAxis.tickColor,
      },
      axisX: { ...baseAxis, labelAngle: -30 },
      legend: { fontColor: isDarkMode ? "white" : "black", fontSize: 11 },
      toolTip: { shared: true },
      data: [
        {
          type: "column",
          name: `Volume (${volumeUnit.short})`,
          showInLegend: true,
          color,
          yValueFormatString: "#,##0.###",
          dataPoints: totRows.map((r, idx) => ({
            x: idx,
            y: r.volume,
            label: formatPeriodLabel(r.label),
          })),
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totRows, isDarkMode, totShownPeriod, totShownRange, selectedSource, volumeUnitKey]);

  // ──────────────────────────────────────────────────────────────────────
  // EXPORT PDF
  // ──────────────────────────────────────────────────────────────────────
  const exportFlowPDF = async () => {
    savePdfReport({
      username: userGlobal.username,
      heading: `Summary Flow N2 - ${flowPeriodLabel} (${selectedSource.label})`,
      summaryHead: ["Parameter", "Avg", "Max", "Min"],
      summaryBody: [
        [
          `Flow (${FLOW_UNIT})`,
          String(flowStats.avg),
          String(flowStats.max),
          String(flowStats.min),
        ],
      ],
      columns: [
        { header: "No", dataKey: "id" },
        { header: "Periode", dataKey: "label" },
        { header: `Avg (${FLOW_UNIT})`, dataKey: "avg" },
        { header: `Max (${FLOW_UNIT})`, dataKey: "max" },
        { header: `Min (${FLOW_UNIT})`, dataKey: "min" },
        { header: "Sampel", dataKey: "samples" },
      ],
      bodyRows: flowData.map((r) => ({
        id: r.id,
        label: formatPeriodLabel(r.label),
        avg: r.avg ?? "-",
        max: r.max ?? "-",
        min: r.min ?? "-",
        samples: r.samples,
      })),
      footerTitle: `Generated by EMS System - Nitrogen Flow (${flowPeriodLabel} - ${selectedSource.label})`,
      filePrefix: `table-data-EnergyNitrogenFlow-${selectedSource.label.replace(/\s+/g, "")}`,
    });

    await logAuditAction("EXPORT_PDF", {
      start: flowShownRange?.start,
      finish: flowShownRange?.finish,
      period: flowShownPeriod,
      area: selectedSourceKey,
    });
  };

  const exportTotalizerPDF = async () => {
    const u = volumeUnit.short;
    savePdfReport({
      username: userGlobal.username,
      heading: `Summary Totalizer N2 - ${totPeriodLabel} (${selectedSource.label})`,
      summaryHead: ["Parameter", `Total (${u})`, `Avg/periode (${u})`, `Max (${u})`, `Min (${u})`],
      summaryBody: [
        [
          "Volume N2",
          String(convertVol(totStats.total)),
          String(convertVol(totStats.avg)),
          String(convertVol(totStats.max)),
          String(convertVol(totStats.min)),
        ],
      ],
      columns: [
        { header: "No", dataKey: "id" },
        { header: "Periode", dataKey: "label" },
        { header: `Volume (${u})`, dataKey: "volume" },
        { header: `Kumulatif (${u})`, dataKey: "cumulative" },
        { header: "Sampel", dataKey: "samples" },
      ],
      bodyRows: totRows.map((r) => ({
        id: r.id,
        label: formatPeriodLabel(r.label),
        volume: r.volume,
        cumulative: r.cumulative,
        samples: r.samples,
      })),
      footerTitle: `Generated by EMS System - Nitrogen Totalizer (${totPeriodLabel} - ${selectedSource.label})`,
      filePrefix: `table-data-EnergyNitrogenTotalizer-${selectedSource.label.replace(/\s+/g, "")}`,
    });

    await logAuditAction("EXPORT_PDF", {
      start: totShownRange?.start,
      finish: totShownRange?.finish,
      period: totShownPeriod,
      area: selectedSourceKey,
    });
  };

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────
  const sectionTitleClass = "text-text font-semibold text-lg text-center mt-8";

  return (
    <div>
      {/* ── Pilih sumber N2 (berlaku untuk kedua seksi) ── */}
      <div className="flex flex-row justify-center my-6">
        <div>
          <h5 className="mb-1">Sumber N2</h5>
          <Select
            value={selectedSourceKey}
            onChange={(e) => setSelectedSourceKey(e.target.value)}
            size="md"
            width="200px"
            sx={fieldSx}
          >
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key} disabled={!s.available}>
                {s.available ? s.label : `${s.label} (belum tersedia)`}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* ════════════ SEKSI 1: FLOW RATA-RATA ════════════ */}
      <div className={sectionTitleClass}>Flow Rata-rata ({FLOW_UNIT})</div>

      <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap gap-y-3">
        <div>
          <h5 className="mb-1">Periode</h5>
          <Select
            value={flowPeriod}
            onChange={(e) => setFlowPeriod(e.target.value)}
            size="md"
            width="160px"
            sx={fieldSx}
          >
            {FLOW_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <RangePicker
          label="Start"
          value={flowStart}
          onChange={setFlowStart}
          period={flowPeriod}
          isDarkMode={isDarkMode}
          fieldSx={fieldSx}
          defaultHour="00"
        />
        <RangePicker
          label="Finish"
          value={flowFinish}
          onChange={setFlowFinish}
          period={flowPeriod}
          isDarkMode={isDarkMode}
          fieldSx={fieldSx}
          defaultHour="23"
        />
        <div className="w-full flex justify-center xl:w-auto">
          <div className="ml-0 xl:ml-6 mt-7 truncate">
            <Button onClick={getFlow} colorScheme="blue" isLoading={flowLoading}>
              Tampilkan
            </Button>
          </div>
          <div className="ml-2 mt-7">
            <Button
              onClick={exportFlowPDF}
              colorScheme="red"
              isDisabled={userGlobal.level < 3 || flowData.length === 0}
            >
              Export to PDF
            </Button>
          </div>
        </div>
      </div>
      <div className="text-center text-text text-sm -mt-3 mb-2">
        Maksimal rentang {MAX_RANGE_DAYS[flowPeriod]} hari untuk {FLOW_PERIODS.find((p) => p.value === flowPeriod)?.label.toLowerCase()}
      </div>

      <div className="my-4 mx-4">
        <ChartBox
          loading={flowLoading}
          error={flowError}
          hasData={flowData.length > 0}
          options={flowChartOptions}
        />
      </div>

      {/* Analisa flow */}
      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={8} align="start">
        <div className="mt-3">
          <div className="text-text font-semibold">Analisa Flow ({FLOW_UNIT})</div>
          <div className="text-text">Avg = {fmtNum(flowStats.avg)} {FLOW_UNIT}</div>
          <div className="text-text">Max = {fmtNum(flowStats.max)} {FLOW_UNIT}</div>
          <div className="text-text">Min = {fmtNum(flowStats.min)} {FLOW_UNIT}</div>
        </div>
        <div className="mt-3">
          <div className="text-text font-semibold">Jumlah Data</div>
          <div className="text-text">Periode = {flowData.length.toLocaleString()}</div>
          <div className="text-text">Sampel = {flowStats.samples.toLocaleString()} detik</div>
        </div>
      </Stack>

      <PaginatedTable
        caption={`Flow Rata-rata - ${selectedSource.label} (${flowPeriodLabel})`}
        headers={["No", "Periode", `Avg (${FLOW_UNIT})`, `Max (${FLOW_UNIT})`, `Min (${FLOW_UNIT})`, "Sampel"]}
        rows={flowData.map((r) => ({
          key: r.id,
          cells: [r.id, formatPeriodLabel(r.label), fmtNum(r.avg), fmtNum(r.max), fmtNum(r.min), r.samples],
        }))}
        resetKey={flowData}
        tulisanColor={tulisanColor}
        colorMode={colorMode}
      />

      {/* ════════════ SEKSI 2: TOTALIZER ════════════ */}
      <div className={`${sectionTitleClass} mt-14`}>Totalizer N2 ({volumeUnit.short})</div>

      <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap gap-y-3">
        <div>
          <h5 className="mb-1">Periode</h5>
          <Select
            value={totPeriod}
            onChange={(e) => setTotPeriod(e.target.value)}
            size="md"
            width="160px"
            sx={fieldSx}
          >
            {TOTALIZER_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <RangePicker
          label="Start"
          value={totStart}
          onChange={setTotStart}
          period={totPeriod}
          isDarkMode={isDarkMode}
          fieldSx={fieldSx}
          defaultHour="00"
        />
        <RangePicker
          label="Finish"
          value={totFinish}
          onChange={setTotFinish}
          period={totPeriod}
          isDarkMode={isDarkMode}
          fieldSx={fieldSx}
          defaultHour="23"
        />
        <div>
          <h5 className="mb-1">Satuan</h5>
          <Select
            value={volumeUnitKey}
            onChange={(e) => setVolumeUnitKey(e.target.value)}
            size="md"
            width="170px"
            sx={fieldSx}
          >
            {VOLUME_UNITS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full flex justify-center xl:w-auto">
          <div className="ml-0 xl:ml-6 mt-7 truncate">
            <Button onClick={getTotalizer} colorScheme="blue" isLoading={totLoading}>
              Tampilkan
            </Button>
          </div>
          <div className="ml-2 mt-7">
            <Button
              onClick={exportTotalizerPDF}
              colorScheme="red"
              isDisabled={userGlobal.level < 3 || totData.length === 0}
            >
              Export to PDF
            </Button>
          </div>
        </div>
      </div>
      <div className="text-center text-text text-sm -mt-3 mb-2">
        Maksimal rentang {MAX_RANGE_DAYS[totPeriod]} hari untuk {TOTALIZER_PERIODS.find((p) => p.value === totPeriod)?.label.toLowerCase()}
      </div>

      <div className="my-4 mx-4">
        <ChartBox
          loading={totLoading}
          error={totError}
          hasData={totRows.length > 0}
          options={totChartOptions}
        />
      </div>

      {/* Analisa totalizer */}
      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={8} align="start">
        <div className="mt-3">
          <div className="text-text font-semibold">Analisa Totalizer ({volumeUnit.short})</div>
          <div className="text-text">Total = {fmtNum(convertVol(totStats.total), volumeUnit.decimals)} {volumeUnit.short}</div>
          <div className="text-text">Avg per periode = {fmtNum(convertVol(totStats.avg), volumeUnit.decimals)} {volumeUnit.short}</div>
        </div>
        <div className="mt-3">
          <div className="text-text font-semibold">Ekstrem per periode</div>
          <div className="text-text">
            Max = {fmtNum(convertVol(totStats.max), volumeUnit.decimals)} {volumeUnit.short}
            {totData.length > 0 ? ` (${formatPeriodLabel(totStats.maxLabel)})` : ""}
          </div>
          <div className="text-text">
            Min = {fmtNum(convertVol(totStats.min), volumeUnit.decimals)} {volumeUnit.short}
            {totData.length > 0 ? ` (${formatPeriodLabel(totStats.minLabel)})` : ""}
          </div>
        </div>
      </Stack>

      <PaginatedTable
        caption={`Flow Totalizer - ${selectedSource.label} (${totPeriodLabel})`}
        headers={["No", "Periode", `Volume (${volumeUnit.short})`, `Kumulatif (${volumeUnit.short})`, "Sampel"]}
        rows={totRows.map((r) => ({
          key: r.id,
          cells: [
            r.id,
            formatPeriodLabel(r.label),
            fmtNum(r.volume, volumeUnit.decimals),
            fmtNum(r.cumulative, volumeUnit.decimals),
            r.samples,
          ],
        }))}
        resetKey={totRows}
        tulisanColor={tulisanColor}
        colorMode={colorMode}
      />
    </div>
  );
}

export default EnergyNitrogen;