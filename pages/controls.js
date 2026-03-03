"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/router";

export default function Controls() {

  const router = useRouter();
  const socketRef = useRef(null);

  const [connected, setConnected] = useState(false);

  const [sensorData, setSensorData] = useState({
    temperature: "--",
    ph: "--",
    turbidity: "--",
  });

  const [accelerator, setAccelerator] = useState(50);
  const [servoAngle, setServoAngle] = useState(90);

  // ================= WEBSOCKET =================

  useEffect(() => {

    const socket = new WebSocket("ws://192.168.4.1:81/");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to ESP32");
      setConnected(true);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onerror = () => {
      setConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.turbidity !== undefined) {
          setSensorData(prev => ({
            ...prev,
            turbidity: data.turbidity
          }));
        }
      } catch {}
    };

    return () => socket.close();

  }, []);

  // ================= MOTOR =================

  const sendCommand = (dir) => {
    if (!connected || !socketRef.current) return;

    socketRef.current.send(
      JSON.stringify({
        type: "move",
        direction: dir,
        speed: accelerator
      })
    );
  };

  const stopMovement = () => {
    socketRef.current?.send(
      JSON.stringify({
        type: "move",
        direction: "stop",
        speed: 0
      })
    );
  };

  // ================= SERVO =================

  const handleServo = (angle) => {
    setServoAngle(angle);

    socketRef.current?.send(
      JSON.stringify({
        type: "servo",
        angle: angle
      })
    );
  };

  // ================= UI =================

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-black via-blue-900 to-cyan-900 text-white overflow-y-auto">

      <div className="absolute top-6 left-6 z-30 flex gap-3">
        <button
          onClick={()=>router.push("/dashboard")}
          className="bg-cyan-600 px-4 py-2 rounded-lg text-black font-bold shadow">
          ⬅ Dashboard
        </button>

        <button
          onClick={()=>router.push("/")}
          className="bg-blue-600 px-4 py-2 rounded-lg text-black font-bold shadow">
          🏠 Home
        </button>
      </div>

      <motion.h1
        className="pt-24 text-3xl md:text-4xl font-extrabold text-cyan-300 text-center"
        initial={{opacity:0,y:-10}}
        animate={{opacity:1,y:0}}>
        🤖 JAL-SUDDHI BOT CONTROL CENTER
      </motion.h1>

      <div className="mt-6 flex justify-center">
        <div className={`px-6 py-3 rounded-lg font-semibold shadow ${
          connected ? "bg-green-500 text-black" : "bg-red-500 text-black"
        }`}>
          {connected ? "✅ Connected" : "❌ Disconnected"}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-8 pb-20">

        {/* ===== IMPROVED SERVO CONTROL ===== */}

        <div className="bg-black/50 p-6 rounded-2xl border border-cyan-600/30 shadow-xl w-72 text-center">

          <h3 className="text-xl font-bold text-cyan-300 mb-4">
            🎛 Servo Control
          </h3>

          {/* Angle Display */}
          <div className="text-4xl font-extrabold text-cyan-400 mb-4">
            {servoAngle}°
          </div>

          {/* Slider */}
          <input
            type="range"
            min="0"
            max="180"
            value={servoAngle}
            onChange={(e)=>handleServo(+e.target.value)}
            className="w-full accent-cyan-500 cursor-pointer"
          />

          {/* Quick Buttons */}
          <div className="flex justify-between mt-4">
            <button
              onClick={()=>handleServo(0)}
              className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg text-black font-semibold">
              0°
            </button>

            <button
              onClick={()=>handleServo(90)}
              className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded-lg text-black font-semibold">
              90°
            </button>

            <button
              onClick={()=>handleServo(180)}
              className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg text-black font-semibold">
              180°
            </button>
          </div>
        </div>

        {/* ===== JOYSTICK ===== */}

        <div className="grid grid-cols-3 gap-5">
          <div/>
          <JoystickButton icon="⬆" onMouseDown={()=>sendCommand("forward")} onMouseUp={stopMovement}/>
          <div/>
          <JoystickButton icon="⬅" onMouseDown={()=>sendCommand("left")} onMouseUp={stopMovement}/>
          <JoystickButton icon="⛔" color="red" onClick={stopMovement}/>
          <JoystickButton icon="➡" onMouseDown={()=>sendCommand("right")} onMouseUp={stopMovement}/>
          <div/>
          <JoystickButton icon="⬇" onMouseDown={()=>sendCommand("backward")} onMouseUp={stopMovement}/>
          <div/>
        </div>

        {/* ===== ACCELERATOR ===== */}

        <div className="w-56">
          <label className="text-sm text-gray-300">Accelerator</label>
          <input
            type="range"
            min="0"
            max="100"
            value={accelerator}
            onChange={(e)=>setAccelerator(+e.target.value)}
            className="w-full accent-cyan-500"/>
          <p className="text-sm text-center">{accelerator}%</p>
        </div>

        {/* ===== SENSOR ===== */}

        <div className="bg-black/50 p-5 rounded-2xl border border-cyan-600/30 shadow-md text-center w-64">
          <h3 className="text-lg font-semibold text-cyan-300 mb-3">
            Turbidity
          </h3>
          <div className="text-2xl font-bold">
            {sensorData.turbidity}
          </div>
        </div>

      </div>
    </div>
  );
}

const JoystickButton = ({ icon, onClick, onMouseDown, onMouseUp, color="cyan" }) => (
  <motion.button
    whileHover={{scale:1.15}}
    whileTap={{scale:0.9}}
    onClick={onClick}
    onMouseDown={onMouseDown}
    onMouseUp={onMouseUp}
    className={`w-20 h-20 md:w-24 md:h-24 text-3xl font-bold rounded-full shadow-lg text-black ${
      color==="red"
        ? "bg-red-600 hover:bg-red-500"
        : "bg-cyan-500 hover:bg-cyan-400"
    } border-4 border-white/40`}>
    {icon}
  </motion.button>
);