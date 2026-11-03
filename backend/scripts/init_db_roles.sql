-- Initialize database roles for Chordly (Local Development Only)
-- This script sets up an admin role for migrations/seeding and a read-only role for the API.

-- 1. Create admin role with full privileges on chordly database
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chordly_admin') THEN
      CREATE ROLE chordly_admin WITH LOGIN PASSWORD 'chordly_local_dev_password';
   END IF;
END
$do$;

-- 2. Create read-only role with SELECT-only privileges for the FastAPI web server
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chordly_reader') THEN
      CREATE ROLE chordly_reader WITH LOGIN PASSWORD 'chordly_local_reader_password';
   END IF;
END
$do$;

-- 3. Grant schema permissions
GRANT CONNECT ON DATABASE chordly TO chordly_admin;
GRANT CONNECT ON DATABASE chordly TO chordly_reader;

GRANT USAGE, CREATE ON SCHEMA public TO chordly_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO chordly_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO chordly_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO chordly_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO chordly_admin;

GRANT USAGE ON SCHEMA public TO chordly_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chordly_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chordly_reader;

-- Ensure reader cannot write
REVOKE CREATE ON SCHEMA public FROM chordly_reader;
