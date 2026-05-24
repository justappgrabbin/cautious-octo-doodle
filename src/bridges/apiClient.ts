// apiClient.ts
// Real connection to synthia-server.onrender.com
// No mock. No setTimeout. Actual fetch.

const API_BASE = 'https://synthia-server.onrender.com';
const HF_API = 'https://api-inference.huggingface.co/models/stellarproximology';
const SUPABASE_URL = 'https://leisphnjslcuepflefri.supabase.co';

export const SynthiaAPI = {
  // ─── INGESTION ───
  async ingestFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/api/ingest`, {
      method: 'POST',
      body: form,
    });
    return res.json();
  },

  // ─── ANALYSIS (calls YOUR HuggingFace models) ───
  async analyzeCode(code: string, filename: string) {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, filename }),
    });
    return res.json();
  },

  // ─── MODEL INFERENCE (your trident) ───
  async runModel(modelName: string, payload: any) {
    // modelName = 'stellarproximology/model-name'
    const res = await fetch(`${API_BASE}/api/model/${modelName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // ─── SUPABASE PROXY (through your server for auth) ───
  async saveToSupabase(table: string, data: any) {
    const res = await fetch(`${API_BASE}/api/db/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async loadFromSupabase(table: string, query?: any) {
    const q = query ? '?' + new URLSearchParams(query).toString() : '';
    const res = await fetch(`${API_BASE}/api/db/${table}${q}`);
    return res.json();
  },

  // ─── GITHUB (self-edit through your server) ───
  async proposeChange(token: string, owner: string, repo: string, filePath: string, objective: string) {
    const res = await fetch(`${API_BASE}/api/github/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, owner, repo, filePath, objective }),
    });
    return res.json();
  },

  async deployChange(token: string, owner: string, repo: string, filePath: string, content: string, message: string) {
    const res = await fetch(`${API_BASE}/api/github/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, owner, repo, filePath, content, message }),
    });
    return res.json();
  },

  // ─── MOBILE MCP (through your server → Termux) ───
  async mobileCommand(deviceId: string, action: any) {
    const res = await fetch(`${API_BASE}/api/mobile/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, action }),
    });
    return res.json();
  },

  async listMobileDevices() {
    const res = await fetch(`${API_BASE}/api/mobile/devices`);
    return res.json();
  },
};
