"use client";
import React, { useState, useEffect } from "react";
import "./test.css";

const API_BASE = "http://localhost:3002";
const buildPayload = (payloadType, seq = 0) => {
  switch (payloadType) {
    case "kettleTemp":
      return { type: "kettleTemp", temperature: 20 + (seq % 80), seq, ts: Date.now() };
    case "kettleAction":
      return { type: "kettleAction", action: seq % 2 === 0 ? "turnOn" : "turnOff", seq, ts: Date.now() };
    case "custom":
      return { type: "custom", data: `payload-${seq}-${Date.now()}` };
    default:
      return { type: "test", seq, timestamp: Date.now() };
  }
};

const buildAuthorBody = (mode, config) => {
  if (mode === "wallet" && config.walletId?.trim()) {
    return { authorWalletId: config.walletId.trim() };
  }
  if (
    mode === "keys" &&
    config.authorPublicKeyPem?.trim() &&
    config.authorPrivateKeyPem?.trim()
  ) {
    return {
      authorPublicKeyPem: config.authorPublicKeyPem.trim(),
      authorPrivateKeyPem: config.authorPrivateKeyPem.trim(),
    };
  }
  return null;
};

export default function TestPage() {
  const [systemInfo, setSystemInfo] = useState(null);
  const [throughputResults, setThroughputResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [throughputConfig, setThroughputConfig] = useState({
    deviceId: "kettle",
    payloadType: "simple",
    durationSec: 1,
    authorMode: "wallet",
    walletId: "",
    authorPublicKeyPem: "",
    authorPrivateKeyPem: "",
  });
  const [isDdosRunning, setIsDdosRunning] = useState(false);
  const [ddosResults, setDdosResults] = useState(null);
  const [ddosConfig, setDdosConfig] = useState({
    endpoint: "/blocks/create",
    totalRequests: 200,
    concurrency: 25,
    delayMs: 0,
    deviceId: "kettle",
    payloadType: "simple",
    authorMode: "wallet",
    walletId: "",
    authorPublicKeyPem: "",
    authorPrivateKeyPem: "",
  });

  useEffect(() => {
    collectSystemInfo();
  }, []);

  const collectSystemInfo = () => {
    const info = {
      // Browser info
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      
      // Hardware info
      hardwareConcurrency: navigator.hardwareConcurrency || "N/A",
      deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "N/A",
      maxTouchPoints: navigator.maxTouchPoints || 0,
      
      // Performance info
      performance: {
        timing: performance.timing ? {
          navigationStart: new Date(performance.timing.navigationStart).toLocaleString(),
          loadEventEnd: performance.timing.loadEventEnd - performance.timing.navigationStart,
        } : null,
        memory: performance.memory ? {
          jsHeapSizeLimit: `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
          totalJSHeapSize: `${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          usedJSHeapSize: `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        } : null,
      },
      
      // Connection info
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: `${navigator.connection.downlink} Mbps`,
        rtt: `${navigator.connection.rtt} ms`,
        saveData: navigator.connection.saveData,
      } : null,
      
      timestamp: new Date().toLocaleString(),
    };
    
    setSystemInfo(info);
  };

  const testThroughput = async () => {
    setIsRunning(true);
    setProgress(0);
    setThroughputResults(null);

    const durationSec = Math.max(0.1, Number(throughputConfig.durationSec) || 1);
    const durationMs = durationSec * 1000;
    const deviceId = throughputConfig.deviceId.trim() || "kettle";
    const authorBody = buildAuthorBody(throughputConfig.authorMode, throughputConfig);

    if (!authorBody) {
      setThroughputResults({ error: "Укажіть walletId або PEM ключі для авторизації" });
      setIsRunning(false);
      return;
    }

    const stats = {
      processed: 0,
      failed: 0,
      totalTime: 0,
      startedAt: performance.now(),
      attempts: 0,
    };

    try {
      let seq = 0;
      while (performance.now() - stats.startedAt < durationMs) {
        try {
          const payload = buildPayload(throughputConfig.payloadType, seq);
          const start = performance.now();
          const resp = await fetch(`${API_BASE}/blocks/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId,
              payload,
              ...authorBody,
            }),
          });
          const latency = performance.now() - start;
          if (!resp.ok) {
            stats.failed++;
            stats.attempts++;
            seq++;
            continue;
          }
          stats.processed++;
          stats.totalTime += latency;
          stats.attempts++;
        } catch (e) {
          stats.failed++;
          stats.attempts++;
        }
        seq++;
        const elapsed = performance.now() - stats.startedAt;
        setProgress(Math.min(100, Math.round((elapsed / durationMs) * 100)));
      }

      const duration = performance.now() - stats.startedAt;
      const totalAttempts = stats.attempts;
      const metrics = {
        blockchain: {
          processed: stats.processed,
          failed: stats.failed,
          attempts: stats.attempts,
          avgResponseTime:
            stats.processed > 0 ? (stats.totalTime / stats.processed).toFixed(2) + " ms" : "N/A",
          requestsPerSecond:
            duration > 0 ? ((stats.processed / duration) * 1000).toFixed(2) : "N/A",
          durationMs: duration.toFixed(0),
          successRate:
            totalAttempts > 0
              ? ((stats.processed / totalAttempts) * 100).toFixed(2) + "%"
              : "N/A",
        },
      };

      setThroughputResults({ stats, metrics });
    } catch (err) {
      console.error("Throughput test error:", err);
      setThroughputResults({ error: err.message });
    } finally {
      setIsRunning(false);
      setProgress(0);
    }
  };

  const runDdosTest = async () => {
    const endpoint = ddosConfig.endpoint.trim() || "/blocks/create";
    const totalRequests = Math.max(1, Number(ddosConfig.totalRequests) || 1);
    const concurrency = Math.max(1, Math.min(Number(ddosConfig.concurrency) || 1, 500));
    const delayMs = Math.max(0, Number(ddosConfig.delayMs) || 0);
    const deviceId = ddosConfig.deviceId.trim() || "kettle";

    setIsDdosRunning(true);
    setDdosResults(null);

    const authorBody = buildAuthorBody(ddosConfig.authorMode, ddosConfig);
    if (!authorBody) {
      setDdosResults({ error: "Потрібно вказати walletId або ключі для авторизації" });
      setIsDdosRunning(false);
      return;
    }

    const stats = {
      sent: 0,
      success: 0,
      failed: 0,
      totalLatency: 0,
      minLatency: null,
      maxLatency: 0,
      errors: [],
    };

    let cursor = 0;
    const startedAt = performance.now();

    const worker = async () => {
      while (true) {
        const seq = cursor++;
        if (seq >= totalRequests) break;

        const reqStart = performance.now();
        stats.sent++;
        try {
          const payload = buildPayload(ddosConfig.payloadType, seq);
          const body = {
            deviceId,
            payload,
            ...authorBody,
          };

          const resp = await fetch(`${API_BASE}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const latency = performance.now() - reqStart;
          stats.totalLatency += latency;
          stats.minLatency = stats.minLatency === null ? latency : Math.min(stats.minLatency, latency);
          stats.maxLatency = Math.max(stats.maxLatency, latency);
          
          if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({ error: "Unknown error" }));
            stats.failed++;
            stats.errors.push(`HTTP ${resp.status}: ${errorData.error || "Unknown"}`);
          } else {
            stats.success++;
          }
        } catch (err) {
          stats.failed++;
          stats.errors.push(err.message);
        }

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    };

    try {
      const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker());
      await Promise.all(workers);
      const duration = performance.now() - startedAt;

      const summary = {
        durationMs: duration.toFixed(0),
        requestsPerSecond: (totalRequests / (duration / 1000)).toFixed(2),
        avgLatencyMs: stats.sent > 0 ? (stats.totalLatency / stats.sent).toFixed(2) : "0",
        minLatencyMs: stats.minLatency !== null ? stats.minLatency.toFixed(2) : "0",
        maxLatencyMs: stats.maxLatency.toFixed(2),
        successRate: stats.sent > 0 ? ((stats.success / stats.sent) * 100).toFixed(2) : "0",
      };

      setDdosResults({
        config: { endpoint, totalRequests, concurrency, delayMs },
        stats,
        summary,
      });
    } catch (err) {
      setDdosResults({ error: err.message });
    } finally {
      setIsDdosRunning(false);
    }
  };

  return (
    <div className="test-container">
      <h1>Тест пропускної здатності та характеристики ПК</h1>

      <div className="section">
        <h2>Характеристики системи</h2>
        {systemInfo && (
          <div className="info-grid">
            <div className="info-group">
              <h3>Апаратне забезпечення</h3>
              <div className="info-item">
                <span className="label">CPU ядра:</span>
                <span className="value">{systemInfo.hardwareConcurrency}</span>
              </div>
              <div className="info-item">
                <span className="label">Пам'ять пристрою:</span>
                <span className="value">{systemInfo.deviceMemory}</span>
              </div>
              <div className="info-item">
                <span className="label">Точок дотику:</span>
                <span className="value">{systemInfo.maxTouchPoints}</span>
              </div>
            </div>

            {systemInfo.performance.memory && (
              <div className="info-group">
                <h3>Пам'ять JavaScript</h3>
                <div className="info-item">
                  <span className="label">Ліміт heap:</span>
                  <span className="value">{systemInfo.performance.memory.jsHeapSizeLimit}</span>
                </div>
                <div className="info-item">
                  <span className="label">Загальний heap:</span>
                  <span className="value">{systemInfo.performance.memory.totalJSHeapSize}</span>
                </div>
                <div className="info-item">
                  <span className="label">Використано heap:</span>
                  <span className="value">{systemInfo.performance.memory.usedJSHeapSize}</span>
                </div>
              </div>
            )}

            

            <div className="info-group">
              <h3>Інформація</h3>
              <div className="info-item">
                <span className="label">Час збору:</span>
                <span className="value">{systemInfo.timestamp}</span>
              </div>
            </div>
          </div>
        )}
        <button onClick={collectSystemInfo} className="refresh-btn">
          Оновити інформацію
        </button>
      </div>

      <div className="section">
        <h2>Тест пропускної здатності</h2>
        <div className="config-grid">
          <label>
            Device ID
            <input
              type="text"
              value={throughputConfig.deviceId}
              onChange={(e) =>
                setThroughputConfig((prev) => ({ ...prev, deviceId: e.target.value }))
              }
            />
          </label>
          <label>
            Тривалість тесту (сек)
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={throughputConfig.durationSec}
              onChange={(e) =>
                setThroughputConfig((prev) => ({ ...prev, durationSec: e.target.value }))
              }
            />
          </label>
          <label>
            Тип payload
            <select
              value={throughputConfig.payloadType}
              onChange={(e) =>
                setThroughputConfig((prev) => ({ ...prev, payloadType: e.target.value }))
              }
            >
              <option value="simple">Простий тест</option>
              <option value="kettleTemp">Температура чайника</option>
              <option value="kettleAction">Дія чайника</option>
              <option value="custom">Користувацький</option>
            </select>
          </label>
          <label>
            Режим авторизації
            <select
              value={throughputConfig.authorMode}
              onChange={(e) =>
                setThroughputConfig((prev) => ({ ...prev, authorMode: e.target.value }))
              }
            >
              <option value="wallet">Wallet ID</option>
              <option value="keys">PEM ключі</option>
            </select>
          </label>
          {throughputConfig.authorMode === "wallet" ? (
            <label>
              Wallet ID
              <input
                type="text"
                value={throughputConfig.walletId}
                onChange={(e) =>
                  setThroughputConfig((prev) => ({ ...prev, walletId: e.target.value }))
                }
                placeholder="wallet-123"
              />
            </label>
          ) : (
            <>
              <label>
                Public Key (PEM)
                <textarea
                  rows={3}
                  value={throughputConfig.authorPublicKeyPem}
                  onChange={(e) =>
                    setThroughputConfig((prev) => ({
                      ...prev,
                      authorPublicKeyPem: e.target.value,
                    }))
                  }
                  placeholder="-----BEGIN PUBLIC KEY-----"
                />
              </label>
              <label>
                Private Key (PEM)
                <textarea
                  rows={3}
                  value={throughputConfig.authorPrivateKeyPem}
                  onChange={(e) =>
                    setThroughputConfig((prev) => ({
                      ...prev,
                      authorPrivateKeyPem: e.target.value,
                    }))
                  }
                  placeholder="-----BEGIN PRIVATE KEY-----"
                />
              </label>
            </>
          )}
        </div>
        <button 
          onClick={testThroughput} 
          disabled={isRunning}
          className="test-btn"
        >
          {isRunning ? "Виконується..." : "Запустити тест"}
        </button>

        {isRunning && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            <span className="progress-text">{progress}%</span>
          </div>
        )}

        {throughputResults && (
          <div className="results">
            {throughputResults.error ? (
              <div className="error">Помилка: {throughputResults.error}</div>
            ) : (
              <>
                <div className="result-group">
                  <h3>Blockchain API</h3>
                  <div className="metric">
                    <span className="metric-label">Спробовано запитів:</span>
                    <span className="metric-value">
                      {throughputResults.metrics.blockchain.attempts}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Оброблено запитів:</span>
                    <span className="metric-value">
                      {throughputResults.metrics.blockchain.processed}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Помилок:</span>
                    <span className="metric-value">
                      {throughputResults.metrics.blockchain.failed}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Успішність:</span>
                    <span className="metric-value">
                      {throughputResults.metrics.blockchain.successRate}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Середній час відповіді:</span>
                    <span className="metric-value">{throughputResults.metrics.blockchain.avgResponseTime}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Запитів на секунду:</span>
                    <span className="metric-value">{throughputResults.metrics.blockchain.requestsPerSecond}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Тривалість тесту:</span>
                    <span className="metric-value">{throughputResults.metrics.blockchain.durationMs} мс</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="section">
        <h2>Стрес-тест (імітація DDoS)</h2>
        <div className="config-grid">
          <label>
            Endpoint
            <input
              type="text"
              value={ddosConfig.endpoint}
              onChange={(e) => setDdosConfig((prev) => ({ ...prev, endpoint: e.target.value }))}
            />
          </label>
          <label>
            Кількість запитів
            <input
              type="number"
              min={1}
              value={ddosConfig.totalRequests}
              onChange={(e) =>
                setDdosConfig((prev) => ({ ...prev, totalRequests: e.target.value }))
              }
            />
          </label>
          <label>
            Паралельність
            <input
              type="number"
              min={1}
              value={ddosConfig.concurrency}
              onChange={(e) =>
                setDdosConfig((prev) => ({ ...prev, concurrency: e.target.value }))
              }
            />
          </label>
          <label>
            Затримка між запитами (мс)
            <input
              type="number"
              min={0}
              value={ddosConfig.delayMs}
              onChange={(e) =>
                setDdosConfig((prev) => ({ ...prev, delayMs: e.target.value }))
              }
            />
          </label>
          <label>
            Device ID
            <input
              type="text"
              value={ddosConfig.deviceId}
              onChange={(e) => setDdosConfig((prev) => ({ ...prev, deviceId: e.target.value }))}
            />
          </label>
          <label>
            Тип payload
            <select
              value={ddosConfig.payloadType}
              onChange={(e) => setDdosConfig((prev) => ({ ...prev, payloadType: e.target.value }))}
            >
              <option value="simple">Простий тест</option>
              <option value="kettleTemp">Температура чайника</option>
              <option value="kettleAction">Дія чайника</option>
              <option value="custom">Користувацький</option>
            </select>
          </label>
          <label>
            Режим авторизації
            <select
              value={ddosConfig.authorMode}
              onChange={(e) => setDdosConfig((prev) => ({ ...prev, authorMode: e.target.value }))}
            >
              <option value="wallet">Wallet ID</option>
              <option value="keys">PEM ключі</option>
            </select>
          </label>
          {ddosConfig.authorMode === "wallet" ? (
            <label>
              Wallet ID
              <input
                type="text"
                value={ddosConfig.walletId}
                onChange={(e) => setDdosConfig((prev) => ({ ...prev, walletId: e.target.value }))}
                placeholder="test-wallet"
              />
            </label>
          ) : (
            <>
              <label>
                Public Key (PEM)
                <textarea
                  value={ddosConfig.authorPublicKeyPem}
                  onChange={(e) =>
                    setDdosConfig((prev) => ({ ...prev, authorPublicKeyPem: e.target.value }))
                  }
                  placeholder="-----BEGIN PUBLIC KEY-----..."
                  rows={3}
                />
              </label>
              <label>
                Private Key (PEM)
                <textarea
                  value={ddosConfig.authorPrivateKeyPem}
                  onChange={(e) =>
                    setDdosConfig((prev) => ({ ...prev, authorPrivateKeyPem: e.target.value }))
                  }
                  placeholder="-----BEGIN PRIVATE KEY-----..."
                  rows={3}
                />
              </label>
            </>
          )}
        </div>
        <button className="test-btn" disabled={isDdosRunning} onClick={runDdosTest}>
          {isDdosRunning ? "Запускається..." : "Запустити стрес-тест"}
        </button>

        {isDdosRunning && (
          <div className="progress-bar">
            <div className="progress-fill progress-fill--warning"></div>
            <span className="progress-text">Атака виконується…</span>
          </div>
        )}

        {ddosResults && (
          <div className="results">
            {ddosResults.error ? (
              <div className="error">Помилка: {ddosResults.error}</div>
            ) : (
              <>
                <div className="result-group">
                  <h3>Параметри</h3>
                  <div className="metric">
                    <span className="metric-label">Endpoint:</span>
                    <span className="metric-value">{ddosResults.config.endpoint}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Запитів / паралельність:</span>
                    <span className="metric-value">
                      {ddosResults.config.totalRequests} / {ddosResults.config.concurrency}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Затримка:</span>
                    <span className="metric-value">{ddosResults.config.delayMs} мс</span>
                  </div>
                </div>

                <div className="result-group">
                  <h3>Результати атаки</h3>
                  <div className="metric">
                    <span className="metric-label">Успішно / помилок:</span>
                    <span className="metric-value">
                      {ddosResults.stats.success} / {ddosResults.stats.failed}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Тривалість:</span>
                    <span className="metric-value">{ddosResults.summary.durationMs} мс</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">RPS (Requests per second):</span>
                    <span className="metric-value">{ddosResults.summary.requestsPerSecond}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Середня затримка:</span>
                    <span className="metric-value">{ddosResults.summary.avgLatencyMs} мс</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Min / Max затримка:</span>
                    <span className="metric-value">
                      {ddosResults.summary.minLatencyMs} / {ddosResults.summary.maxLatencyMs} мс
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Рівень успіху:</span>
                    <span className="metric-value">{ddosResults.summary.successRate}%</span>
                  </div>
                </div>

                {ddosResults.stats.errors.length > 0 && (
                  <div className="result-group">
                    <h3>Приклади помилок</h3>
                    <ul className="error-list">
                      {ddosResults.stats.errors.slice(0, 5).map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                      {ddosResults.stats.errors.length > 5 && (
                        <li>…і ще {ddosResults.stats.errors.length - 5}</li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

