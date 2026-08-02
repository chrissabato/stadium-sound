CREATE TABLE pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  install_id TEXT NOT NULL,
  app_version TEXT,
  platform TEXT,
  arch TEXT,
  os_release TEXT,
  total_mem_gb REAL,
  cpu_model TEXT,
  cpu_count INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_pings_install_id ON pings (install_id);
