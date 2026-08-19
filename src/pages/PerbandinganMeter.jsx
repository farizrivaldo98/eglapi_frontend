// ════════════════════════════════════════════════════════════════════════
// TAB 3 - PERBANDINGAN METER (multi-meter comparison)
//
// Beda sama Total Energy (yang cuma nampilin 1 meter): tab ini narik data
// SEMUA meter yang dipilih user (checkbox, default: semua ke-select) secara
// paralel (Promise.all ke endpoint yang sama, getEnergyPowerHistorical,
// tetap dipanggil sekali per meter karena backend cuma bisa query 1 tabel
// per request) lalu digabung jadi:
//   1. Grafik garis multi-series (1 garis per meter, warna ngikutin METERS)
//   2. Grafik doughnut % kontribusi totalizer tiap meter ke total gabungan
//   3. Ranking + insight singkat otomatis (tertinggi / terendah / total)
//   4. Tabel gabungan (kolom otomatis ngikutin meter yang lagi dipilih)
//
// PENTING - biar "otomatis nambah" kalau nanti ada meter baru: SEMUA bagian
// di bawah (checkbox pilih meter, garis di grafik, slice doughnut, kolom
// tabel, warna ranking) di-generate dari array METERS di EnergyPowerConstants /
// dari selectedMeterKeys (subset METERS). Jadi kalau ada meter ke-5, ke-6,
// dst, tinggal tambah 1 entry baru di array METERS - tab ini otomatis ikut
// nampilin tanpa perlu diubah lagi.
// ════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import {
  Select,
  Input,
  Button,
  Checkbox,
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
import { PERIOD_LABELS, UNITS, METERS } from "./EnergyPowerConstants";

var CanvasJS = CanvasJSReact.CanvasJS;
var CanvasJSChart = CanvasJSReact.CanvasJSChart;

function PerbandinganMeter() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // Default: semua meter ke-select ("keseluruhan"). User bisa uncheck
  // satu-satu buat bandingin "beberapa unit" aja.
  const [selectedMeterKeys, setSelectedMeterKeys] = useState(METERS.map((m) => m.key));
  const [unitKey, setUnitKey] = useState("wh");

  // { [meterKey]: rows[] } - hasil fetch per meter, rows dalam Wh mentah
  // (sama kayak TotalEnergyAnalisa), dikonversi ke satuan terpilih pas dipakai
  // biar ganti checkbox Wh/kWh/MWh gak perlu fetch ulang.
  const [comparisonData, setComparisonData] = useState({});

  const hasFetchedRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isTableVisible, setIsTableVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { colorMode } = useColorMode();
  const borderColor      = useColorModeValue("rgba(var(--color-border))",  "rgba(var(--color-border))");
  const tulisanColor     = useColorModeValue("rgba(var(--color-text))",    "rgba(var(--color-text))");
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

  const selectedUnit = UNITS[unitKey] || UNITS.wh;
  const allSelected  = selectedMeterKeys.length === METERS.length;

  const toggleMeter = (key) => {
    setSelectedMeterKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const toggleSelectAll = () => {
    setSelectedMeterKeys((prev) => (prev.length === METERS.length ? [] : METERS.map((m) => m.key)));
  };

  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    if (selectedMeterKeys.length === 0) {
      setError("Pilih minimal 1 meter untuk dibandingkan");
      return;
    }
    hasFetchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 1 request per meter, ditembak paralel. Kalau salah satu gagal,
      // meter itu dianggap "0 data" biar meter lain tetap tampil.
      const results = await Promise.all(
        selectedMeterKeys.map((key) =>
          axios
            .get("http://10.163.0.66:8002/part/getEnergyPowerHistorical", {
              params: {
                start:  datePickerStart.replace("T", " "),
                finish: datePickerFinish.replace("T", " "),
                period: periodType,
                meter:  key,
              },
            })
            .then((res) => ({ key, rows: res.data.data || [] }))
            .catch(() => ({ key, rows: [] }))
        )
      );

      const dataMap = {};
      results.forEach((r) => {
        dataMap[r.key] = r.rows;
      });
      setComparisonData(dataMap);
      setCurrentPage(1);
      setIsTableVisible(true);

      const totalRows = results.reduce((sum, r) => sum + r.rows.length, 0);
      if (totalRows === 0) {
        setError("Tidak ada data pada rentang tanggal ini");
      }

      await logAuditAction("VIEW_ENERGY_POWER_COMPARISON", {
        start:  datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area:   selectedMeterKeys.join(","),
      });
    } catch (err) {
      console.error("Error fetching comparison data:", err);
      setError("Failed to fetch data. Please try again.");
    } finally {
      const delay = 800;
      setTimeout(() => {
        setLoading(false);
      }, delay);
    }
  };

  const datePickStart  = (e) => setDatePickerStart(e.target.value);
  const datePickFinish = (e) => setDatePickerFinish(e.target.value);

  // Statistik mentah (Wh) per meter yang lagi dipilih.
  const meterStatsRaw = useMemo(() => {
    const stats = {};
    selectedMeterKeys.forEach((key) => {
      const rows  = comparisonData[key] || [];
      const vals  = rows.map((r) => Number(r.value) || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      stats[key] = {
        total,
        avg:   vals.length ? total / vals.length : 0,
        max:   vals.length ? Math.max(...vals) : 0,
        min:   vals.length ? Math.min(...vals) : 0,
        count: vals.length,
      };
    });
    return stats;
  }, [comparisonData, selectedMeterKeys]);

  // Sama kayak di atas tapi udah dikonversi ke satuan terpilih (Wh/kWh/MWh).
  const meterStatsDisplay = useMemo(() => {
    const f   = selectedUnit.factor;
    const d   = selectedUnit.decimals;
    const out = {};
    Object.entries(meterStatsRaw).forEach(([key, s]) => {
      out[key] = {
        total: Number((s.total * f).toFixed(d)),
        avg:   Number((s.avg   * f).toFixed(d)),
        max:   Number((s.max   * f).toFixed(d)),
        min:   Number((s.min   * f).toFixed(d)),
      };
    });
    return out;
  }, [meterStatsRaw, selectedUnit]);

  // Total gabungan semua meter terpilih (Wh mentah) - basis persentase di
  // doughnut chart, juga ditampilkan dalam satuan terpilih.
  const grandTotalRaw = useMemo(
    () => Object.values(meterStatsRaw).reduce((a, s) => a + s.total, 0),
    [meterStatsRaw]
  );
  const grandTotalDisplay = useMemo(
    () => Number((grandTotalRaw * selectedUnit.factor).toFixed(selectedUnit.decimals)),
    [grandTotalRaw, selectedUnit]
  );

  // Ranking meter dari total energi terbesar -> terkecil, tiap entry udah
  // termasuk % kontribusinya ke grandTotalRaw. Dipakai buat doughnut chart,
  // list ranking, dan insight otomatis.
  const ranking = useMemo(() => {
    return selectedMeterKeys
      .map((key) => {
        const meter = METERS.find((m) => m.key === key);
        const total = meterStatsRaw[key]?.total || 0;
        const pct   = grandTotalRaw > 0 ? (total / grandTotalRaw) * 100 : 0;
        return {
          key,
          label:        meter?.label || key,
          color:        (isDarkMode ? meter?.colorDark : meter?.colorLight) || "#888888",
          totalRaw:     total,
          totalDisplay: meterStatsDisplay[key]?.total ?? 0,
          pct:          Number(pct.toFixed(2)),
        };
      })
      .sort((a, b) => b.totalRaw - a.totalRaw);
  }, [selectedMeterKeys, meterStatsRaw, meterStatsDisplay, grandTotalRaw, isDarkMode]);

  // Insight singkat otomatis - tertinggi, terendah, total gabungan.
  const insight = useMemo(() => {
    if (ranking.length === 0) return null;
    return { top: ranking[0], bottom: ranking[ranking.length - 1], count: ranking.length };
  }, [ranking]);

  // FIX timeline kebalik/berantakan: kumpulin SEMUA label periode dari SEMUA
  // meter terpilih, dedupe, lalu urutkan ASCENDING berdasarkan tanggal aslinya
  // (paling lama di kiri, paling baru di kanan). Ini jadi satu-satunya sumbu-X
  // yang dipakai bareng semua meter - tiap meter tinggal "nempel" ke label yang
  // sama, kalau meter itu gak punya data di periode tsb, tinggal dikasih null
  // (garisnya putus di titik itu, bukan ngaco).
  const unifiedLabels = useMemo(() => {
    const labelSet = new Set();
    selectedMeterKeys.forEach((key) => {
      (comparisonData[key] || []).forEach((r) => {
        if (r?.label) labelSet.add(r.label);
      });
    });
    return Array.from(labelSet).sort((a, b) => {
      const da = new Date(a).getTime();
      const db = new Date(b).getTime();
      if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
      return String(a).localeCompare(String(b));
    });
  }, [comparisonData, selectedMeterKeys]);

  // Lookup cepat "label periode -> row" per meter, dipakai bareng sama
  // lineChartOptions & combinedRows biar gak nyari linear berulang-ulang.
  const rowsByLabelMap = useMemo(() => {
    const map = {};
    selectedMeterKeys.forEach((key) => {
      const m = new Map();
      (comparisonData[key] || []).forEach((r) => {
        if (r?.label) m.set(r.label, r);
      });
      map[key] = m;
    });
    return map;
  }, [comparisonData, selectedMeterKeys]);

  // Grafik garis multi-series, 1 garis per meter yang dipilih.
  const lineChartOptions = useMemo(() => {
    const series = selectedMeterKeys.map((key) => {
      const meter      = METERS.find((m) => m.key === key);
      const color      = (isDarkMode ? meter?.colorDark : meter?.colorLight) || "#888888";
      const byLabel    = rowsByLabelMap[key];
      const dataPoints = unifiedLabels.map((lbl, idx) => {
        const r = byLabel?.get(lbl);
        return {
          x:     idx,
          y:     r ? Number((Number(r.value) * selectedUnit.factor).toFixed(selectedUnit.decimals)) : null,
          label: lbl,
        };
      });
      return {
        type:                 "line",
        name:                 meter?.label || key,
        showInLegend:         true,
        nullDataLineDashType: "dash",
        color,
        lineColor:            color,
        markerColor:          color,
        dataPoints,
      };
    });

    return {
      zoomEnabled:     true,
      theme:           isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      Margin:          8,
      title: {
        text:      "Perbandingan Total Energy Antar Meter",
        fontColor: isDarkMode ? "white" : "black",
        fontSize:  16,
      },
      subtitles: [
        {
          text:      `${PERIOD_LABELS[periodType]} (${selectedUnit.label})`,
          fontColor: isDarkMode ? "white" : "black",
        },
      ],
      axisY: {
        title:          `Energi (${selectedUnit.label})`,
        titleFontColor: isDarkMode ? "white" : "black",
        gridColor:      isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor:      isDarkMode ? "#d6d6d6" : "#474747",
        tickColor:      isDarkMode ? "#d6d6d6" : "#474747",
      },
      axisX: {
        lineColor:      isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        labelAngle:     -30,
        tickColor:      isDarkMode ? "#d6d6d6" : "#474747",
      },
      legend:  { fontColor: isDarkMode ? "white" : "black" },
      toolTip: { shared: true },
      data:    series,
    };
  }, [selectedMeterKeys, unifiedLabels, rowsByLabelMap, isDarkMode, periodType, selectedUnit]);

  // Grafik doughnut % kontribusi totalizer tiap meter terhadap total gabungan.
  const pieChartOptions = useMemo(() => {
    const dataPoints = ranking.map((r) => ({
      y:          r.pct,
      label:      r.label,
      color:      r.color,
      indexLabel: `${r.label}: ${r.pct}%`,
    }));

    return {
      theme:           isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      title: {
        text:      "Kontribusi Totalizer per Meter",
        fontColor: isDarkMode ? "white" : "black",
        fontSize:  16,
      },
      subtitles: [
        {
          text:      `Total gabungan = ${grandTotalDisplay.toLocaleString()} ${selectedUnit.label}`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize:  11,
        },
      ],
      toolTip: {
        contentFormatter: (e) => `${e.entries[0].dataPoint.label}: ${e.entries[0].dataPoint.y}%`,
      },
      legend: { fontColor: isDarkMode ? "white" : "black", fontSize: 11 },
      data: [
        {
          type:                "doughnut",
          showInLegend:        true,
          indexLabelFontColor: isDarkMode ? "white" : "black",
          indexLabelFontSize:  10,
          dataPoints,
        },
      ],
    };
  }, [ranking, grandTotalDisplay, selectedUnit, isDarkMode]);

  // Tabel gabungan: baris = periode (ngikutin unifiedLabels, urutan ASC),
  // kolom = tiap meter yang dipilih. Kalau ada meter yang gak punya data di
  // periode tsb, selnya "-" - gak bikin baris lain ikut geser.
  const combinedRows = useMemo(() => {
    return unifiedLabels.map((lbl, idx) => {
      const row = { id: idx + 1, label: lbl };
      selectedMeterKeys.forEach((key) => {
        const r    = rowsByLabelMap[key]?.get(lbl);
        row[key]   = r ? Number((Number(r.value) * selectedUnit.factor).toFixed(selectedUnit.decimals)) : null;
      });
      return row;
    });
  }, [unifiedLabels, rowsByLabelMap, selectedMeterKeys, selectedUnit]);

  const handlePrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)));

  const renderTable = () => {
    const startIndex  = (currentPage - 1) * rowsPerPage;
    const visibleData = combinedRows.slice(startIndex, startIndex + rowsPerPage);

    if (combinedRows.length === 0) {
      return (
        <Tr>
          <Td colSpan={selectedMeterKeys.length + 2} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        {selectedMeterKeys.map((key) => (
          <Td key={key}>{row[key] ?? "-"}</Td>
        ))}
      </Tr>
    ));
  };

  const exportToPDF = async () => {
    const doc       = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const totalPagesExp = "{p}";

    const now     = new Date();
    const day     = String(now.getDate()).padStart(2, "0");
    const month   = String(now.getMonth() + 1).padStart(2, "0");
    const year    = now.getFullYear();
    const hours   = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const formattedDateTime = `${day}/${month}/${year} ${hours}:${minutes}`;
    const fileSuffix        = `${year}${month}${day}_${hours}${minutes}`;

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
    doc.text(`Perbandingan Meter - ${PERIOD_LABELS[periodType]} (${selectedUnit.label})`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["Meter", "Total", "Avg", "Max", "Min", "% Kontribusi"]],
      body: ranking.map((r) => [
        r.label,
        String(meterStatsDisplay[r.key]?.total ?? 0),
        String(meterStatsDisplay[r.key]?.avg   ?? 0),
        String(meterStatsDisplay[r.key]?.max   ?? 0),
        String(meterStatsDisplay[r.key]?.min   ?? 0),
        `${r.pct}%`,
      ]),
      startY: 34,
      margin: { left: 10, right: 10 },
      styles:     { fontSize: 8, cellPadding: 2, halign: "center" },
      headStyles: {
        fillColor:  [52, 144, 220],
        textColor:  [255, 255, 255],
        fontStyle:  "bold",
        halign:     "center",
        fontSize:   8,
      },
      columnStyles: {
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100] },
      },
      theme:          "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Total Gabungan Semua Meter = ${grandTotalDisplay.toLocaleString()} ${selectedUnit.label}`,
      14,
      summaryFinalY + 5
    );
    doc.setFont("helvetica", "normal");

    const columns = [
      { header: "No",      dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      ...selectedMeterKeys.map((key) => ({
        header:  `${METERS.find((m) => m.key === key)?.label} (${selectedUnit.label})`,
        dataKey: key,
      })),
    ];

    autoTable(doc, {
      columns,
      body:   combinedRows,
      startY: summaryFinalY + 10,
      margin: { top: 35, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      didDrawPage: () => {
        const pageHeight     = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Perbandingan Meter (${PERIOD_LABELS[periodType]} - ${selectedUnit.label}) - ${formattedDateTime} - ${userGlobal.username}`,
          14,
          pageHeight - 10
        );
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

    doc.save(`table-data-EnergyPower-Perbandingan-${selectedUnit.label}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start:  datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area:   selectedMeterKeys.join(","),
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PENANDA LOGIC: Cek apakah user hanya memilih 1 meter.
  // Jika iya, kita akan sembunyikan donut chart, summary, dan table.
  // ─────────────────────────────────────────────────────────────────────────────
  const isSingleMeter = selectedMeterKeys.length === 1;

  return (
    <div>
      <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
        <div>
          <h5 className="mb-1">Periode</h5>
          <Select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value)}
            size="md"
            width="160px"
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          >
            <option value="hourly">Per Jam</option>
            <option value="daily">Per Hari</option>
            <option value="monthly">Per Bulan</option>
          </Select>
        </div>
        <div>
          <h5 className="mb-1"> Start Date</h5>
          <Input
            onChange={datePickStart}
            placeholder="Start Date"
            size="md"
            type="datetime-local"
            css={{
              "&::-webkit-calendar-picker-indicator": {
                color:  isDarkMode ? "white" : "black",
                filter: isDarkMode ? "invert(1)" : "none",
              },
            }}
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          />
        </div>
        <div>
          <h5 className="mb-1"> Finish Date </h5>
          <Input
            onChange={datePickFinish}
            placeholder="Finish Date"
            size="md"
            type="datetime-local"
            css={{
              "&::-webkit-calendar-picker-indicator": {
                color:  isDarkMode ? "white" : "black",
                filter: isDarkMode ? "invert(1)" : "none",
              },
            }}
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          />
        </div>
        <div className="w-full flex justify-center xl:w-auto">
          <div className="ml-0 xl:ml-6 mt-7 truncate">
            <Button onClick={() => getSubmit()} colorScheme="blue">
              Submit
            </Button>
          </div>
          <div className="ml-2 mt-7">
            <Button onClick={exportToPDF} colorScheme="red" isDisabled={userGlobal.level < 3}>
              Export to PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Pilih meter: "Semua Meter" (keseluruhan) atau uncheck satu-satu */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <Checkbox
          isChecked={allSelected}
          isIndeterminate={selectedMeterKeys.length > 0 && !allSelected}
          onChange={toggleSelectAll}
          colorScheme="blue"
        >
          <span className="text-text font-semibold">Semua Meter</span>
        </Checkbox>
        <div className="flex flex-wrap justify-center gap-4">
          {METERS.map((m) => (
            <Checkbox
              key={m.key}
              isChecked={selectedMeterKeys.includes(m.key)}
              onChange={() => toggleMeter(m.key)}
              colorScheme="blue"
            >
              <span
                className="text-text"
                style={{ borderBottom: `3px solid ${isDarkMode ? m.colorDark : m.colorLight}`, paddingBottom: 1 }}
              >
                {m.label}
              </span>
            </Checkbox>
          ))}
        </div>
      </div>

      {/* Checkbox pilih satuan tampilan - Wh / kWh / MWh */}
      <div className="flex justify-center gap-6 mt-3">
        <Checkbox isChecked={unitKey === "wh"}  onChange={() => setUnitKey("wh")}  colorScheme="blue">
          <span className="text-text">Wh</span>
        </Checkbox>
        <Checkbox isChecked={unitKey === "kwh"} onChange={() => setUnitKey("kwh")} colorScheme="blue">
          <span className="text-text">kWh</span>
        </Checkbox>
        <Checkbox isChecked={unitKey === "mwh"} onChange={() => setUnitKey("mwh")} colorScheme="blue">
          <span className="text-text">MWh</span>
        </Checkbox>
      </div>

      {/* Grafik garis perbandingan + doughnut kontribusi.
          Jika isSingleMeter = true, kolom grid disatukan dan chart doughnut dihilangkan. */}
      <div className={`grid grid-cols-1 gap-4 my-4 mx-4 ${!isSingleMeter ? "xl:grid-cols-3" : ""}`}>
        <div className={`${!isSingleMeter ? "xl:col-span-2" : ""} bg-card rounded-lg p-1 shadow-lg overflow-x-auto`}>
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
            </div>
          ) : error && Object.keys(comparisonData).length === 0 ? (
            <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
          ) : (
            <CanvasJSChart options={lineChartOptions} />
          )}
        </div>
        
        {/* Render Doughnut Chart HANYA JIKA BUKAN single meter */}
        {!isSingleMeter && (
          <div className="bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center py-10">
                <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="lg" />
              </div>
            ) : error && Object.keys(comparisonData).length === 0 ? (
              <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
            ) : (
              <CanvasJSChart options={pieChartOptions} />
            )}
          </div>
        )}
      </div>

      {/* Ranking + insight otomatis, HANYA JIKA BUKAN single meter */}
      {!isSingleMeter && insight && (
        <div className="mx-4 xl:mx-20 mb-6 bg-card rounded-lg p-4 shadow-lg">
          <h5 className="text-text font-semibold mb-3">Ringkasan &amp; Analisa</h5>
          <p className="text-text mb-3">
            Dari {insight.count} meter yang dibandingkan pada periode ini, total energi gabungan adalah{" "}
            <strong>
              {grandTotalDisplay.toLocaleString()} {selectedUnit.label}
            </strong>
            . Konsumen energi tertinggi adalah <strong>{insight.top.label}</strong> dengan kontribusi{" "}
            <strong>{insight.top.pct}%</strong> ({insight.top.totalDisplay.toLocaleString()} {selectedUnit.label}),
            sedangkan yang terendah adalah <strong>{insight.bottom.label}</strong> dengan{" "}
            <strong>{insight.bottom.pct}%</strong> ({insight.bottom.totalDisplay.toLocaleString()} {selectedUnit.label}).
          </p>
          <div className="flex flex-col gap-2">
            {ranking.map((r, idx) => (
              <div key={r.key} className="flex items-center gap-3">
                <span className="text-text w-6">{idx + 1}.</span>
                <span className="text-text w-32 truncate">{r.label}</span>
                <div
                  className="flex-1 rounded h-4 overflow-hidden"
                  style={{ background: isDarkMode ? "#333333" : "#e5e7eb" }}
                >
                  <div className="h-4 rounded" style={{ width: `${r.pct}%`, background: r.color }} />
                </div>
                <span className="text-text w-16 text-right">{r.pct}%</span>
                <span className="text-text w-32 text-right">
                  {r.totalDisplay.toLocaleString()} {selectedUnit.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wrapper Table Section HANYA JIKA BUKAN single meter */}
      {!isSingleMeter && (
        <>
          <br />
          <Stack className="flex flex-row justify-center gap-2" direction="row" spacing={2} align="center">
            <div className="mt-2">
              <Select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} width="80px">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={40}>40</option>
                <option value={60}>60</option>
                <option value={100}>100</option>
              </Select>
            </div>
            <div>
              <Button className="w-40 mt-2" colorScheme="red" onClick={() => setIsTableVisible(!isTableVisible)}>
                {isTableVisible ? "Hide All Data" : "Show All Data"}
              </Button>
            </div>
          </Stack>

          {isTableVisible && (
            <div className="mt-8 mx-4 xl:mx-20 bg-card rounded-md">
              <TableContainer>
                <Table key={colorMode} variant="simple">
                  <TableCaption sx={{ color: tulisanColor }}>Perbandingan Meter</TableCaption>
                  <Thead>
                    <Tr>
                      <Th sx={{ color: tulisanColor }}>No</Th>
                      <Th sx={{ color: tulisanColor }}>Periode</Th>
                      {selectedMeterKeys.map((key) => (
                        <Th key={key} sx={{ color: tulisanColor }}>
                          {METERS.find((m) => m.key === key)?.label} ({selectedUnit.label})
                        </Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>{renderTable()}</Tbody>
                </Table>
              </TableContainer>
            </div>
          )}

          <div className="flex justify-center items-center my-4 gap-4">
            <Button onClick={handlePrevPage} isDisabled={currentPage === 1} colorScheme="blue">
              Previous
            </Button>
            <span className="text-text">
              Page {currentPage} of {Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)}
            </span>
            <Button
              onClick={handleNextPage}
              isDisabled={currentPage === Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)}
              colorScheme="blue"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default PerbandinganMeter;