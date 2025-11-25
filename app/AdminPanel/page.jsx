"use client";
import React, { useEffect, useState } from "react";

import "./DeviceStyles.css";

const API_BASE = "http://localhost:3002";
const DEFAULT_PAYLOAD = `{
  "type": "kettleTemp",
  "temperature": 42
}`;

const prettyPrint = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

const formatError = (err) => ({
  error: err?.message || "Request failed",
  detail: err?.data ?? null,
});

const ResponseBox = ({ data }) => (
  <div className="response">
    <pre>{data || "—"}</pre>
  </div>
);

export default function AdminPage() {
  const [nodeInfo, setNodeInfo] = useState(null);
  const [responses, setResponses] = useState({});
  const [chainMeta, setChainMeta] = useState({ length: 0 });

  const [createForm, setCreateForm] = useState({
    deviceId: "kettle",
    payload: DEFAULT_PAYLOAD,
    authorMode: "wallet",
    walletId: "",
    authorPublicKeyPem: "",
    authorPrivateKeyPem: "",
  });

  const [decryptForm, setDecryptForm] = useState({ index: "", deviceId: "" });
  const [latestForm, setLatestForm] = useState({
    deviceId: "",
    includePlaintext: true,
  });
  const [allForm, setAllForm] = useState({
    deviceId: "",
    includePlaintext: false,
  });
  const [walletForm, setWalletForm] = useState({
    ownerToken: "",
    walletId: "",
    label: "",
  });
  const [receiveBlockInput, setReceiveBlockInput] = useState("");
  const [replaceChainInput, setReplaceChainInput] = useState("");

  const updateResponse = (key, value) =>
    setResponses((prev) => ({ ...prev, [key]: prettyPrint(value) }));

  const requestJson = async ({ path, method = "GET", body, headers, query }) => {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .reduce((params, [k, v]) => {
            params.append(k, v);
            return params;
          }, new URLSearchParams())
      : null;

    const url = `${API_BASE}${path}${qs && qs.toString() ? `?${qs.toString()}` : ""}`;

    const opts = {
      method,
      headers: { ...(headers || {}) },
    };

    if (body !== undefined && method !== "GET") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);
    const text = await resp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }

    if (!resp.ok) {
      const error = new Error(`HTTP ${resp.status}`);
      error.data = data;
      throw error;
    }

    return data;
  };

  const initNodeInfo = async () => {
    try {
      const data = await requestJson({ path: "/node/info" });
      setNodeInfo(data);
      updateResponse("nodeInfo", data);
    } catch (err) {
      updateResponse("nodeInfo", formatError(err));
    }
  };

  const fetchChain = async () => {
    try {
      const data = await requestJson({ path: "/chain" });
      updateResponse("chain", data);
      setChainMeta({ length: data?.length || 0 });
    } catch (err) {
      updateResponse("chain", formatError(err));
    }
  };

  useEffect(() => {
    initNodeInfo();
    fetchChain();
  }, []);

  const handleCreateBlock = async () => {
    try {
      if (!createForm.deviceId.trim()) {
        throw new Error("deviceId is required");
      }
      let payload;
      try {
        payload = JSON.parse(createForm.payload);
      } catch (e) {
        throw new Error("Payload must be valid JSON");
      }
      const body = { deviceId: createForm.deviceId.trim(), payload };
      if (createForm.authorMode === "wallet") {
        if (!createForm.walletId.trim()) {
          throw new Error("Wallet ID is required for wallet mode");
        }
        body.authorWalletId = createForm.walletId.trim();
      } else {
        if (!createForm.authorPublicKeyPem.trim() || !createForm.authorPrivateKeyPem.trim()) {
          throw new Error("Both public and private PEMs are required for raw keys mode");
        }
        body.authorPublicKeyPem = createForm.authorPublicKeyPem.trim();
        body.authorPrivateKeyPem = createForm.authorPrivateKeyPem.trim();
      }
      const data = await requestJson({
        path: "/blocks/create",
        method: "POST",
        body,
      });
      updateResponse("createBlock", data);
      fetchChain();
    } catch (err) {
      updateResponse("createBlock", formatError(err));
    }
  };

  const handleDecrypt = async () => {
    try {
      const idx = Number(decryptForm.index);
      if (Number.isNaN(idx)) {
        throw new Error("Index must be a number");
      }
      if (!decryptForm.deviceId.trim()) {
        throw new Error("deviceId is required");
      }
      const data = await requestJson({
        path: "/blocks/decrypt",
        method: "POST",
        body: { index: idx, deviceId: decryptForm.deviceId.trim() },
      });
      updateResponse("decryptBlock", data);
    } catch (err) {
      updateResponse("decryptBlock", formatError(err));
    }
  };

  const handleLatestForDevice = async () => {
    try {
      if (!latestForm.deviceId.trim()) {
        throw new Error("deviceId is required");
      }
      const data = await requestJson({
        path: "/blocks/latest-for-device",
        query: {
          deviceId: latestForm.deviceId.trim(),
          includePlaintext: latestForm.includePlaintext ? "true" : "false",
        },
      });
      updateResponse("latestBlock", data);
    } catch (err) {
      updateResponse("latestBlock", formatError(err));
    }
  };

  const handleAllBlocks = async () => {
    try {
      const query = {};
      if (allForm.deviceId.trim()) {
        query.deviceId = allForm.deviceId.trim();
      }
      if (allForm.includePlaintext) {
        query.includePlaintext = "true";
      }
      const data = await requestJson({
        path: "/blocks/all",
        query,
      });
      updateResponse("allBlocks", data);
    } catch (err) {
      updateResponse("allBlocks", formatError(err));
    }
  };

  const handleWalletCreate = async () => {
    try {
      if (!walletForm.ownerToken.trim()) {
        throw new Error("Owner token is required to create a wallet");
      }
      const body = {
        ownerToken: walletForm.ownerToken.trim(),
        walletId: walletForm.walletId.trim() || undefined,
        label: walletForm.label.trim() || undefined,
      };
      const headers = {
        Authorization: `Bearer ${walletForm.ownerToken.trim()}`,
      };
      const data = await requestJson({
        path: "/wallets/create",
        method: "POST",
        body,
        headers,
      });
      updateResponse("walletCreate", data);
    } catch (err) {
      updateResponse("walletCreate", formatError(err));
    }
  };

  const handleReceiveBlock = async () => {
    try {
      const block = JSON.parse(receiveBlockInput);
      const data = await requestJson({
        path: "/blocks/receive",
        method: "POST",
        body: { block },
      });
      updateResponse("receiveBlock", data);
      fetchChain();
    } catch (err) {
      updateResponse("receiveBlock", formatError(err));
    }
  };

  const handleReplaceChain = async () => {
    try {
      const chain = JSON.parse(replaceChainInput);
      if (!Array.isArray(chain)) {
        throw new Error("Chain payload must be an array");
      }
      const data = await requestJson({
        path: "/chain/replace",
        method: "POST",
        body: { chain },
      });
      updateResponse("replaceChain", data);
      fetchChain();
    } catch (err) {
      updateResponse("replaceChain", formatError(err));
    }
  };

  return (
    <div className="dashboard">
      <h1>Blockchain Admin</h1>
      <p className="account">
        Node: {nodeInfo ? `port ${nodeInfo.port}` : "loading..."} | Chain blocks: {chainMeta.length}
      </p>

      <div className="device">
        <h2>Node info / peers</h2>
        <button onClick={initNodeInfo}>Refresh node info</button>
        <ResponseBox data={responses.nodeInfo} />
      </div>

      <div className="device">
        <h2>Create block (/blocks/create)</h2>
        <label>
          Device ID
          <input
            type="text"
            value={createForm.deviceId}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, deviceId: e.target.value }))}
          />
        </label>
        <label>
          Payload (JSON)
          <textarea
            value={createForm.payload}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, payload: e.target.value }))}
          />
        </label>
        <label>
          Author mode
          <select
            value={createForm.authorMode}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, authorMode: e.target.value }))}
          >
            <option value="wallet">Wallet (authorWalletId)</option>
            <option value="raw">Raw PEM keys</option>
          </select>
        </label>
        {createForm.authorMode === "wallet" ? (
          <label>
            Wallet ID
            <input
              type="text"
              value={createForm.walletId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, walletId: e.target.value }))}
            />
          </label>
        ) : (
          <>
            <label>
              Author public key (PEM)
              <textarea
                value={createForm.authorPublicKeyPem}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, authorPublicKeyPem: e.target.value }))
                }
              />
            </label>
            <label>
              Author private key (PEM)
              <textarea
                value={createForm.authorPrivateKeyPem}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, authorPrivateKeyPem: e.target.value }))
                }
              />
            </label>
          </>
        )}
        <button onClick={handleCreateBlock}>Submit block</button>
        <ResponseBox data={responses.createBlock} />
      </div>

      <div className="device">
        <h2>Decrypt block (/blocks/decrypt)</h2>
        <label>
          Block index
          <input
            type="number"
            value={decryptForm.index}
            onChange={(e) => setDecryptForm((prev) => ({ ...prev, index: e.target.value }))}
          />
        </label>
        <label>
          Device ID
          <input
            type="text"
            value={decryptForm.deviceId}
            onChange={(e) => setDecryptForm((prev) => ({ ...prev, deviceId: e.target.value }))}
          />
        </label>
        <button onClick={handleDecrypt}>Decrypt</button>
        <ResponseBox data={responses.decryptBlock} />
      </div>

      <div className="device">
        <h2>Latest block for device (/blocks/latest-for-device)</h2>
        <label>
          Device ID
          <input
            type="text"
            value={latestForm.deviceId}
            onChange={(e) => setLatestForm((prev) => ({ ...prev, deviceId: e.target.value }))}
          />
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={latestForm.includePlaintext}
            onChange={(e) =>
              setLatestForm((prev) => ({ ...prev, includePlaintext: e.target.checked }))
            }
          />
          Include plaintext
        </label>
        <button onClick={handleLatestForDevice}>Fetch latest</button>
        <ResponseBox data={responses.latestBlock} />
      </div>

      <div className="device">
        <h2>All blocks (/blocks/all)</h2>
        <label>
          Device ID (optional for plaintext decode)
          <input
            type="text"
            value={allForm.deviceId}
            onChange={(e) => setAllForm((prev) => ({ ...prev, deviceId: e.target.value }))}
          />
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={allForm.includePlaintext}
            onChange={(e) =>
              setAllForm((prev) => ({ ...prev, includePlaintext: e.target.checked }))
            }
          />
          Include plaintext
        </label>
        <button onClick={handleAllBlocks}>Fetch all</button>
        <ResponseBox data={responses.allBlocks} />
      </div>

      <div className="device">
        <h2>Create wallet (/wallets/create)</h2>
        <label>
          Owner token
          <input
            type="password"
            value={walletForm.ownerToken}
            onChange={(e) => setWalletForm((prev) => ({ ...prev, ownerToken: e.target.value }))}
          />
        </label>
        <button onClick={handleWalletCreate}>Create wallet</button>
        <ResponseBox data={responses.walletCreate} />
      </div>
    </div>
  );
}
