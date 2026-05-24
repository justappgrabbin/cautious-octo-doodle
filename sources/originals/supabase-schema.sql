-- Supabase Schema for Synthia OS
-- Tables: files, apps, analyses, capabilities, agents, mobile_devices, mobile_commands

-- Files table (raw uploads)
create table files (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  size bigint,
  mime_type text,
  storage_path text,
  status text default 'uploaded', -- uploaded, analyzed, materialized, deployed
  analysis_id uuid references analyses(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Analyses table (MIR analysis results from HuggingFace models)
create table analyses (
  id uuid default gen_random_uuid() primary key,
  filename text,
  code_length int,
  model_output jsonb,
  detected_patterns text[],
  architecture text,
  complexity int,
  gates int[],
  confidence float,
  created_at timestamptz default now()
);

-- Apps table (materialized applications)
create table apps (
  id text primary key,
  name text not null,
  source text,
  type text, -- html, react, python, component
  manifest jsonb,
  deployed boolean default false,
  deploy_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Capabilities table (extracted from code)
create table capabilities (
  id text primary key,
  name text not null,
  type text, -- function, component, agent
  origin text, -- source file
  source text,
  proficiency float default 0.1,
  usage_count int default 0,
  last_used timestamptz,
  dependencies text[],
  extracted_at timestamptz default now()
);

-- Agents table
create table agents (
  id text primary key,
  name text not null,
  config jsonb,
  status text default 'idle',
  created_at timestamptz default now()
);

-- Mobile devices table
create table mobile_devices (
  id text primary key,
  name text,
  platform text, -- ios, android
  type text, -- simulator, emulator, real
  screen_size jsonb,
  status text default 'offline',
  last_seen timestamptz,
  created_at timestamptz default now()
);

-- Mobile commands queue
create table mobile_commands (
  id uuid default gen_random_uuid() primary key,
  device_id text references mobile_devices(id),
  action jsonb not null,
  status text default 'pending', -- pending, running, complete, failed
  result jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Storage bucket for raw files
-- create bucket 'uploads' with public access disabled
