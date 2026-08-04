import { useState, useEffect, useMemo } from "react";
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

// Satuan volume flow meter Trane1/Trane2 - ganti di sini aja kalau ternyata
// bukan m³ (misal liter), gak perlu ubah di banyak tempat.
const VOLUME_UNIT = "m³";

const PERIOD_LABELS = {
  hourly: "Per Jam",
  daily: "Per Hari",
  monthly: "Per Bulan",
};

// Daftar meter yang bisa dipilih di dropdown. Backend (getEnergyWaterHistorical)
// saat ini balikin tiap row dengan kolom trane1 & trane2 (lihat
// mergeEnergyWaterMeters di databaseControllers.js). Kalau nanti nambah meter
// baru (trane3, dst), tinggal tambah entry di sini pakai `key` yang sama
// dengan nama kolom dari backend - dropdown, chart, tabel, dan PDF export
// otomatis ikut, gak perlu ubah komponen ini lagi.
const METERS = [
  { key: "trane1", label: "Trane 1", colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "trane2", label: "Trane 2", colorLight: "#32cd32", colorDark: "#00ff00" },
  // { key: "trane3", label: "Trane 3", colorLight: "#ff8c00", colorDark: "#ffa500" },
];

function EnergyWater() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // [{ id, label, trane1, trane2, average }] - hasil delta totalizer per
  // periode, sudah digabung semua meter + average dari backend. Ganti
  // dropdown meter / checkbox rata-rata gak perlu fetch ulang, tinggal
  // filter ulang array ini di frontend.
  const [mergedData, setMergedData] = useState([]);

  // Meter yang lagi ditampilkan di grafik & tabel.
  const [selectedMeterKey, setSelectedMeterKey] = useState(METERS[0].key);
  // Toggle garis rata-rata di grafik.
  const [showAverageLine, setShowAverageLine] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isTableVisible, setIsTableVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue(
    "rgba(var(--color-border))",
    "rgba(var(--color-border))"
  );
  const tulisanColor = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  const hoverBorderColor = useColorModeValue(
    "rgba(var(--color-border2))",
    "rgba(var(--color-border2))"
  );

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

  const calcStats = (rows, key) => {
    if (!rows || rows.length === 0) return { avg: 0, max: 0, min: 0 };
    const vals = rows.map((r) => Number(r[key]) || 0);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      avg: Number(avg.toFixed(2)),
      max: Number(max.toFixed(2)),
      min: Number(min.toFixed(2)),
    };
  };

  const selectedMeter = METERS.find((m) => m.key === selectedMeterKey) || METERS[0];

  // Data grafik: garis meter yang lagi dipilih + garis rata-rata, dihitung
  // dari mergedData yang udah ke-fetch.
  const selectedChartData = useMemo(
    () => mergedData.map((r, idx) => ({ x: idx, y: Number(r[selectedMeterKey]) || 0, label: r.label })),
    [mergedData, selectedMeterKey]
  );
  const avgChartData = useMemo(
    () => mergedData.map((r, idx) => ({ x: idx, y: Number(r.average) || 0, label: r.label })),
    [mergedData]
  );

  const selectedStats = useMemo(() => calcStats(mergedData, selectedMeterKey), [mergedData, selectedMeterKey]);
  const avgStats = useMemo(() => calcStats(mergedData, "average"), [mergedData]);

  // ── DIMODIFIKASI: tambah logAuditAction setelah fetch berhasil ──
  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        "http://10.163.0.66:8002/part/getEnergyWaterHistorical",
        {
          params: {
            start: datePickerStart.replace("T", " "),
            finish: datePickerFinish.replace("T", " "),
            period: periodType,
          },
        }
      );

      const rows = response.data.data || [];
      setMergedData(rows);
      setCurrentPage(1);
      setIsTableVisible(true);

      if (rows.length === 0) {
        setError("Tidak ada data pada rentang tanggal ini");
      }

      // ── AUDIT: catat VIEW_ENERGY_WATER ─────────────────────
      await logAuditAction("VIEW_ENERGY_WATER", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        meter: selectedMeterKey,
      });
      // ─────────────────────────────────────────────────────────
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to fetch data. Please try again.");
    } finally {
      const delay = 800;
      setTimeout(() => {
        setLoading(false);
      }, delay);
    }
  };
  // ────────────────────────────────────────────────────────────

  const datePickStart = (e) => {
    setDatePickerStart(e.target.value);
  };
  const datePickFinish = (e) => {
    setDatePickerFinish(e.target.value);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };
  const handleNextPage = () => {
    setCurrentPage((prev) =>
      Math.min(prev + 1, Math.max(Math.ceil(mergedData.length / rowsPerPage), 1))
    );
  };

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleData = mergedData.slice(startIndex, startIndex + rowsPerPage);

    if (mergedData.length === 0) {
      return (
        <Tr>
          <Td colSpan={4} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        <Td>{row[selectedMeterKey]}</Td>
        <Td>{row.average}</Td>
      </Tr>
    ));
  };

  // ── DIMODIFIKASI: tambah logAuditAction setelah export ──
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

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      { header: `${selectedMeter.label} (${VOLUME_UNIT})`, dataKey: selectedMeterKey },
      { header: `Average (${VOLUME_UNIT})`, dataKey: "average" },
    ];

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
    doc.text(`Summary - ${PERIOD_LABELS[periodType]} (${selectedMeter.label})`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["", `${selectedMeter.label} (${VOLUME_UNIT})`, `Average (${VOLUME_UNIT})`]],
      body: [
        ["Avg", String(selectedStats.avg), String(avgStats.avg)],
        ["Max", String(selectedStats.max), String(avgStats.max)],
        ["Min", String(selectedStats.min), String(avgStats.min)],
      ],
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
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100], cellWidth: 30 },
        1: { textColor: [0, 0, 139], cellWidth: 70 },
        2: { textColor: [0, 0, 139], cellWidth: 70 },
      },
      theme: "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;

    autoTable(doc, {
      columns,
      body: mergedData,
      startY: summaryFinalY + 5,
      margin: { top: 35, bottom: 20 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Energy Water (${PERIOD_LABELS[periodType]} - ${selectedMeter.label}) - ${formattedDateTime} - ${userGlobal.username}`,
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

    doc.save(`table-data-EnergyWater-${selectedMeter.label.replace(/\s+/g, "")}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF_ENERGY_WATER", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      meter: selectedMeterKey,
    });
  };
  // ────────────────────────────────────────────────────────

  // 1 chart, isinya garis meter yang lagi dipilih + garis rata-rata (opsional,
  // ngikutin checkbox showAverageLine).
  const chartOptions = useMemo(() => {
    const meterColor = isDarkMode ? selectedMeter.colorDark : selectedMeter.colorLight;
    const avgColor = isDarkMode ? "#ffa500" : "#ff8c00";

    const series = [
      {
        type: "line",
        name: selectedMeter.label,
        showInLegend: true,
        xValueFormatString: "",
        yValueFormatString: "",
        color: meterColor,
        lineColor: meterColor,
        markerColor: meterColor,
        dataPoints: selectedChartData,
      },
    ];

    if (showAverageLine) {
      series.push({
        type: "line",
        name: "Average",
        showInLegend: true,
        xValueFormatString: "",
        yValueFormatString: "",
        color: avgColor,
        lineColor: avgColor,
        markerColor: avgColor,
        dataPoints: avgChartData,
      });
    }

    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      Margin: 8,
      title: {
        text: `Pemakaian Air - ${selectedMeter.label}`,
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: PERIOD_LABELS[periodType],
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
        tickLength: 5,
        tickThickness: 2,
      },
      axisX: {
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        labelAngle: -30,
        tickLength: 5,
        tickThickness: 2,
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      legend: {
        fontColor: isDarkMode ? "white" : "black",
      },
      toolTip: { shared: true },
      data: series,
    };
  }, [selectedMeter, selectedChartData, avgChartData, showAverageLine, isDarkMode, periodType]);

  const renderChart = () => (
    <div className="w-full max-w-5xl mx-auto block bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
      {loading ? (
        <div className="flex flex-col items-center py-10">
          <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
        </div>
      ) : error && mergedData.length === 0 ? (
        <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
      ) : (
        <CanvasJSChart options={chartOptions} />
      )}
    </div>
  );

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
          <h5 className="mb-1">Meter</h5>
          <Select
            value={selectedMeterKey}
            onChange={(e) => setSelectedMeterKey(e.target.value)}
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
            {METERS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
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

      {/* Checkbox toggle garis rata-rata di grafik */}
      <div className="flex justify-center mt-2">
        <Checkbox
          isChecked={showAverageLine}
          onChange={(e) => setShowAverageLine(e.target.checked)}
          colorScheme="orange"
        >
          <span className="text-text">Tampilkan garis rata-rata</span>
        </Checkbox>
      </div>

      {/* 1 chart: garis meter yang dipilih + garis rata-rata (opsional) */}
      <div className="my-4 mx-4">{renderChart()}</div>

      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={4} align="center">
        <div className="mt-3">
          <div className="ml-16 text-text">Avg {selectedMeter.label} = {selectedStats.avg.toLocaleString()} {VOLUME_UNIT}</div>
          <div className="ml-16 text-text">Max {selectedMeter.label} = {selectedStats.max.toLocaleString()} {VOLUME_UNIT}</div>
          <div className="ml-16 text-text">Min {selectedMeter.label} = {selectedStats.min.toLocaleString()} {VOLUME_UNIT}</div>
        </div>
        <div className="mt-3">
          <div className="ml-16 text-text">Avg Average = {avgStats.avg.toLocaleString()} {VOLUME_UNIT}</div>
          <div className="ml-16 text-text">Max Average = {avgStats.max.toLocaleString()} {VOLUME_UNIT}</div>
          <div className="ml-16 text-text">Min Average = {avgStats.min.toLocaleString()} {VOLUME_UNIT}</div>
        </div>
      </Stack>

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
        <div className="mt-8 mx-20 bg-card rounded-md">
          <TableContainer>
            <Table key={colorMode} variant="simple">
              <TableCaption sx={{ color: tulisanColor }}>Energy Water - {selectedMeter.label}</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  <Th sx={{ color: tulisanColor }}>{selectedMeter.label} ({VOLUME_UNIT})</Th>
                  <Th sx={{ color: tulisanColor }}>Average ({VOLUME_UNIT})</Th>
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
          Page {currentPage} of {Math.max(Math.ceil(mergedData.length / rowsPerPage), 1)}
        </span>
        <Button
          onClick={handleNextPage}
          isDisabled={currentPage === Math.max(Math.ceil(mergedData.length / rowsPerPage), 1)}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default EnergyWater;