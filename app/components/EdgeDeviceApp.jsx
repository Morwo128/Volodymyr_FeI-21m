"use client";
import React, { useState, useEffect } from "react";
import "./DeviceStyles.css";

const API_BASE = "http://localhost:3002";

// const provider = new ethers.providers.JsonRpcProvider(
//   "https://mainnet.infura.io/v3/6a3725a748c9467cb628653bd2ccdba8"
// );
export default function EdgeDeviceApp() {
  const [account, setAccount] = useState("");
  const [authorPublicKeyPem, setAuthorPublicKeyPem] = useState("");
  const [authorPrivateKeyPem, setAuthorPrivateKeyPem] = useState("");
  const [kettleTemp, setKettleTemp] = useState("");
  const [kettleHistory, setKettleHistory] = useState([]);
  const [lockHistory, setLockHistory] = useState([]);
  const [lockStatus, setLockStatus] = useState("Unknown");

  useEffect(() => {
    const init = async () => {
      try {
        const resp = await fetch(`${API_BASE}/node/info`);
        const info = await resp.json();
        setAccount(info.publicKey ? "Local Node (ECDSA)" : "Local Node");
      } catch (err) {
        setAccount("Local Node");
      }
    };
    init();
  }, []);

  const getAuthorFields = () => {
    if (!authorPublicKeyPem.trim() || !authorPrivateKeyPem.trim()) {
      return null;
    }
    return {
      authorPublicKeyPem: authorPublicKeyPem.trim(),
      authorPrivateKeyPem: authorPrivateKeyPem.trim(),
    };
  };

  const sendTemperature = async () => {
    try {
      const authorFields = getAuthorFields();
      if (!authorFields) {
        alert("Вставте обидва PEM ключі перед відправкою блоку.");
        return;
      }
      const payload = { type: "kettleTemp", temperature: Number(kettleTemp) };
      const r = await fetch(`${API_BASE}/blocks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: "kettle",
          payload,
          ...authorFields,
        })
      });
      if (!r.ok) throw new Error("create failed");
      alert("Температура надіслана!");
      setKettleTemp("");
      fetchKettleHistory();
    } catch (err) {
      alert("Помилка: " + err.message);
    }
  };

  const toggleLock = async () => {
    try {
      const authorFields = getAuthorFields();
      if (!authorFields) {
        alert("Вставте обидва PEM ключі перед відправкою блоку.");
        return;
      }
      const newLocked = !(lockStatus === "Locked");
      const payload = { type: "lockState", isLocked: newLocked };
      const r = await fetch(`${API_BASE}/blocks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: "lock",
          payload,
          ...authorFields,
        })
      });
      if (!r.ok) throw new Error("create failed");
      alert("Стан замка змінено!");
      fetchLockHistory();
    } catch (err) {
      alert("Помилка: " + err.message);
    }
  };

  const fetchKettleHistory = async () => {
    try {
      const resp = await fetch(`${API_BASE}/chain`);
      const { chain } = await resp.json();
      const entries = [];
      for (const b of chain) {
        if (b.index === 0) continue;
        try {
          const dr = await fetch(`${API_BASE}/blocks/decrypt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: b.index, deviceId: "kettle" })
          });
          if (!dr.ok) continue;
          const { plaintext } = await dr.json();
          const obj = JSON.parse(plaintext);
          if (obj.type === "kettleTemp") {
            entries.push({
              temperature: String(obj.temperature),
              time: new Date(b.timestamp).toLocaleString(),
            });
          }
        } catch (_) {
          // ignore failed decrypts
        }
      }
      setKettleHistory(entries.reverse());
    } catch (e) {
      // ignore
    }
  };

  const fetchLockHistory = async () => {
    try {
      const resp = await fetch(`${API_BASE}/chain`);
      const { chain } = await resp.json();
      const entries = [];
      for (const b of chain) {
        if (b.index === 0) continue;
        try {
          const dr = await fetch(`${API_BASE}/blocks/decrypt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: b.index, deviceId: "lock" })
          });
          if (!dr.ok) continue;
          const { plaintext } = await dr.json();
          const obj = JSON.parse(plaintext);
          if (obj.type === "lockState") {
            entries.push({
              state: obj.isLocked ? "Locked" : "Unlocked",
              time: new Date(b.timestamp).toLocaleString(),
            });
          }
        } catch (_) {
          // ignore
        }
      }
      const reversed = entries.reverse();
      setLockHistory(reversed);
      if (reversed.length > 0) setLockStatus(reversed[0].state);
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="dashboard">
      <h1>🔐 Розумні Пристрої на Блокчейні</h1>
      <p className="account">👤 Підключено: {account}</p>

      <div className="device auth-card">
        <div className="auth-card__header">
          <div>
            <h2>PEM-підпис блоків</h2>
            <p>Вставте пару ключів у форматі PKCS8. Вони зберігаються лише локально.</p>
          </div>
          <div className="auth-card__actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setAuthorPublicKeyPem("");
                setAuthorPrivateKeyPem("");
              }}
            >
              Очистити
            </button>
          </div>
        </div>
        <div className="pem-grid">
          <label>
            Public key
            <textarea
              placeholder="-----BEGIN PUBLIC KEY-----"
              value={authorPublicKeyPem}
              onChange={(e) => setAuthorPublicKeyPem(e.target.value)}
            />
          </label>
          <label>
            Private key
            <textarea
              placeholder="-----BEGIN PRIVATE KEY-----"
              value={authorPrivateKeyPem}
              onChange={(e) => setAuthorPrivateKeyPem(e.target.value)}
            />
          </label>
        </div>
        <small>
          Скопіюйте ключі з відповіді `/wallets/create` або використайте власну пару `secp256k1`.
        </small>
      </div>
      <div className="device">
        <img src={"/kettle.png"} alt="Kettle" />
        <h2>Чайник</h2>
        <input
          type="number"
          placeholder="Введіть температуру"
          value={kettleTemp}
          onChange={(e) => setKettleTemp(e.target.value)}
        />
        <button onClick={sendTemperature}>Надіслати температуру</button>
        <button onClick={fetchKettleHistory}>Показати історію</button>
        <ul className="history">
          {kettleHistory.map((entry, i) => (
            <li key={i}>
              🌡 {entry.temperature}°C — {entry.time}
            </li>
          ))}
        </ul>
      </div>

      <div className="device">
        <img src={"/lock.png"} alt="Door Lock" />
        <h2>Дверний замок</h2>
        <p>
          🔒 Поточний стан: <strong>{lockStatus}</strong>
        </p>
        <button onClick={toggleLock}>Перемкнути стан</button>
        <button onClick={fetchLockHistory}>Показати історію</button>
        <ul className="history">
          {lockHistory.map((entry, i) => (
            <li key={i}>
              🚪 {entry.state} — {entry.time}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
