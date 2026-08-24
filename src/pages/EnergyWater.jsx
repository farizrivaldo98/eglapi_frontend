// ════════════════════════════════════════════════════════════════════════
// TAB PERBANDINGAN WATER (multi-meter comparison)
//
// Diadaptasi dari PerbandinganMeter.jsx (Power) ke sistem Water.
// Mengambil data dari endpoint getEnergyWaterHistorical untuk semua 
// meter yang dipilih secara paralel.
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

var CanvasJS = CanvasJSReact.CanvasJS;
var CanvasJSChart = CanvasJSReact.CanvasJSChart;

const VOLUME_UNIT = "m³";

const PERIOD_LABELS = {
  hourly: "Per Jam",
  daily: "Per Hari",
  monthly: "Per Bulan",
};

const METERS = [
  //{ key: "trane1", label: "Train 1", colorLight: "#1e90ff", colorDark: "#00bfff" },
  //{ key: "trane2", label: "Train 2", colorLight: "#32cd32", colorDark: "#00ff00" },
  { key: "SW_Supplay", label: "SW_Output", colorLight: "#cd3232", colorDark: "#cd3232" },
  { key: "PDAM_Supplay", label: "PDAM_Output", colorLight: "#cacd32", colorDark: "#cacd32" },  
  { key: "PWG_Return", label: "PWG_Input", colorLight: "#cd32b3", colorDark: "#cd32b3" }, 


];

// Format angka display SELALU 2 desimal - toLocaleString() polos suka beda-beda
// jumlah digit di belakang koma (trailing zero ke-strip pas dikonversi ke Number).
const fmt2 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PerbandinganWater() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // Default: semua meter terpilih
  const [selectedMeterKeys, setSelectedMeterKeys] = useState(METERS.map((m) => m.key));

  const [comparisonData, setComparisonData] = useState({});
  const hasFetchedRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isTableVisible, setIsTableVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const allSelected = selectedMeterKeys.length === METERS.length;

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
      const results = await Promise.all(
        selectedMeterKeys.map((key) =>
          axios
            .get("http://10.163.0.66:8002/part/getEnergyWaterHistorical", {
              params: {
                start: datePickerStart.replace("T", " "),
                finish: datePickerFinish.replace("T", " "),
                period: periodType,
                meter: key,
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

      await logAuditAction("VIEW_ENERGY_WATER_COMPARISON", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area: selectedMeterKeys.join(","),
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

  const datePickStart = (e) => setDatePickerStart(e.target.value);
  const datePickFinish = (e) => setDatePickerFinish(e.target.value);

  // Statistik nilai Air (m³)
  const meterStatsDisplay = useMemo(() => {
    const stats = {};
    selectedMeterKeys.forEach((key) => {
      const rows = comparisonData[key] || [];
      const vals = rows.map((r) => Number(r.value) || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      
      stats[key] = {
        total: Number(total.toFixed(2)),
        avg: vals.length ? Number((total / vals.length).toFixed(2)) : 0,
        max: vals.length ? Number(Math.max(...vals).toFixed(2)) : 0,
        min: vals.length ? Number(Math.min(...vals).toFixed(2)) : 0,
        count: vals.length,
      };
    });
    return stats;
  }, [comparisonData, selectedMeterKeys]);

  const grandTotalDisplay = useMemo(
    () => Number(Object.values(meterStatsDisplay).reduce((a, s) => a + s.total, 0).toFixed(2)),
    [meterStatsDisplay]
  );

  const ranking = useMemo(() => {
    return selectedMeterKeys
      .map((key) => {
        const meter = METERS.find((m) => m.key === key);
        const total = meterStatsDisplay[key]?.total || 0;
        const pct = grandTotalDisplay > 0 ? (total / grandTotalDisplay) * 100 : 0;
        return {
          key,
          label: meter?.label || key,
          color: (isDarkMode ? meter?.colorDark : meter?.colorLight) || "#888888",
          totalDisplay: total,
          avgDisplay: meterStatsDisplay[key]?.avg ?? 0,
          maxDisplay: meterStatsDisplay[key]?.max ?? 0,
          minDisplay: meterStatsDisplay[key]?.min ?? 0,
          pct: Number(pct.toFixed(2)),
        };
      })
      .sort((a, b) => b.totalDisplay - a.totalDisplay);
  }, [selectedMeterKeys, meterStatsDisplay, grandTotalDisplay, isDarkMode]);

  const insight = useMemo(() => {
    if (ranking.length === 0) return null;
    return { top: ranking[0], bottom: ranking[ranking.length - 1], count: ranking.length };
  }, [ranking]);

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

  const lineChartOptions = useMemo(() => {
    const series = selectedMeterKeys.map((key) => {
      const meter = METERS.find((m) => m.key === key);
      const color = (isDarkMode ? meter?.colorDark : meter?.colorLight) || "#888888";
      const byLabel = rowsByLabelMap[key];
      const dataPoints = unifiedLabels.map((lbl, idx) => {
        const r = byLabel?.get(lbl);
        return {
          x: idx,
          y: r ? Number(Number(r.value).toFixed(2)) : null,
          label: lbl,
        };
      });
      return {
        type: "line",
        name: meter?.label || key,
        showInLegend: true,
        nullDataLineDashType: "dash",
        color,
        lineColor: color,
        markerColor: color,
        dataPoints,
      };
    });

    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      Margin: 8,
      title: {
        text: "Perbandingan Pemakaian Air Antar Meter",
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `${PERIOD_LABELS[periodType]} (${VOLUME_UNIT})`,
          fontColor: isDarkMode ? "white" : "black",
        },
      ],
      axisY: {
        title: `Volume (${VOLUME_UNIT})`,
        titleFontColor: isDarkMode ? "white" : "black",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      axisX: {
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        labelAngle: -30,
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      legend: { fontColor: isDarkMode ? "white" : "black" },
      toolTip: { shared: true },
      data: series,
    };
  }, [selectedMeterKeys, unifiedLabels, rowsByLabelMap, isDarkMode, periodType]);

  const pieChartOptions = useMemo(() => {
    const dataPoints = ranking.map((r) => ({
      y: r.pct,
      label: r.label,
      color: r.color,
      indexLabel: `${r.label}: ${r.pct}%`,
    }));

    return {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      title: {
        text: "Kontribusi Pemakaian per Meter",
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `Total gabungan = ${fmt2(grandTotalDisplay)} ${VOLUME_UNIT}`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 11,
        },
      ],
      toolTip: {
        contentFormatter: (e) => `${e.entries[0].dataPoint.label}: ${e.entries[0].dataPoint.y}%`,
      },
      legend: { fontColor: isDarkMode ? "white" : "black", fontSize: 11 },
      data: [
        {
          type: "doughnut",
          showInLegend: true,
          indexLabelFontColor: isDarkMode ? "white" : "black",
          indexLabelFontSize: 10,
          dataPoints,
        },
      ],
    };
  }, [ranking, grandTotalDisplay, isDarkMode]);

  const combinedRows = useMemo(() => {
    return unifiedLabels.map((lbl, idx) => {
      const row = { id: idx + 1, label: lbl };
      selectedMeterKeys.forEach((key) => {
        const r = rowsByLabelMap[key]?.get(lbl);
        row[key] = r ? Number(Number(r.value).toFixed(2)) : null;
      });
      return row;
    });
  }, [unifiedLabels, rowsByLabelMap, selectedMeterKeys]);

  const handlePrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)));

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
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
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const totalPagesExp = "{p}";

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
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
    doc.text(`Perbandingan Meter Air - ${PERIOD_LABELS[periodType]}`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["Meter", `Total (${VOLUME_UNIT})`, `Avg (${VOLUME_UNIT})`, `Max (${VOLUME_UNIT})`, `Min (${VOLUME_UNIT})`, "% Kontribusi"]],
      body: ranking.map((r) => [
        r.label,
        String(meterStatsDisplay[r.key]?.total ?? 0),
        String(meterStatsDisplay[r.key]?.avg ?? 0),
        String(meterStatsDisplay[r.key]?.max ?? 0),
        String(meterStatsDisplay[r.key]?.min ?? 0),
        `${r.pct}%`,
      ]),
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
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100] },
      },
      theme: "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Total Gabungan Semua Meter = ${fmt2(grandTotalDisplay)} ${VOLUME_UNIT}`,
      14,
      summaryFinalY + 5
    );
    doc.setFont("helvetica", "normal");

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      ...selectedMeterKeys.map((key) => ({
        header: `${METERS.find((m) => m.key === key)?.label} (${VOLUME_UNIT})`,
        dataKey: key,
      })),
    ];

    autoTable(doc, {
      columns,
      body: combinedRows,
      startY: summaryFinalY + 10,
      margin: { top: 35, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Perbandingan Meter Air (${PERIOD_LABELS[periodType]}) - ${formattedDateTime} - ${userGlobal.username}`,
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

    doc.save(`table-data-EnergyWater-Perbandingan-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area: selectedMeterKeys.join(","),
    });
  };

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
                color: isDarkMode ? "white" : "black",
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
                color: isDarkMode ? "white" : "black",
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

      <div className={`grid grid-cols-1 ${selectedMeterKeys.length > 1 ? "xl:grid-cols-3" : ""} gap-4 my-4 mx-4`}>
        <div className={`${selectedMeterKeys.length > 1 ? "xl:col-span-2" : "w-full max-w-5xl mx-auto"} bg-card rounded-lg p-1 shadow-lg overflow-x-auto`}>
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
        
        {selectedMeterKeys.length > 1 && (
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

      {insight && selectedMeterKeys.length > 1 && (
        <div className="mx-4 xl:mx-20 mb-6 bg-card rounded-lg p-4 shadow-lg">
          <h5 className="text-text font-semibold mb-3">Ringkasan &amp; Analisa</h5>
          <p className="text-text mb-3">
            Dari {insight.count} meter yang dibandingkan pada periode ini, total pemakaian air gabungan adalah{" "}
            <strong>
              {fmt2(grandTotalDisplay)} {VOLUME_UNIT}
            </strong>
            . Penggunaan tertinggi adalah <strong>{insight.top.label}</strong> dengan kontribusi{" "}
            <strong>{insight.top.pct}%</strong> ({fmt2(insight.top.totalDisplay)} {VOLUME_UNIT}),
            sedangkan yang terendah adalah <strong>{insight.bottom.label}</strong> dengan{" "}
            <strong>{insight.bottom.pct}%</strong> ({fmt2(insight.bottom.totalDisplay)} {VOLUME_UNIT}).
          </p>
          <div className="flex flex-col gap-2 overflow-x-auto">
            {/* Keterangan kolom - % dan Total udah ada dari awal, Avg/Max/Min baru.
                Semuanya per-meter (per area), BUKAN min/max gabungan semua meter. */}
            <div className="flex items-center gap-3 px-1">
              <span className="w-6" />
              <span className="w-32" />
              <span className="flex-1" />
              <span className="text-text text-xs font-semibold w-16 text-right whitespace-nowrap">%</span>
              <span className="text-text text-xs font-semibold w-32 text-right whitespace-nowrap">Total</span>
              <span className="text-text text-xs font-semibold w-24 text-right whitespace-nowrap">Avg</span>
              <span className="text-text text-xs font-semibold w-24 text-right whitespace-nowrap">Max</span>
              <span className="text-text text-xs font-semibold w-24 text-right whitespace-nowrap">Min</span>
            </div>
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
                <span className="text-text w-16 text-right whitespace-nowrap">{r.pct}%</span>
                <span className="text-text w-32 text-right whitespace-nowrap">
                  {fmt2(r.totalDisplay)} {VOLUME_UNIT}
                </span>
                <span className="text-text w-24 text-right whitespace-nowrap">
                  {fmt2(r.avgDisplay)} {VOLUME_UNIT}
                </span>
                <span className="text-text w-24 text-right whitespace-nowrap">
                  {fmt2(r.maxDisplay)} {VOLUME_UNIT}
                </span>
                <span className="text-text w-24 text-right whitespace-nowrap">
                  {fmt2(r.minDisplay)} {VOLUME_UNIT}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <TableCaption sx={{ color: tulisanColor }}>Perbandingan Meter Air</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  {selectedMeterKeys.map((key) => (
                    <Th key={key} sx={{ color: tulisanColor }}>
                      {METERS.find((m) => m.key === key)?.label} ({VOLUME_UNIT})
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
    </div>
  );
}

export default PerbandinganWater;