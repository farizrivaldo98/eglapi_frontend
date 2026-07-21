import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
  import {
    Box,
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
  import { logAuditAction } from "../features/part/userSlice";  // ← TAMBAHAN
  import logo from "../assets/logolapi.png";
  var CanvasJS = CanvasJSReact.CanvasJS;
  var CanvasJSChart = CanvasJSReact.CanvasJSChart;


  
  function Utility() {
    const [groupedAreaData, setGroupedAreaData] = useState([]); // [{ ahu, rooms: [tableName,...] }]
    const [allDataTable, setAllDataTable] = useState([]);
    const [tempChartData, setTempChartData] = useState([]);
    const [dpChartData, setDpChartData] = useState([]);
    const [rhChartData, setRhChartData] = useState([]);
    const [areaPicker, setAreaPicker] = useState();
    // ── TAMBAHAN: searchable Area dropdown ──
    const [areaSearchTerm, setAreaSearchTerm] = useState("");
    const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
    const [areaHighlightIndex, setAreaHighlightIndex] = useState(-1);
    const areaDropdownRef = useRef(null);
    // ─────────────────────────────────────────
    const [datePickerStart, setDatePickerStart] = useState();
    const [datePickerFinish, setDatePickerFinish] = useState();
    const [intervalMinutes, setIntervalMinutes] = useState(1); // interval averaging (menit), 1-60
    const [maxSuhu, setmaxSuhu] = useState([]);
    const [minSuhu, setminSuhu] = useState([]);
    const [avgSuhu, setavgSuhu] = useState([]);
    const [maxRH, setmaxRH] = useState([]);
    const [minRH, setminRH] = useState([]);
    const [avgRH, setavgRH] = useState([]);
    const [maxDP, setmaxDP] = useState([]);
    const [minDP, setminDP] = useState([]);
    const [avgDP, setavgDP] = useState([]);
    const [Name, setName] = useState();
    const [state, setState] = useState(true);
    const ComponentPDF = useRef();

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
      const fetchGroupedArea = async () => {
        try {
          let response = await axios.get(
            "http://10.163.0.66:8002/part/getAreaGroupedByAhu"
          );
          setGroupedAreaData(response.data);
        } catch (err) {
          console.error("Gagal mengambil data area per AHU", err);
        }
      };
      fetchGroupedArea();
    }, []);

    // ── TAMBAHAN: list area dikelompokkan per AHU + filter pencarian (case-insensitive) ──
    const cleanRoomName = (tableName) =>
      tableName.replace("cMT-C21B_", "").replace("_data", "");

    const groupedAreaOptions = groupedAreaData.map((group) => ({
      ahu: group.ahu,
      rooms: group.rooms.map((tableName) => ({
        tableName,
        cleanedName: cleanRoomName(tableName),
      })),
    }));

    // filter di dalam tiap grup, grup yang hasilnya kosong disembunyikan
    const filteredGroupedAreaOptions = groupedAreaOptions
      .map((group) => ({
        ahu: group.ahu,
        rooms: group.rooms.filter((item) =>
          item.cleanedName.toLowerCase().includes(areaSearchTerm.toLowerCase())
        ),
      }))
      .filter((group) => group.rooms.length > 0);

    // versi flat (tanpa header AHU) buat keyboard navigation, urutannya sama
    // persis kayak urutan render supaya index-nya nyambung
    const flatFilteredAreaItems = filteredGroupedAreaOptions.flatMap(
      (group) => group.rooms
    );

    const handleAreaSearchChange = (e) => {
      setAreaSearchTerm(e.target.value);
      setIsAreaDropdownOpen(true);
      setAreaHighlightIndex(-1);
      // area belum valid sampai user benar-benar pilih dari list
      setAreaPicker(undefined);
    };

    const handleAreaSelect = (tableName, cleanedName) => {
      setAreaPicker(tableName);
      setAreaSearchTerm(cleanedName);
      setIsAreaDropdownOpen(false);
      setAreaHighlightIndex(-1);
    };

    const handleAreaKeyDown = (e) => {
      if (!isAreaDropdownOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        setIsAreaDropdownOpen(true);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAreaHighlightIndex((prev) => Math.min(prev + 1, flatFilteredAreaItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAreaHighlightIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatFilteredAreaItems[areaHighlightIndex];
        if (item) handleAreaSelect(item.tableName, item.cleanedName);
      } else if (e.key === "Escape") {
        setIsAreaDropdownOpen(false);
      }
    };

    // tutup dropdown kalau klik di luar
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target)) {
          setIsAreaDropdownOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    // ─────────────────────────────────────────────────────────────

    // ── Interval averaging helpers ──────────────────────────────────────────
    // Data mentah dari DB per 1 menit, sudah terurut waktu ascending dari backend.
    // Kalau interval > 1 menit, tinggal kelompokkan tiap N baris berurutan lalu
    // di-average. Ini sengaja TIDAK parsing/convert tanggal (x atau date) sama
    // sekali, karena format x di getTempChart beda dengan format date di
    // getAllDataEMS dan nggak semuanya valid di-parse new Date() -> makanya
    // kemarin chart cuma nyisa 1 titik (titik lain gagal parse & ke-skip).
    // x/date hasil average diambil apa adanya dari baris pertama tiap grup.

    // dataset {x, y} dari getTempChart (format 0/1/2) -> average tiap N baris
    const aggregateChartData = (data, intervalMin) => {
      if (!Array.isArray(data) || data.length === 0) return data;
      if (intervalMin <= 1) {
        // interval 1 menit = data asli, cuma dibulatin 2 desimal (sama kayak behavior sebelumnya)
        return data.map((d) => ({ ...d, y: Number(d.y.toFixed(2)) }));
      }

      const result = [];
      for (let i = 0; i < data.length; i += intervalMin) {
        const chunk = data.slice(i, i + intervalMin);
        const sum = chunk.reduce((acc, d) => acc + (Number(d.y) || 0), 0);
        result.push({
          x: chunk[0].x, // ambil x baris pertama di grup, apa adanya
          y: Number((sum / chunk.length).toFixed(2)),
        });
      }
      return result;
    };

    // dataset tabel {id, date, temp, RH, DP} dari getAllDataEMS -> average tiap N baris
    const aggregateTableData = (data, intervalMin) => {
      if (!Array.isArray(data) || data.length === 0 || intervalMin <= 1) return data;

      const result = [];
      let idCounter = 1;
      for (let i = 0; i < data.length; i += intervalMin) {
        const chunk = data.slice(i, i + intervalMin);
        const sumTemp = chunk.reduce((acc, r) => acc + (Number(r.temp) || 0), 0);
        const sumRH = chunk.reduce((acc, r) => acc + (Number(r.RH) || 0), 0);
        const sumDP = chunk.reduce((acc, r) => acc + (Number(r.DP) || 0), 0);
        result.push({
          id: idCounter++,
          date: chunk[0].date, // ambil date baris pertama di grup, apa adanya
          temp: Number((sumTemp / chunk.length).toFixed(2)),
          RH: Number((sumRH / chunk.length).toFixed(2)),
          DP: Number((sumDP / chunk.length).toFixed(2)),
        });
      }
      return result;
    };
    // ─────────────────────────────────────────────────────────────────────────

    // ── DIMODIFIKASI: tambah logAuditAction setelah fetch berhasil ──
    const getSubmit = async () => {
      setLoading(true);
      setError(null);

      try {
        const response1 = await axios.get(
          "http://10.163.0.66:8002/part/getTempChart",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.replace('T', ' '),
              finish: datePickerFinish.replace('T', ' '),
              format: 0,
            },
          }
        );
        const response2 = await axios.get(
          "http://10.163.0.66:8002/part/getTempChart",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.replace('T', ' '),
              finish: datePickerFinish.replace('T', ' '),
              format: 1,
            },
          }
        );
        const response3 = await axios.get(
          "http://10.163.0.66:8002/part/getTempChart",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.replace('T', ' '),
              finish: datePickerFinish.replace('T', ' '),
              format: 2,
            },
          }
        );
        const response4 = await axios.get(
          "http://10.163.0.66:8002/part/getAllDataEMS",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.replace('T', ' '),
              finish: datePickerFinish.replace('T', ' '),
            },
          }
        );

        // interval dipakai apa adanya dari state input (sudah dilimit 1-60 di handler),
        // fallback ke 1 kalau kosong/invalid saat submit ditekan
        let usedInterval = parseInt(intervalMinutes, 10);
        if (isNaN(usedInterval) || usedInterval < 1) usedInterval = 1;
        if (usedInterval > 60) usedInterval = 60;

        setTempChartData(aggregateChartData(response1.data, usedInterval));
        setRhChartData(aggregateChartData(response2.data, usedInterval));
        setDpChartData(aggregateChartData(response3.data, usedInterval));
        setAllDataTable(aggregateTableData(response4.data, usedInterval));
        setIsTableVisible(true);

        if (
          response1.data.length !== 0 &&
          response2.data.length !== 0 &&
          response3.data.length !== 0 &&
          response4.data.length !== 0
        ) {
          setState(false);
        } else {
          setState(true);
        }

        const maxSuhu = response1.data.reduce((acc, data) => Math.max(acc, data.y), Number.NEGATIVE_INFINITY);
        setmaxSuhu(Number(maxSuhu.toFixed(2)));
        const minSuhu = Math.min(...response1.data.map((data) => data.y));
        setminSuhu(Number(minSuhu.toFixed(2)));
        const totalSuhu = response1.data.reduce((sum, data) => sum + data.y, 0);
        const averageSuhu = totalSuhu / response1.data.length;
        setavgSuhu(Number(averageSuhu.toFixed(2)));

        const maxRH = response2.data.reduce((acc, data) => Math.max(acc, data.y), Number.NEGATIVE_INFINITY);
        setmaxRH(Number(maxRH.toFixed(2)));
        const minRH = Math.min(...response2.data.map((data) => data.y));
        setminRH(Number(minRH.toFixed(2)));
        const totalRH = response2.data.reduce((sum, data) => sum + data.y, 0);
        const averageRH = totalRH / response1.data.length;
        setavgRH(Number(averageRH.toFixed(2)));

        const maxDP = response3.data.reduce((acc, data) => Math.max(acc, data.y), Number.NEGATIVE_INFINITY);
        setmaxDP(Number(maxDP.toFixed(2)));
        const minDP = Math.min(...response3.data.map((data) => data.y));
        setminDP(Number(minDP.toFixed(2)));
        const totalDP = response3.data.reduce((sum, data) => sum + data.y, 0);
        const averageDP = totalDP / response3.data.length;
        setavgDP(Number(averageDP.toFixed(2)));

        const areaname = areaPicker
          .replace("cMT-C21B_", "")
          .replace("_data", "");
        setName(areaname);

        // ── AUDIT: catat VIEW_UTILITY ─────────────────────────
        await logAuditAction("VIEW_UTILITY", {
          area:     areaPicker,
          start:    datePickerStart,
          finish:   datePickerFinish,
          interval: usedInterval,
        });
        // ──────────────────────────────────────────────────────

      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to fetch data. Please try again.");
      } finally {
        const delay = 2000;
        setTimeout(() => {
          setLoading(false);
          console.log("Finished fetching data, stopping spinner...");
        }, delay);
      }
    };
    // ────────────────────────────────────────────────────────────

    const handlePrevPage = () => {
      setCurrentPage((prev) => Math.max(prev - 1, 1));
    };

    const handleNextPage = () => {
      setCurrentPage((prev) =>
        Math.min(prev + 1, Math.ceil(allDataTable.length / rowsPerPage))
      );
    };

    const renderTable = () => {
      const startIndex = (currentPage - 1) * rowsPerPage;
      const visibleData = allDataTable.slice(startIndex, startIndex + rowsPerPage);

      if (allDataTable.length === 0) {
        return (
          <Tr>
            <Td colSpan={5} textAlign="center" display="table-cell">
              No data available
            </Td>
          </Tr>
        );
      }

      return visibleData.map((data, index) => (
        <Tr key={index}>
          <Td>{data.id}</Td>
          <Td>{data.date}</Td>
          <Td>{data.temp}</Td>
          <Td>{data.RH}</Td>
          <Td>{data.DP}</Td>
        </Tr>
      ));
    };


// ── DIMODIFIKASI: tambah logAuditAction setelah export ──
const exportToPDF = async () => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Memakai {p} agar alignment "Page 1 of..." tidak nyangkut (seperti perbaikan sebelumnya)
  const totalPagesExp = "{p}"; 

  // 🗓️ Mengambil data tanggal dan waktu saat ini
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const formattedDateTime = `${day}/${month}/${year} ${hours}:${minutes}`;
  const fileSuffix = `${year}${month}${day}_${hours}${minutes}`;

  // ✅ WAJIB ADA
  const columns = [
    { header: "ID", dataKey: "id" },
    { header: "Date", dataKey: "date" },
    { header: "Temp", dataKey: "temp" },
    { header: "RH", dataKey: "RH" },
    { header: "DP", dataKey: "DP" },
  ];

  const drawHeader = () => {
    // Logo perusahaan asli (Kiri atas)
    doc.addImage(logo, "JPEG", 10, 8, 25, 12);

    // 1. Nama Perusahaan (Lebih besar)
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold"); 
    doc.text("PT LAPI LABORATORIES", pageWidth / 2, 13, {
      align: "center",
    });

    // 2. Alamat Perusahaan (Ukuran kecil)
    doc.setFontSize(6); 
    doc.setFont("helvetica", "normal"); 
    doc.text(
      "Jl. Kawasan Industri Modern Kav. 18, Industrial Estate, Cikande, Nambo Ilir, Serang, Kabupaten Serang, Banten 42186",
      pageWidth / 2,
      19.5, 
      { align: "center" }
    );

    // 3. Kontak (Telepon, Fax, Web)
    doc.text(
      "Phone: (0254) 402150, Fax (0254)402151, Homepage: www.lapilaboratories.com",
      pageWidth / 2,
      22, 
      { align: "center" }
    );

    // Garis pembatas
    doc.line(10, 27, pageWidth - 10, 27);
  };

  // ── HALAMAN PERTAMA: Gambar header & tabel summary sekali saja ──────────
  drawHeader();

  // Label "Summary"
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Summary", 14, 32);
  doc.setFont("helvetica", "normal");

  // Tabel Summary — hanya muncul di halaman pertama
  autoTable(doc, {
    head: [["", "Suhu (°C)", "RH (%)", "DP (Pa)"]],
    body: [
      ["Avg", String(avgSuhu), String(avgRH), String(avgDP)],
      ["Max", String(maxSuhu), String(maxRH), String(maxDP)],
      ["Min", String(minSuhu), String(minRH), String(minDP)],
    ],
    startY: 34,
    margin: { left: 10, right: 10 },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      halign: "center",
    },
    headStyles: {
      fillColor: [52, 144, 220],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    columnStyles: {
      // Lebar total usable: 210 - 10 (left) - 10 (right) = 190mm
      // Kolom label: 25mm | Tiap kolom data: (190-25)/3 = 55mm → total 190mm
      0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100], cellWidth: 25 },
      1: { textColor: [0, 0, 139], cellWidth: 55 },
      2: { textColor: [0, 0, 139], cellWidth: 55 },
      3: { textColor: [0, 0, 139], cellWidth: 55 },
    },
    theme: "grid",
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.1,
  });

  const summaryFinalY = doc.lastAutoTable.finalY;
  // ────────────────────────────────────────────────────────────────────────

  autoTable(doc, {
    columns,
    body: allDataTable,
    startY: summaryFinalY + 5, // mulai tepat di bawah tabel summary
    margin: { top: 35, bottom: 20 },

    didDrawPage: (data) => {
      const pageHeight = doc.internal.pageSize.height;
      const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;

      // ── MENGGAMBAR WATERMARK DI TENGAH HALAMAN ──
      
      // 1. Set transparansi (0.15 = sangat tipis/pudar)
      doc.setGState(new doc.GState({ opacity: 0.15 }));

      // Ukuran watermark (Diperbesar dari logo asli agar proporsinya tetap 25:12)
      const wmWidth = 160;
      const wmHeight = 80; 
      const xPos = 70;      // Geser ke kanan (+) atau kiri (-)
      const yPos = 150;     // Geser ke bawah (+) atau atas (-)
      // 2. Sisipkan logo Lapi di posisi tengah halaman dengan kemiringan 45 derajat
      doc.addImage({
        imageData: logo,
        format: "JPEG",
        x: xPos , // Otomatis center horizontal
        y: yPos , // Otomatis center vertikal
        w: wmWidth,
        h: wmHeight,
        angle: 45 // <-- Angka kemiringan (Bisa diubah jadi -45 jika ingin arah sebaliknya)
      });

      // 3. KEMBALIKAN transparansi ke 1.0 (Normal) agar teks header/tabel tidak ikut memudar!
      doc.setGState(new doc.GState({ opacity: 1.0 }));
      
      // ────────────────────────────────────────────

      // Header: halaman 1 sudah digambar manual sebelum summary,
      // jadi cukup gambar ulang mulai halaman 2 ke atas
      if (currentDocPage > 1) {
        drawHeader();
      }

      doc.setFontSize(9);
      doc.text(`Generated by EMS System - Area ${Name} - ${formattedDateTime} - ${userGlobal.username}`, 14, pageHeight - 10);

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

  doc.save(`table-data-EMS-${fileSuffix}.pdf`);

        await logAuditAction("EXPORT_PDF", {
          area:   areaPicker,
          start:  datePickerStart,
          finish: datePickerFinish,
        });
};
// ────────────────────────────────────────────────────────

    const datePickStart = (e) => {
      var dataInput = e.target.value;
      setDatePickerStart(dataInput);
      console.log(dataInput);
    };
    const datePickFinish = (e) => {
      var dataInput = e.target.value;
      setDatePickerFinish(dataInput);
      console.log(dataInput);
    };

    // ── Interval averaging: bebas diketik, dilimit max 60 realtime, min 1 saat blur ──
    const handleIntervalChange = (e) => {
      const raw = e.target.value;
      if (raw === "") {
        setIntervalMinutes(""); // biar bisa dihapus dulu sebelum ngetik ulang
        return;
      }
      let val = parseInt(raw, 10);
      if (isNaN(val)) return;
      if (val > 60) val = 60;
      setIntervalMinutes(val);
    };

    const handleIntervalBlur = () => {
      let val = parseInt(intervalMinutes, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 60) val = 60;
      setIntervalMinutes(val);
    };
    // ──────────────────────────────────────────────────────────────────────────────

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

    const options = {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      Margin: 8,
      title: {
        text: "Environment Room",
        fontColor: isDarkMode ? "white" : "black",
      },
      subtitles: [
        {
          text: "Enviroment Management System",
          fontColor: isDarkMode ? "white" : "black",
        },
      ],
      axisY: [
        {
          title: "Temp (°C)",
          titleFontColor: isDarkMode ? "#00bfff" : "#1e90ff",
          suffix: " °C",
          gridColor: isDarkMode ? "#444" : "#bfbfbf",
          labelFontColor: isDarkMode ? "#00bfff" : "#1e90ff",
          lineColor: isDarkMode ? "#00bfff" : "#1e90ff",
          tickColor: isDarkMode ? "#00bfff" : "#1e90ff",
          tickLength: 5,
          tickThickness: 2,
        },
        {
          title: "RH (%)",
          titleFontColor: isDarkMode ? "#ffa500" : "#ff4500",
          suffix: " %",
          gridColor: "transparent",
          labelFontColor: isDarkMode ? "#ffa500" : "#ff4500",
          lineColor: isDarkMode ? "#ffa500" : "#ff4500",
          tickColor: isDarkMode ? "#ffa500" : "#ff4500",
          tickLength: 5,
          tickThickness: 2,
        },
        {
          title: "DP (Pa)",
          titleFontColor: isDarkMode ? "#00ff00" : "#32cd32",
          suffix: " Pa",
          gridColor: "transparent",
          labelFontColor: isDarkMode ? "#00ff00" : "#32cd32",
          lineColor: isDarkMode ? "#00ff00" : "#32cd32",
          tickColor: isDarkMode ? "#00ff00" : "#32cd32",
          tickLength: 5,
          tickThickness: 2,
        },
      ],
      axisX: {
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        tickLength: 5,
        tickThickness: 2,
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      toolTip: { shared: true },
      data: [
        {
          type: "line",
          name: "Temperature",
          axisYIndex: 0,
          showInLegend: true,
          xValueFormatString: "",
          yValueFormatString: "",
          lineColor: isDarkMode ? "#00bfff" : "#1e90ff",
          color: isDarkMode ? "#00bfff" : "#1e90ff",
          markerColor: isDarkMode ? "#00bfff" : "#1e90ff",
          dataPoints: tempChartData,
        },
        {
          type: "line",
          name: "RH",
          axisYIndex: 1,
          showInLegend: true,
          xValueFormatString: "",
          yValueFormatString: "",
          color: isDarkMode ? "#ffa500" : "#ff4500",
          lineColor: isDarkMode ? "#ffa500" : "#ff4500",
          markerColor: isDarkMode ? "#ffa500" : "#ff4500",
          dataPoints: rhChartData,
        },
        {
          type: "line",
          name: "DP",
          axisYIndex: 2,
          showInLegend: true,
          xValueFormatString: "",
          yValueFormatString: "",
          lineColor: isDarkMode ? "#00ff00" : "#32cd32",
          color: isDarkMode ? "#00ff00" : "#32cd32",
          markerColor: isDarkMode ? "#00ff00" : "#32cd32",
          dataPoints: dpChartData,
        },
      ],
    };

    return (
      <div>
        <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
          <div className="w-96 ml-4" style={{ position: "relative" }} ref={areaDropdownRef}>
            <h5 className="mb-1">Area</h5>
            <Input
              value={areaSearchTerm}
              onChange={handleAreaSearchChange}
              onFocus={() => setIsAreaDropdownOpen(true)}
              onKeyDown={handleAreaKeyDown}
              placeholder="Ruangan"
              size="md"
              autoComplete="off"
              sx={{
                border: "1px solid",
                borderColor: borderColor,
                borderRadius: "0.395rem",
                background: "var(--color-background)",
                _hover: { borderColor: hoverBorderColor },
              }}
            />
            {isAreaDropdownOpen && (
              <Box
                position="absolute"
                zIndex={10}
                mt={1}
                w="100%"
                maxH="300px"
                overflowY="auto"
                bg={isDarkMode ? "#1a202c" : "white"}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="0.395rem"
                boxShadow="md"
              >
                {filteredGroupedAreaOptions.length === 0 ? (
                  <Box px={3} py={2} sx={{ color: tulisanColor }}>
                    Tidak ditemukan
                  </Box>
                ) : (
                  (() => {
                    let flatIndex = -1; // urutan render harus sama persis kayak flatFilteredAreaItems
                    return filteredGroupedAreaOptions.map((group) => (
                      <Box key={group.ahu}>
                        <Box
                          px={3}
                          py={1}
                          fontSize="xs"
                          fontWeight="bold"
                          textTransform="uppercase"
                          letterSpacing="wide"
                          sx={{ color: tulisanColor }}
                          bg={isDarkMode ? "gray.900" : "gray.50"}
                          position="sticky"
                          top={0}
                          zIndex={1}
                        >
                          {group.ahu}
                        </Box>
                        {group.rooms.map((item) => {
                          flatIndex += 1;
                          const currentIndex = flatIndex;
                          return (
                            <Box
                              key={item.tableName}
                              pl={5}
                              pr={3}
                              py={2}
                              cursor="pointer"
                              sx={{ color: tulisanColor }}
                              bg={
                                currentIndex === areaHighlightIndex
                                  ? (isDarkMode ? "gray.700" : "gray.100")
                                  : areaPicker === item.tableName
                                  ? "blue.500"
                                  : "transparent"
                              }
                              _hover={{ bg: isDarkMode ? "gray.700" : "gray.100" }}
                              onMouseDown={() => handleAreaSelect(item.tableName, item.cleanedName)}
                              onMouseEnter={() => setAreaHighlightIndex(currentIndex)}
                            >
                              {item.cleanedName}
                            </Box>
                          );
                        })}
                      </Box>
                    ));
                  })()
                )}
              </Box>
            )}
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
          <div>
            <h5 className="mb-1"> Interval (menit) </h5>
            <Input
              onChange={handleIntervalChange}
              onBlur={handleIntervalBlur}
              value={intervalMinutes}
              placeholder="1"
              size="md"
              type="number"
              min={1}
              max={60}
              width="120px"
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
  <Button 
    onClick={exportToPDF} 
    colorScheme="red"
    isDisabled={userGlobal.level < 3}
  >
    Export to PDF
  </Button>
</div>
          </div>
        </div>

        <div className="block bg-card rounded-lg p-1 shadow-lg mx-auto overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center">
              <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
            </div>
          ) : error ? (
            <div className="text-red-500 flex flex-col items-center">
              No available data
            </div>
          ) : (
            <CanvasJSChart options={options} />
          )}
        </div>

        <Stack className="flex flex-row justify-center mb-4" direction="row" spacing={4} align="center">
          <div className="mt-3">
            <div className="ml-16 text-text">Avg Suhu = {avgSuhu.toLocaleString()} °C</div>
            <div className="ml-16 text-text">Max Suhu = {maxSuhu.toLocaleString()} °C</div>
            <div className="ml-16 text-text">Min Suhu = {minSuhu.toLocaleString()} °C</div>
          </div>
          <div className="mt-3">
            <div className="ml-16 text-text">Avg RH = {avgRH.toLocaleString()} %</div>
            <div className="ml-16 text-text">Max RH = {maxRH.toLocaleString()} %</div>
            <div className="ml-16 text-text">Min RH = {minRH.toLocaleString()} %</div>
          </div>
          <div className="mt-3">
            <div className="ml-16 text-text">Avg DP = {avgDP.toLocaleString()} Pa</div>
            <div className="ml-16 text-text">Max DP = {maxDP.toLocaleString()} Pa</div>
            <div className="ml-16 text-text">Min DP = {minDP.toLocaleString()} Pa</div>
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
                <TableCaption sx={{ color: tulisanColor }}>EMSe</TableCaption>
                <Thead>
                  <Tr>
                    <Th sx={{ color: tulisanColor }}>id</Th>
                    <Th sx={{ color: tulisanColor }}>Date Time</Th>
                    <Th sx={{ color: tulisanColor }}>Temperature</Th>
                    <Th sx={{ color: tulisanColor }}>Relative Humidity (RH)</Th>
                    <Th sx={{ color: tulisanColor }}>Differential Presure (DP)</Th>
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
            Page {currentPage} of {Math.ceil(allDataTable.length / rowsPerPage)}
          </span>
          <Button
            onClick={handleNextPage}
            isDisabled={currentPage === Math.ceil(allDataTable.length / rowsPerPage)}
            colorScheme="blue"
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  export default Utility;