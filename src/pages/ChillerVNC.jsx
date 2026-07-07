import { useState, useRef, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Switch,
  FormControl,
  FormLabel,
  Input,
  Button,
  Badge,
  useColorModeValue,
} from "@chakra-ui/react";

// RFB (noVNC) sengaja di-load dari CDN saat runtime (bukan di-import statis dari npm),
// karena package @novnc/novnc gak expose "./core/rfb.js" di field "exports"-nya,
// dan file internalnya pakai top-level await yang gak didukung webpack CRA tanpa eject.
// Lihat fungsi loadRFB() di bawah.
const NOVNC_CDN_URL = "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.7.0/core/rfb.js";
let rfbModulePromise = null;
const loadRFB = () => {
  if (!rfbModulePromise) {
    rfbModulePromise = import(/* webpackIgnore: true */ NOVNC_CDN_URL).then((mod) => mod.default);
  }
  return rfbModulePromise;
};

// ────────────────────────────────────────────────────────────
// KONFIGURASI VNC MONITORING
// ────────────────────────────────────────────────────────────
const DEFAULT_VNC_HOST = "10.163.1.117";
const DEFAULT_VNC_PORT = "5900";
const DEFAULT_VNC_PASSWORD = "111111";

const STATUS_COLOR = { disconnected: "gray", connecting: "orange", connected: "green", error: "red" };
const STATUS_LABEL = {
  disconnected: "Disconnected",
  connecting: "Connecting...",
  connected: "Connected",
  error: "Error",
};

// apiBase datang dari Chiller.jsx, contoh: "http://10.163.0.66:8002/part"
// Endpoint proxy VNC (/websockify) nempel langsung di server Express-nya (bukan di bawah /part),
// jadi kita ambil origin-nya aja (protocol + host + port) terus ganti http(s) -> ws(s).
const getWsOrigin = (apiBase) => {
  try {
    const url = new URL(apiBase);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${url.host}`;
  } catch {
    return "";
  }
};

// apiBase: dipakai buat nentuin backend host tempat proxy /websockify nempel
function ChillerVNC({ apiBase }) {
  // ── STATE TOGGLE TAMPIL/HIDE (default hidden) ───────────────
  const [isVisible, setIsVisible] = useState(false);

  // ── STATE KONEKSI VNC ────────────────────────────────────────
  const [host, setHost] = useState(DEFAULT_VNC_HOST);
  const [port, setPort] = useState(DEFAULT_VNC_PORT);
  const [password, setPassword] = useState(DEFAULT_VNC_PASSWORD);
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected | error
  const [errorMsg, setErrorMsg] = useState("");

  const screenRef = useRef(null); // div tempat noVNC nempelin canvas
  const rfbRef = useRef(null);

  const borderColor = useColorModeValue("rgba(var(--color-border))", "rgba(var(--color-border))");
  const wsOrigin = getWsOrigin(apiBase);

  const isBusy = status === "connected" || status === "connecting";

  // ── DISCONNECT ───────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (rfbRef.current) {
      rfbRef.current.disconnect();
      rfbRef.current = null;
    }
    setStatus((prev) => (prev === "connected" || prev === "connecting" ? "disconnected" : prev));
  }, []);

  // ── CONNECT ──────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!screenRef.current) return;
    if (!host) {
      setErrorMsg("Isi IP target dulu.");
      return;
    }
    if (!wsOrigin) {
      setErrorMsg("apiBase tidak valid, gak bisa nentuin alamat proxy VNC.");
      return;
    }

    setErrorMsg("");
    setStatus("connecting");

    if (rfbRef.current) {
      rfbRef.current.disconnect();
      rfbRef.current = null;
    }

    let RFB;
    try {
      RFB = await loadRFB();
    } catch (err) {
      setStatus("error");
      setErrorMsg("Gagal load library noVNC dari CDN: " + err.message);
      return;
    }

    // Elemen bisa aja udah ke-unmount/toggle ke-off selagi nunggu import CDN
    if (!screenRef.current) return;

    const url = `${wsOrigin}/websockify?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`;

    let rfb;
    try {
      rfb = new RFB(screenRef.current, url, { credentials: { password } });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
      return;
    }

    rfb.scaleViewport = true;
    rfb.resizeSession = true;

    rfb.addEventListener("connect", () => setStatus("connected"));

    rfb.addEventListener("disconnect", (e) => {
      const clean = e.detail && e.detail.clean;
      setStatus(clean ? "disconnected" : "error");
      if (!clean) setErrorMsg("Koneksi VNC terputus tidak wajar.");
      rfbRef.current = null;
    });

    rfb.addEventListener("credentialsrequired", () => {
      rfb.sendCredentials({ password });
    });

    rfb.addEventListener("securityfailure", (e) => {
      const reason = e.detail && e.detail.reason ? e.detail.reason : "password salah / tidak cocok";
      setErrorMsg(`Autentikasi gagal: ${reason}`);
      setStatus("error");
    });

    rfbRef.current = rfb;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, port, password, wsOrigin]);

  // Toggle "Tampilkan" nge-connect otomatis, toggle off nge-disconnect.
  // Sengaja cuma depend ke isVisible: connect() pakai nilai host/port/password
  // yang lagi diisi di form pas toggle di-nyalain, gak perlu reconnect tiap ngetik.
  useEffect(() => {
    if (isVisible) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  return (
    <div className="mx-4 md:mx-20 mb-8">
      {/* Header + toggle show/hide */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-8 mb-4">
        <Text className="text-text" fontWeight="bold" fontSize="lg">
          VNC Monitoring
        </Text>
        <FormControl display="flex" alignItems="center" width="auto" gap={2}>
          <FormLabel htmlFor="vnc-toggle" mb="0" fontSize="sm" className="text-text">
            Tampilkan
          </FormLabel>
          <Switch
            id="vnc-toggle"
            colorScheme="blue"
            isChecked={isVisible}
            onChange={(e) => setIsVisible(e.target.checked)}
          />
        </FormControl>
      </div>

      {isVisible && (
        <div className="bg-card rounded-md shadow-lg p-4">
          {/* Form target VNC */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <FormControl width="170px">
              <FormLabel fontSize="xs" className="text-text" opacity={0.7} mb={1}>
                Target IP
              </FormLabel>
              <Input
                size="sm"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                isDisabled={isBusy}
                sx={{ border: "1px solid", borderColor, background: "var(--color-background)" }}
              />
            </FormControl>
            <FormControl width="90px">
              <FormLabel fontSize="xs" className="text-text" opacity={0.7} mb={1}>
                Port
              </FormLabel>
              <Input
                size="sm"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                isDisabled={isBusy}
                sx={{ border: "1px solid", borderColor, background: "var(--color-background)" }}
              />
            </FormControl>
            <FormControl width="160px">
              <FormLabel fontSize="xs" className="text-text" opacity={0.7} mb={1}>
                Password
              </FormLabel>
              <Input
                size="sm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                isDisabled={isBusy}
                sx={{ border: "1px solid", borderColor, background: "var(--color-background)" }}
              />
            </FormControl>

            {isBusy ? (
              <Button size="sm" colorScheme="red" onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" colorScheme="blue" onClick={connect} isLoading={status === "connecting"}>
                Connect
              </Button>
            )}

            <Badge colorScheme={STATUS_COLOR[status]} ml={{ base: 0, md: "auto" }} alignSelf="center">
              {STATUS_LABEL[status]}
            </Badge>
          </div>

          {errorMsg && (
            <Text fontSize="sm" color="red.400" mb={3}>
              {errorMsg}
            </Text>
          )}

          {/* Area layar VNC — WAJIB punya ukuran eksplisit sebelum RFB connect,
              kalau nggak layar remote ke-resize jadi 0 dan hasilnya blank walau status "connected". */}
          <Box position="relative" width="100%" height={{ base: "300px", md: "520px" }} bg="black" borderRadius="md" overflow="hidden">
            <Box ref={screenRef} position="absolute" top={0} left={0} right={0} bottom={0} width="100%" height="100%" />
            {status !== "connected" && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-gray-400 text-sm pointer-events-none px-4">
                {status === "connecting" ? "Menghubungkan ke VNC..." : "Nyalakan toggle di atas untuk mulai monitoring"}
              </div>
            )}
          </Box>
        </div>
      )}
    </div>
  );
}

export default ChillerVNC;