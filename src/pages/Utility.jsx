  import { useState, useEffect, useRef } from "react";
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
  // import { useReactToPrint } from "react-to-print";
  import { useColorMode, useColorModeValue } from "@chakra-ui/react";

  var CanvasJS = CanvasJSReact.CanvasJS;
  var CanvasJSChart = CanvasJSReact.CanvasJSChart;

  function Utility() {
    const [dataListTable, setDataListTable] = useState([]);
    const [allDataTable, setAllDataTable] = useState([]);
    const [tempChartData, setTempChartData] = useState([]);
    const [dpChartData, setDpChartData] = useState([]);
    const [rhChartData, setRhChartData] = useState([]);
    const [areaPicker, setAreaPicker] = useState();
    const [datePickerStart, setDatePickerStart] = useState();
    const [datePickerFinish, setDatePickerFinish] = useState();
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

    useEffect(() => {
      const fetchData = async () => {
        let response = await axios.get(
          "http://10.163.0.66:8002/part/getTabelEMS"
        );
        setDataListTable(response.data);
      };
      fetchData();
    }, []);
  
    const renderDropDownArea = () => {
      return dataListTable.map((entry) => {
        const tableName = entry.TABLE_NAME;
        const cleanedName = tableName
          .replace("cMT-PMWorkshop_", "")
          .replace("_data", "");
        return (
          <>
            <option value={tableName}>{cleanedName}</option>;
          </>
        );
      });
    };

    const getSubmit = async () => {
      setLoading(true); // Start spinner
      setError(null); // Clear previous errors

      try {
        const response1 = await axios.get(
          "http://10.163.0.66:8002/part/getTempChart",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.substring(0, 10),
              finish: datePickerFinish.substring(0, 10),
              format: 0,
            },
          }
        );
        const response2 = await axios.get(
          "http://10.163.0.66:8002/part/getTempChart",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.substring(0, 10),
              finish: datePickerFinish.substring(0, 10),
              format: 1,
            },
          }
        );
        const response3 = await axios.get(
          "http://10.163.0.66:8002/part/getTempChart",
          {
            params: {
              area: areaPicker,
        start: datePickerStart.substring(0, 10),
              finish: datePickerFinish.substring(0, 10),
              format: 2,
            },
          }
        );
        const response4 = await axios.get(
          "http://10.163.0.66:8002/part/getAllDataEMS",
          {
            params: {
              area: areaPicker,
              start: datePickerStart.substring(0, 10),
              finish: datePickerFinish.substring(0, 10),
            },
          }
        );
        setTempChartData(response1.data);
        setRhChartData(response2.data);
        setDpChartData(response3.data);
        setAllDataTable(response4.data);
        setIsTableVisible(true); // Show the table

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

        const maxSuhu = response1.data.reduce(
          (acc, data) => Math.max(acc, data.y),
          Number.NEGATIVE_INFINITY
        );
        var max = Number(maxSuhu.toFixed(2));
        setmaxSuhu(max);

        const minSuhu = Math.min(...response1.data.map((data) => data.y));
        var min = Number(minSuhu.toFixed(2));
        setminSuhu(min);

        const totalSuhu = response1.data.reduce((sum, data) => sum + data.y, 0);
        var total = 0;
        total = Number(totalSuhu.toFixed(2));
        const averageSuhu = totalSuhu / response1.data.length;
        var avgSuhu = Number(averageSuhu.toFixed(2));
        setavgSuhu(avgSuhu);

        const maxRH = response2.data.reduce(
          (acc, data) => Math.max(acc, data.y),
          Number.NEGATIVE_INFINITY
        );
        var max = Number(maxRH.toFixed(2));
        setmaxRH(max);

        const minRH = Math.min(...response2.data.map((data) => data.y));
        var min = Number(minRH.toFixed(2));
        setminRH(min);

        const totalRH = response2.data.reduce((sum, data) => sum + data.y, 0);
        var total = 0;
        total = Number(totalRH.toFixed(2));
        const averageRH = totalRH / response1.data.length;
        var avgRH = Number(averageRH.toFixed(2));
        setavgRH(avgRH);

        const maxDP = response3.data.reduce(
          (acc, data) => Math.max(acc, data.y),
          Number.NEGATIVE_INFINITY
        );
        var max = Number(maxDP.toFixed(2));
        setmaxDP(max);

        const minDP = Math.min(...response3.data.map((data) => data.y));
        var min = Number(minDP.toFixed(2));
        setminDP(min);

        const totalDP = response3.data.reduce((sum, data) => sum + data.y, 0);
        var total = 0;
        total = Number(totalDP.toFixed(2));
        const averageDP = totalDP / response3.data.length;
        var avgDP = Number(averageDP.toFixed(2));
        setavgDP(avgDP);

        const areaname = areaPicker
          .replace("cMT-PMWorkshop_", "")
          .replace("_data", "");
        setName(areaname);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to fetch data. Please try again.");
      } finally {
        const delay = 2000; // 2 seconds in milliseconds
        setTimeout(() => {
          setLoading(false); // Stop spinner
          console.log("Finished fetching data, stopping spinner...");
        }, delay);
      }
    };

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
      const visibleData = allDataTable.slice(
        startIndex,
        startIndex + rowsPerPage
      );

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

    const exportToPDF = () => {
      const doc = new jsPDF();
      // Siapkan header kolom sesuai tabel
      const columns = [
        { header: "ID", dataKey: "id" },
        { header: "Date", dataKey: "date" },
        { header: "Temp", dataKey: "temp" },
        { header: "RH", dataKey: "RH" },
        { header: "DP", dataKey: "DP" },
      ];

      console.log("ALL DATA TABLE FOR PDF EXPORT:", allDataTable);

      // allDataTable adalah array of object
      autoTable(doc, {
        columns,
        body: allDataTable, // Seluruh data!
        styles: { fontSize: 10 },
        headStyles: { fillColor: [71, 85, 105] }, // Tailwind slate-700
        theme: "grid",
      });

      doc.save("table-data-EMS.pdf");
    };

    const emsAreaPick = (e) => {
      var dataInput = e.target.value;
      setAreaPicker(dataInput);
    };

    const datePickStart = (e) => {
      var dataInput = e.target.value;
      setDatePickerStart(dataInput);
    };
    const datePickFinish = (e) => {
      var dataInput = e.target.value;
      setDatePickerFinish(dataInput);
    };

    useEffect(() => {
      const handleThemeChange = () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        setIsDarkMode(currentTheme === "dark");
      };
      // Observe attribute changes
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
    // Temperature — index 0
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
    // RH — index 1
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
    // DP — index 2
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
      toolTip: {
        shared: true,
      },
      data: [
  {
    type: "line",
    name: "Temperature",
    axisYIndex: 0,          // ← tambah ini
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
    axisYIndex: 1,          // ← tambah ini
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
    axisYIndex: 2,          // ← tambah ini
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

    // const generatePDF =  useReactToPrint({
    //   content: ()=> ComponentPDF.current,
    //   documentTitle: Name+" Data"
    // });

    return (
      <div>
        <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
          <div className="w-96 ml-4">
            <h5 className="mb-1">Area</h5>
            <Select onChange={emsAreaPick} placeholder="Ruangan">
              {renderDropDownArea()}
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
                background: "var(--color-background)", // background color from Tailwind config

                _hover: {
                  borderColor: hoverBorderColor,
                },
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
                background: "var(--color-background)", // background color from Tailwind config

                _hover: {
                  borderColor: hoverBorderColor,
                },
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
              <Button onClick={exportToPDF} colorScheme="red">
                Export to PDF
              </Button>
            </div>
          </div>
        </div>
        <div className="block bg-card rounded-lg p-1 shadow-lg mx-auto overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center">
              <Spinner
                thickness="4px"
                speed="0.65s"
                emptyColor="gray.200"
                color="blue.500"
                size="xl"
              />
            </div>
          ) : error ? (
            <div className="text-red-500 flex flex-col items-center">
              No available data
            </div>
          ) : (
            <CanvasJSChart options={options} />
          )}
        </div>
        <Stack
          className="flex flex-row justify-center mb-4  "
          direction="row"
          spacing={4}
          align="center"
        >
          <div className="mt-3">
            <div className="ml-16 text-text">
              Avg Suhu = {avgSuhu.toLocaleString()} °C
            </div>
            <div className="ml-16 text-text">
              Max Suhu = {maxSuhu.toLocaleString()} °C
            </div>
            <div className="ml-16 text-text">
              Min Suhu = {minSuhu.toLocaleString()} °C
            </div>
          </div>
          <div className="mt-3">
            <div className="ml-16 text-text">
              Avg RH = {avgRH.toLocaleString()} %
            </div>
            <div className="ml-16 text-text">
              Max RH = {maxRH.toLocaleString()} %
            </div>
            <div className="ml-16 text-text">
              Min RH = {minRH.toLocaleString()} %
            </div>
          </div>
          <div className="mt-3">
            <div className="ml-16 text-text">
              Avg DP = {avgDP.toLocaleString()} Pa
            </div>
            <div className="ml-16 text-text">
              Max DP = {maxDP.toLocaleString()} Pa
            </div>
            <div className="ml-16 text-text">
              Min DP = {minDP.toLocaleString()} Pa
            </div>
          </div>
        </Stack>
        <br />
        <Stack
          className="flex flex-row justify-center gap-2"
          direction="row"
          spacing={2}
          align="center"
        >
          <div className="mt-2">
            <Select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              width="80px"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={40}>40</option>
              <option value={60}>60</option>
              <option value={100}>100</option>
            </Select>
          </div>
          <div>
            <Button
              className="w-40 mt-2"
              colorScheme="red"
              onClick={() => setIsTableVisible(!isTableVisible)}
            >
              {isTableVisible ? "Hide All Data" : "Show All Data"}
            </Button>
          </div>
        </Stack>
        {isTableVisible && (
          <div className="mt-8 mx-20 bg-card rounded-md">
            <TableContainer>
              <Table key={colorMode} variant="simple">
                <TableCaption
                  sx={{
                    color: tulisanColor,
                  }}
                >
                  EMSe
                </TableCaption>
                <Thead>
                  <Tr>
                    <Th
                      sx={{
                        color: tulisanColor,
                      }}
                    >
                      id
                    </Th>
                    <Th
                      sx={{
                        color: tulisanColor,
                      }}
                    >
                      Date Time
                    </Th>
                    <Th
                      sx={{
                        color: tulisanColor,
                      }}
                    >
                      Temperature
                    </Th>
                    <Th
                      sx={{
                        color: tulisanColor,
                      }}
                    >
                      Relative Humidity (RH)
                    </Th>
                    <Th
                      sx={{
                        color: tulisanColor,
                      }}
                    >
                      Differential Presure (DP)
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>{renderTable()}</Tbody>
              </Table>
            </TableContainer>
          </div>
        )}
        {/* Pagination Controls */}
        <div className="flex justify-center items-center my-4 gap-4">
          <Button
            onClick={handlePrevPage}
            isDisabled={currentPage === 1}
            colorScheme="blue"
          >
            Previous
          </Button>
          <span className="text-text">
            Page {currentPage} of {Math.ceil(allDataTable.length / rowsPerPage)}
          </span>
          <Button
            onClick={handleNextPage}
            isDisabled={
              currentPage === Math.ceil(allDataTable.length / rowsPerPage)
            }
            colorScheme="blue"
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  export default Utility;
