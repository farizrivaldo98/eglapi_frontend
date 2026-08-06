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
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
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

const PERIOD_LABELS = {
  hourly: "Per Jam",
  daily: "Per Hari",
  monthly: "Per Bulan",
};

// Backend (getEnergyPowerHistorical) SELALU balikin value dalam satuan Wh
// (lihat data_format_4 = Total Energy (Wh) di databaseControllers.js).
// Konversi Wh -> kWh -> MWh murni dilakukan di sini (frontend), tinggal
// kalikan raw value (Wh) dengan factor di bawah. Decimals dibedakan per
// satuan biar MWh (angkanya kecil) tetap kebaca, bukan 0.000.
const UNITS = {
  wh: { key: "wh", label: "Wh", factor: 1, decimals: 2 },
  kwh: { key: "kwh", label: "kWh", factor: 1 / 1e3, decimals: 3 },
  mwh: { key: "mwh", label: "MWh", factor: 1 / 1e6, decimals: 5 },
};

// Daftar meter yang bisa dipilih di dropdown. Backend cuma query 1 tabel
// sesuai `meter` yang dikirim (lihat ENERGY_POWER_TABLES di
// databaseControllers.js). Dipakai bareng-bareng sama kedua tab (Total
// Energy & Analisa Parameter) karena sumber tabelnya sama.
const METERS = [
  { key: "uty1", label: "PP UTY1", colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "lapi1", label: "PP LAPI1", colorLight: "#32cd32", colorDark: "#00ff00" },
];

// Parameter listrik instan (data_format_0..3) - BUKAN totalizer, jadi
// dianalisa pakai AVG/MAX/MIN per periode (bukan delta kayak Total Energy).
// Tambah entry di sini kalau nanti ada parameter baru, harus sinkron sama
// key di response backend (voltage/current/power/frequency).
const PARAMS = [
  { key: "voltage", label: "Tegangan L-N", unit: "V", colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "current", label: "Arus", unit: "A", colorLight: "#32cd32", colorDark: "#00ff00" },
  { key: "power", label: "Daya", unit: "kW", colorLight: "#ff8c00", colorDark: "#ffa500" },
  { key: "frequency", label: "Frekuensi", unit: "Hz", colorLight: "#a855f7", colorDark: "#c084fc" },
];

// ════════════════════════════════════════════════════════════════════════
// TAB 1 - TOTAL ENERGY (Wh/kWh/MWh), totalizer delta per periode
// ════════════════════════════════════════════════════════════════════════
function TotalEnergyPanel() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // [{ id, label, value }] - hasil delta totalizer per periode, dalam Wh
  // (satuan mentah dari backend), HANYA buat meter yang lagi dipilih.
  const [mergedData, setMergedData] = useState([]);

  // Meter yang lagi ditampilkan di grafik & tabel.
  const [selectedMeterKey, setSelectedMeterKey] = useState(METERS[0].key);
  // Satuan tampilan: wh / kwh / mwh - checkbox exclusive (mirip radio),
  // gak ngubah data yang di-fetch, cuma ngonversi tampilan value-nya.
  const [unitKey, setUnitKey] = useState("wh");
  // Toggle garis rata-rata di grafik.
  const [showAverageLine, setShowAverageLine] = useState(true);

  // Nandain udah pernah submit valid sekali - dipakai buat auto re-fetch
  // pas dropdown meter diganti, tanpa nembak API pas awal mount.
  const hasFetchedRef = useRef(false);

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
    if (!rows || rows.length === 0) return { avg: 0, max: 0, min: 0, total: 0 };
    const vals = rows.map((r) => Number(r[key]) || 0);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    return { avg, max, min, total: sum };
  };

  const selectedMeter = METERS.find((m) => m.key === selectedMeterKey) || METERS[0];
  const selectedUnit = UNITS[unitKey] || UNITS.wh;

  // Data mentah (Wh) dikonversi ke satuan yang lagi dipilih (Wh/kWh/MWh) -
  // dipakai buat chart, tabel, dan PDF export. mergedData sendiri TETAP Wh,
  // biar ganti checkbox satuan gak perlu fetch ulang ke backend.
  const displayData = useMemo(
    () =>
      mergedData.map((r) => ({
        ...r,
        value: Number((Number(r.value) * selectedUnit.factor).toFixed(selectedUnit.decimals)),
      })),
    [mergedData, selectedUnit]
  );

  // Garis fluktuatif: dari displayData (udah dikonversi ke satuan terpilih).
  const selectedChartData = useMemo(
    () => displayData.map((r, idx) => ({ x: idx, y: Number(r.value) || 0, label: r.label })),
    [displayData]
  );

  // Avg/Max/Min/Total dihitung dari data mentah (Wh) dulu baru dikonversi -
  // biar gak numpuk pembulatan ganda (per-baris lalu dijumlah lagi).
  const rawStats = useMemo(() => calcStats(mergedData, "value"), [mergedData]);
  const selectedStats = useMemo(() => {
    const f = selectedUnit.factor;
    const d = selectedUnit.decimals;
    return {
      avg: Number((rawStats.avg * f).toFixed(d)),
      max: Number((rawStats.max * f).toFixed(d)),
      min: Number((rawStats.min * f).toFixed(d)),
      total: Number((rawStats.total * f).toFixed(d)),
    };
  }, [rawStats, selectedUnit]);

  // Garis rata-rata = GARIS LURUS di nilai selectedStats.avg, dibentang di
  // sepanjang sumbu-x yang sama kayak data fluktuatifnya.
  const avgChartData = useMemo(
    () => displayData.map((r, idx) => ({ x: idx, y: selectedStats.avg, label: r.label })),
    [displayData, selectedStats.avg]
  );

  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    hasFetchedRef.current = true; // dari sini, ganti dropdown meter auto re-fetch
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        "http://10.163.0.66:8002/part/getEnergyPowerHistorical",
        {
          params: {
            start: datePickerStart.replace("T", " "),
            finish: datePickerFinish.replace("T", " "),
            period: periodType,
            meter: selectedMeterKey, // backend cuma query 1 tabel sesuai ini
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

      await logAuditAction("VIEW_ENERGY_POWER", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area: selectedMeterKey,
      });
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

  // Ganti dropdown meter (PP UTY1 / PP LAPI1 / ...) -> tarik ulang data
  // KHUSUS meter itu aja, pakai start-finish yang sama kayak submit
  // terakhir. Gak jalan kalau belum pernah submit valid (hasFetchedRef).
  useEffect(() => {
    if (hasFetchedRef.current) {
      getSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterKey]);

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
      Math.min(prev + 1, Math.max(Math.ceil(displayData.length / rowsPerPage), 1))
    );
  };

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleData = displayData.slice(startIndex, startIndex + rowsPerPage);

    if (displayData.length === 0) {
      return (
        <Tr>
          <Td colSpan={3} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        <Td>{row.value}</Td>
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

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      { header: `${selectedMeter.label} (${selectedUnit.label})`, dataKey: "value" },
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
    doc.text(`Summary - ${PERIOD_LABELS[periodType]} (${selectedMeter.label} - ${selectedUnit.label})`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["", `${selectedMeter.label} (${selectedUnit.label})`]],
      body: [
        ["Total", String(selectedStats.total)],
        ["Avg", String(selectedStats.avg)],
        ["Max", String(selectedStats.max)],
        ["Min", String(selectedStats.min)],
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
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100], cellWidth: 45 },
        1: { textColor: [0, 0, 139], cellWidth: 60 },
      },
      theme: "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;

    autoTable(doc, {
      columns,
      body: displayData,
      startY: summaryFinalY + 5,
      margin: { top: 35, bottom: 20 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Energy Power (${PERIOD_LABELS[periodType]} - ${selectedMeter.label} - ${selectedUnit.label}) - ${formattedDateTime} - ${userGlobal.username}`,
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

    doc.save(`table-data-EnergyPower-${selectedMeter.label.replace(/\s+/g, "")}-${selectedUnit.label}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area: selectedMeterKey,
    });
  };

  // 1 chart, isinya garis meter yang lagi dipilih (satuan sesuai checkbox
  // Wh/kWh/MWh) + garis rata-rata (opsional, ngikutin checkbox showAverageLine).
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
        name: "Rata-rata",
        showInLegend: true,
        xValueFormatString: "",
        yValueFormatString: "",
        color: avgColor,
        lineColor: avgColor,
        lineDashType: "dash",
        markerSize: 0,
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
        text: `Total Energy - ${selectedMeter.label}`,
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `${PERIOD_LABELS[periodType]} (${selectedUnit.label})`,
          fontColor: isDarkMode ? "white" : "black",
        },
      ],
      axisY: {
        title: `Energi (${selectedUnit.label})`,
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
  }, [selectedMeter, selectedChartData, avgChartData, showAverageLine, isDarkMode, periodType, selectedUnit]);

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

      {/* Checkbox pilih satuan tampilan - Wh / kWh / MWh. Exclusive (mirip
          radio): pilih satu otomatis lepas yang lain, gak bisa kosong. */}
      <div className="flex justify-center gap-6 mt-2">
        <Checkbox
          isChecked={unitKey === "wh"}
          onChange={() => setUnitKey("wh")}
          colorScheme="blue"
        >
          <span className="text-text">Wh</span>
        </Checkbox>
        <Checkbox
          isChecked={unitKey === "kwh"}
          onChange={() => setUnitKey("kwh")}
          colorScheme="blue"
        >
          <span className="text-text">kWh</span>
        </Checkbox>
        <Checkbox
          isChecked={unitKey === "mwh"}
          onChange={() => setUnitKey("mwh")}
          colorScheme="blue"
        >
          <span className="text-text">MWh</span>
        </Checkbox>
      </div>

      {/* Checkbox toggle garis rata-rata di grafik */}
      <div className="flex justify-center mt-2">
        <Checkbox
          isChecked={showAverageLine}
          onChange={(e) => setShowAverageLine(e.target.checked)}
          colorScheme="orange"
        >
          <span className="text-text">Averages</span>
        </Checkbox>
      </div>

      {/* 1 chart: garis meter yang dipilih + garis rata-rata (opsional) */}
      <div className="my-4 mx-4">{renderChart()}</div>

      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={4} align="center">
        <div className="mt-3">
          <div className="ml-16 text-text font-semibold">Total {selectedMeter.label} = {selectedStats.total.toLocaleString()} {selectedUnit.label}</div>
          <div className="ml-16 text-text">Avg {selectedMeter.label} = {selectedStats.avg.toLocaleString()} {selectedUnit.label}</div>
          <div className="ml-16 text-text">Max {selectedMeter.label} = {selectedStats.max.toLocaleString()} {selectedUnit.label}</div>
          <div className="ml-16 text-text">Min {selectedMeter.label} = {selectedStats.min.toLocaleString()} {selectedUnit.label}</div>
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
              <TableCaption sx={{ color: tulisanColor }}>Energy Power - {selectedMeter.label}</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  <Th sx={{ color: tulisanColor }}>{selectedMeter.label} ({selectedUnit.label})</Th>
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
          Page {currentPage} of {Math.max(Math.ceil(displayData.length / rowsPerPage), 1)}
        </span>
        <Button
          onClick={handleNextPage}
          isDisabled={currentPage === Math.max(Math.ceil(displayData.length / rowsPerPage), 1)}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB 2 - ANALISA PARAMETER LISTRIK (Voltage L-N, Current, Power, Frequency)
// Beda karakteristik sama Total Energy: ini bacaan INSTAN (bukan totalizer),
// jadi dianalisa pakai AVG/MAX/MIN per periode (dihitung langsung di SQL,
// lihat getEnergyPowerParameters di databaseControllers.js), bukan delta.
// Ditampilkan 4 mini-chart terpisah (skala V/A/kW/Hz beda jauh, gak masuk
// akal digabung 1 sumbu-Y) dengan band Max/Avg/Min biar kelihatan kalau ada
// tegangan drop atau lonjakan arus/daya di rentang tanggal yang dipilih.
// ════════════════════════════════════════════════════════════════════════
function ParameterAnalysisPanel() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // [{ id, label, voltage:{avg,max,min}, current:{...}, power:{...}, frequency:{...} }]
  const [parameterData, setParameterData] = useState([]);

  const [selectedMeterKey, setSelectedMeterKey] = useState(METERS[0].key);

  const hasFetchedRef = useRef(false);

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

  const selectedMeter = METERS.find((m) => m.key === selectedMeterKey) || METERS[0];

  // Statistik keseluruhan rentang Start-Finish yang lagi ditarik, per
  // parameter. avg = rata-rata dari avg per-bucket (bukan di-weight per
  // jumlah sample tiap bucket - cukup akurat buat kebutuhan monitoring ini).
  // max/min = ekstrem dari max/min tiap bucket sepanjang rentang tsb.
  const paramStats = useMemo(() => {
    const stats = {};
    PARAMS.forEach((p) => {
      const avgs = parameterData.map((r) => r[p.key]?.avg).filter((v) => v !== null && v !== undefined);
      const maxs = parameterData.map((r) => r[p.key]?.max).filter((v) => v !== null && v !== undefined);
      const mins = parameterData.map((r) => r[p.key]?.min).filter((v) => v !== null && v !== undefined);
      stats[p.key] = {
        avg: avgs.length ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2)) : 0,
        max: maxs.length ? Number(Math.max(...maxs).toFixed(2)) : 0,
        min: mins.length ? Number(Math.min(...mins).toFixed(2)) : 0,
      };
    });
    return stats;
  }, [parameterData]);

  // Chart per parameter: 3 garis (Max putus-putus, Avg garis solid berwarna,
  // Min putus-putus) - dibangun ulang tiap parameterData/isDarkMode/periodType
  // berubah.
  const chartOptionsByParam = useMemo(() => {
    const opts = {};
    const bandColor = isDarkMode ? "#8a8a8a" : "#9a9a9a";

    PARAMS.forEach((p) => {
      const color = isDarkMode ? p.colorDark : p.colorLight;
      const avgPoints = parameterData.map((r, idx) => ({ x: idx, y: r[p.key]?.avg ?? null, label: r.label }));
      const maxPoints = parameterData.map((r, idx) => ({ x: idx, y: r[p.key]?.max ?? null, label: r.label }));
      const minPoints = parameterData.map((r, idx) => ({ x: idx, y: r[p.key]?.min ?? null, label: r.label }));

      opts[p.key] = {
        zoomEnabled: true,
        theme: isDarkMode ? "dark2" : "light2",
        backgroundColor: isDarkMode ? "#171717" : "#ffffff",
        Margin: 8,
        title: {
          text: `${p.label} (${p.unit})`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 14,
        },
        subtitles: [
          {
            text: `${selectedMeter.label} - ${PERIOD_LABELS[periodType]}`,
            fontColor: isDarkMode ? "white" : "black",
            fontSize: 10,
          },
        ],
        axisY: {
          title: p.unit,
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
        legend: {
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 10,
        },
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
            dataPoints: maxPoints,
          },
          {
            type: "line",
            name: p.label,
            showInLegend: true,
            color,
            lineColor: color,
            markerColor: color,
            dataPoints: avgPoints,
          },
          {
            type: "line",
            name: "Min",
            showInLegend: true,
            color: bandColor,
            lineColor: bandColor,
            lineDashType: "dot",
            markerSize: 0,
            dataPoints: minPoints,
          },
        ],
      };
    });

    return opts;
  }, [parameterData, isDarkMode, periodType, selectedMeter]);

  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    hasFetchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        "http://10.163.0.66:8002/part/getEnergyPowerParameters",
        {
          params: {
            start: datePickerStart.replace("T", " "),
            finish: datePickerFinish.replace("T", " "),
            period: periodType,
            meter: selectedMeterKey,
          },
        }
      );

      const rows = response.data.data || [];
      setParameterData(rows);
      setCurrentPage(1);
      setIsTableVisible(true);

      if (rows.length === 0) {
        setError("Tidak ada data pada rentang tanggal ini");
      }

      await logAuditAction("VIEW_ENERGY_POWER_PARAMETERS", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area: selectedMeterKey,
      });
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

  // Ganti dropdown meter -> tarik ulang data khusus meter itu, pakai
  // start-finish yang sama kayak submit terakhir.
  useEffect(() => {
    if (hasFetchedRef.current) {
      getSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterKey]);

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
      Math.min(prev + 1, Math.max(Math.ceil(parameterData.length / rowsPerPage), 1))
    );
  };

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleData = parameterData.slice(startIndex, startIndex + rowsPerPage);

    if (parameterData.length === 0) {
      return (
        <Tr>
          <Td colSpan={6} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        <Td>{row.voltage?.avg ?? "-"}</Td>
        <Td>{row.current?.avg ?? "-"}</Td>
        <Td>{row.power?.avg ?? "-"}</Td>
        <Td>{row.frequency?.avg ?? "-"}</Td>
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

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      { header: "Tegangan (V)", dataKey: "voltageAvg" },
      { header: "Arus (A)", dataKey: "currentAvg" },
      { header: "Daya (kW)", dataKey: "powerAvg" },
      { header: "Frekuensi (Hz)", dataKey: "freqAvg" },
    ];

    const bodyRows = parameterData.map((r) => ({
      id: r.id,
      label: r.label,
      voltageAvg: r.voltage?.avg ?? "-",
      currentAvg: r.current?.avg ?? "-",
      powerAvg: r.power?.avg ?? "-",
      freqAvg: r.frequency?.avg ?? "-",
    }));

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
      head: [["Parameter", "Avg", "Max", "Min"]],
      body: PARAMS.map((p) => [
        `${p.label} (${p.unit})`,
        String(paramStats[p.key]?.avg ?? 0),
        String(paramStats[p.key]?.max ?? 0),
        String(paramStats[p.key]?.min ?? 0),
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
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100], cellWidth: 45 },
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
        doc.text(
          `Generated by EMS System - Power Parameters (${PERIOD_LABELS[periodType]} - ${selectedMeter.label}) - ${formattedDateTime} - ${userGlobal.username}`,
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

    doc.save(`table-data-EnergyPowerParams-${selectedMeter.label.replace(/\s+/g, "")}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area: selectedMeterKey,
    });
  };

  const renderParamCharts = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4 mx-4">
      {PARAMS.map((p) => (
        <div key={p.key} className="w-full bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="lg" />
            </div>
          ) : error && parameterData.length === 0 ? (
            <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
          ) : (
            <CanvasJSChart options={chartOptionsByParam[p.key]} />
          )}
        </div>
      ))}
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

      {/* 4 mini-chart: Tegangan L-N, Arus, Daya, Frekuensi - masing-masing
          pakai band Max (putus-putus atas) / Avg (garis solid) / Min
          (putus-putus bawah) biar kelihatan sebaran & ekstrem tiap periode. */}
      {renderParamCharts()}

      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={8} align="start">
        {PARAMS.map((p) => (
          <div key={p.key} className="mt-3">
            <div className="text-text font-semibold">{p.label} ({p.unit})</div>
            <div className="text-text">Avg = {(paramStats[p.key]?.avg ?? 0).toLocaleString()} {p.unit}</div>
            <div className="text-text">Max = {(paramStats[p.key]?.max ?? 0).toLocaleString()} {p.unit}</div>
            <div className="text-text">Min = {(paramStats[p.key]?.min ?? 0).toLocaleString()} {p.unit}</div>
          </div>
        ))}
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
              <TableCaption sx={{ color: tulisanColor }}>Parameter Listrik - {selectedMeter.label}</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  <Th sx={{ color: tulisanColor }}>Tegangan (V)</Th>
                  <Th sx={{ color: tulisanColor }}>Arus (A)</Th>
                  <Th sx={{ color: tulisanColor }}>Daya (kW)</Th>
                  <Th sx={{ color: tulisanColor }}>Frekuensi (Hz)</Th>
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
          Page {currentPage} of {Math.max(Math.ceil(parameterData.length / rowsPerPage), 1)}
        </span>
        <Button
          onClick={handleNextPage}
          isDisabled={currentPage === Math.max(Math.ceil(parameterData.length / rowsPerPage), 1)}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Wrapper - Tabs biar gak perlu daftar halaman baru di pagesConfig.js,
// cukup 1 entry "Energy Power" yang isinya 2 tab.
// ════════════════════════════════════════════════════════════════════════
function EnergyPower() {
  return (
    <div>
      <Tabs variant="enclosed" colorScheme="blue" isFitted>
        <TabList className="w-full lg:w-1/2" display="flex">
          <Tab>Total Energy</Tab>
          <Tab>Analisa Parameter Listrik</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <TotalEnergyPanel />
          </TabPanel>
          <TabPanel px={0}>
            <ParameterAnalysisPanel />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}

export default EnergyPower;