"use client";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/router";

/* ===================== CLOUD ===================== */
const CLOUD_URL = "https://jalsuddhi-1.onrender.com";

if (typeof window !== "undefined") {
  const _fetch = window.fetch.bind(window);
  window.fetch = (url, options) => {
    // If absolute URL, forward as-is
    if (typeof url === "string" && url.startsWith("http")) {
      return _fetch(url, options);
    }

    // If calling our Next API routes, keep local
    if (typeof url === "string" && url.startsWith("/api")) {
      return _fetch(url, options);
    }

    // Route any client-side `/update` calls through the Next API proxy
    if (typeof url === "string" && (url === "/update" || url.startsWith("/update?"))) {
      return _fetch(`/api/update${url.slice(7) || ""}`, options);
    }

    // Default: proxy non-absolute paths to the cloud URL (existing behavior)
    return _fetch(`${CLOUD_URL}${url}`, options);
  };
}
/* ================================================= */

export default function Controls() {
  const router = useRouter();

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [sensorData, setSensorData] = useState({
    temperature: "--",
    ph: "--",
    turbidity: "--",
  });

  const [accelerator, setAccelerator] = useState(50);
  const speedRef = useRef(0);
  const speedInterval = useRef(null);

  /* ===================== CONNECTION STATUS ===================== */
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/status", { cache: "no-store" });
        const data = await res.json();
        setConnected(data.online);
      } catch {
        setConnected(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);
  /* ============================================================= */

  /* ===================== CONNECT BUTTON ===================== */
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/status", { cache: "no-store" });
      const data = await res.json();
      if (!data.online) throw new Error();
      setConnected(true);
    } catch {
      alert("❌ ESP is offline");
    } finally {
      setConnecting(false);
    }
  };
  /* =========================================================== */

  /* ===================== SENSOR POLLING ===================== */
  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/telemetry", { cache: "no-store" });
        const data = await res.json();
        setSensorData(data);
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [connected]);
  /* =========================================================== */

  /* ===================== MOTOR ===================== */
  const sendCommand = (dir) => {
    if (!connected) return;

    clearInterval(speedInterval.current);
    speedRef.current = 0;

    speedInterval.current = setInterval(() => {
      if (speedRef.current < 100) speedRef.current += 5;
      const finalSpeed = Math.round((speedRef.current * accelerator) / 100);
      // Map local move requests to the bot-command proxy. Arduino expects commands like "forward","left","right","back","stop"
      const cmd = dir === 'backward' ? 'back' : dir;
      fetch(`/api/bot-command?cmd=${encodeURIComponent(cmd)}&speed=${finalSpeed}`).catch(() => {});
    }, 100);
  };

  const stopMovement = () => {
    clearInterval(speedInterval.current);
    speedRef.current = 0;
    fetch(`/api/bot-command?cmd=stop&speed=0`).catch(() => {});
  };
  /* ================================================= */

  /* ===================== SERVO ===================== */
  const handleServo = (angle) => {
    if (!connected) return;
    // Send servo command via bot-command proxy. Format: cmd=servo:angle (your ESP code can parse this if implemented server-side)
    fetch(`/api/bot-command?cmd=${encodeURIComponent('servo:' + angle)}`).catch(() => {});
  };
  /* ================================================= */

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-black via-blue-900 to-cyan-900 text-white overflow-y-auto">
      <div className="absolute inset-0 opacity-30 bg-[url('/water-texture.gif')] bg-cover bg-center pointer-events-none" />

      {/* NAV */}
      <div className="absolute top-6 left-6 z-30 flex gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg text-black font-bold shadow"
        >
          ⬅ Dashboard
        </button>
        <button
          onClick={() => router.push("/")}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-black font-bold shadow"
        >
          🏠 Home
        </button>
      </div>

      {/* TITLE */}
      <motion.h1
        className="pt-24 text-3xl md:text-4xl font-extrabold text-cyan-300 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        🤖 JAL-SUDDHI BOT CONTROL CENTER
      </motion.h1>

      {/* CONNECT */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={handleConnect}
          disabled={connecting}
          className={`px-6 py-3 rounded-lg font-semibold shadow ${
            connected
              ? "bg-green-500 text-black"
              : "bg-cyan-600 text-black hover:bg-cyan-500"
          }`}
        >
          {connecting ? "⏳ Connecting..." : connected ? "✅ Connected" : "🔗 Connect"}
        </button>
      </div>

      {/* MAIN */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8 px-6 pb-20">
        {/* SERVO */}
        <div className="bg-black/50 p-5 rounded-2xl border border-cyan-600/30 shadow-md">
          <h3 className="text-lg font-semibold text-cyan-300 mb-3">
            Servo Control
          </h3>
          <input
            type="range"
            min="0"
            max="180"
            onChange={(e) => handleServo(e.target.value)}
            className="w-full accent-cyan-500"
          />
        </div>

        {/* CAMERA + JOYSTICK */}
        <div className="flex flex-col items-center gap-8">
          <div className="w-[380px] h-[280px] md:w-[520px] md:h-[360px] bg-black/60 border-4 border-cyan-500 rounded-2xl shadow-2xl overflow-hidden">
            {connected ? (
              <img
                src={`/cam/frame?t=${Date.now()}`}
                alt="ESP32-CAM"
                className="object-cover w-full h-full"
              />
            ) : (
              <p className="text-gray-300 text-sm flex items-center justify-center h-full">
                Camera Offline
              </p>
            )}
          </div>

          {/* JOYSTICK */}
          <div className="grid grid-cols-3 gap-5">
            <div />
            <JoystickButton
              icon="⬆"
              onMouseDown={() => sendCommand("forward")}
              onMouseUp={stopMovement}
            />
            <div />
            <JoystickButton
              icon="⬅"
              onMouseDown={() => sendCommand("left")}
              onMouseUp={stopMovement}
            />
            <JoystickButton icon="⛔" color="red" onClick={stopMovement} />
            <JoystickButton
              icon="➡"
              onMouseDown={() => sendCommand("right")}
              onMouseUp={stopMovement}
            />
            <div />
            <JoystickButton
              icon="⬇"
              onMouseDown={() => sendCommand("backward")}
              onMouseUp={stopMovement}
            />
            <div />
          </div>

          {/* ACCELERATOR */}
          <div className="w-56">
            <label className="text-sm text-gray-300">Accelerator</label>
            <input
              type="range"
              min="0"
              max="100"
              value={accelerator}
              onChange={(e) => setAccelerator(+e.target.value)}
              className="w-full accent-cyan-500"
            />
            <p className="text-sm text-gray-300 text-center">{accelerator}%</p>
          </div>
        </div>

        {/* SENSOR */}
        <div className="bg-black/50 p-5 rounded-2xl border border-cyan-600/30 shadow-md text-center">
          <h3 className="text-lg font-semibold text-cyan-300 mb-3">
            Sensor Readings
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <SensorBox label="🌡 Temp" value={sensorData.temperature} />
            <SensorBox label="💧 pH" value={sensorData.ph} />
            <SensorBox label="🌫 Turbidity" value={sensorData.turbidity} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== COMPONENTS ===================== */
const JoystickButton = ({ icon, onClick, onMouseDown, onMouseUp, color = "cyan" }) => (
  <motion.button
    whileHover={{ scale: 1.15 }}
    whileTap={{ scale: 0.9 }}
    onClick={onClick}
    onMouseDown={onMouseDown}
    onMouseUp={onMouseUp}
    className={`w-20 h-20 md:w-24 md:h-24 text-3xl font-bold rounded-full shadow-lg text-black ${
      color === "red"
        ? "bg-red-600 hover:bg-red-500"
        : "bg-cyan-500 hover:bg-cyan-400"
    } border-4 border-white/40`}
  >
    {icon}
  </motion.button>
);

const SensorBox = ({ label, value }) => (
  <div className="bg-white/10 p-3 rounded-lg">
    <div className="text-sm text-gray-300">{label}</div>
    <div className="text-2xl font-bold">{value}</div>
  </div>
);
