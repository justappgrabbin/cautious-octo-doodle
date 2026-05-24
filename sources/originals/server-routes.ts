// server/routes.ts
// Real routes for synthia-server.onrender.com
// Calls YOUR HuggingFace models, stores in YOUR Supabase

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Supabase client (server-side, with service role key)
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://leisphnjslcuepflefri.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// HuggingFace API key (yours)
const HF_TOKEN = process.env.HF_TOKEN || '';

// ─── INGEST ───
router.post('/api/ingest', async (req, res) => {
  try {
    const file = req.files?.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Store raw file in Supabase Storage
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(`raw/${Date.now()}_${file.name}`, file.data, {
        contentType: file.mimetype,
      });

    if (error) throw error;

    // Record in database
    const { data: record } = await supabase.from('files').insert({
      name: file.name,
      size: file.size,
      mime_type: file.mimetype,
      storage_path: data.path,
      status: 'uploaded',
      created_at: new Date().toISOString(),
    }).select();

    res.json({ success: true, fileId: record[0].id, path: data.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ANALYZE (calls YOUR HuggingFace model) ───
router.post('/api/analyze', async (req, res) => {
  try {
    const { code, filename } = req.body;

    // Call YOUR model on HuggingFace
    const modelRes = await fetch(
      'https://api-inference.huggingface.co/models/stellarproximology/code-analyzer-v1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: code }),
      }
    );

    const modelOutput = await modelRes.json();

    // Store analysis result
    const { data } = await supabase.from('analyses').insert({
      filename,
      code_length: code.length,
      model_output: modelOutput,
      created_at: new Date().toISOString(),
    }).select();

    res.json({ success: true, analysis: modelOutput, analysisId: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MODEL INFERENCE (your trident) ───
router.post('/api/model/:modelName', async (req, res) => {
  try {
    const { modelName } = req.params;
    const payload = req.body;

    const hfRes = await fetch(
      `https://api-inference.huggingface.co/models/stellarproximology/${modelName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await hfRes.json();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPABASE PROXY ───
router.post('/api/db/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { data, error } = await supabase.from(table).insert(req.body).select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/db/:table', async (req, res) => {
  try {
    const { table } = req.params;
    let query = supabase.from(table).select('*');

    // Apply filters from query params
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'limit' && key !== 'order') {
        query = query.eq(key, value);
      }
    });

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GITHUB SELF-EDIT ───
router.post('/api/github/propose', async (req, res) => {
  try {
    const { token, owner, repo, filePath, objective } = req.body;

    // Fetch current file from GitHub
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
    );
    const fileData = await fileRes.json();
    const currentCode = Buffer.from(fileData.content, 'base64').toString('utf8');

    // Call YOUR model to generate improvement
    const modelRes = await fetch(
      'https://api-inference.huggingface.co/models/stellarproximology/code-improver-v1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: {
            code: currentCode,
            objective: objective,
            filename: filePath,
          }
        }),
      }
    );

    const modelOutput = await modelRes.json();
    const proposedCode = modelOutput[0]?.generated_text || modelOutput.generated_text || currentCode;

    res.json({
      success: true,
      currentCode,
      proposedCode,
      reasoning: modelOutput.reasoning || 'Model-generated improvement',
      confidence: modelOutput.confidence || 0.75,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/github/deploy', async (req, res) => {
  try {
    const { token, owner, repo, filePath, content, message } = req.body;

    // Get current file SHA
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { 'Authorization': `token ${token}` } }
    );
    const fileData = await fileRes.json();

    // Create commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `AXIS: ${message}`,
          content: Buffer.from(content).toString('base64'),
          sha: fileData.sha,
          branch: 'axis-dev',
        }),
      }
    );

    const commitData = await commitRes.json();

    // Create PR
    const prRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `AXIS Self-Edit: ${message}`,
          head: 'axis-dev',
          base: 'main',
          body: 'Autonomous improvement proposed by AXIS',
        }),
      }
    );

    const prData = await prRes.json();
    res.json({ success: true, prUrl: prData.html_url, commit: commitData.commit.sha });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MOBILE MCP ───
router.get('/api/mobile/devices', async (req, res) => {
  // This would query your Termux daemon
  // For now, return configured devices from Supabase
  const { data } = await supabase.from('mobile_devices').select('*');
  res.json({ success: true, devices: data || [] });
});

router.post('/api/mobile/command', async (req, res) => {
  try {
    const { deviceId, action } = req.body;

    // Store command for Termux daemon to pick up
    const { data } = await supabase.from('mobile_commands').insert({
      device_id: deviceId,
      action: action,
      status: 'pending',
      created_at: new Date().toISOString(),
    }).select();

    res.json({ success: true, commandId: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
