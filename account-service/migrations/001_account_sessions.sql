CREATE SCHEMA account_service;

CREATE TABLE account_service.site_users (
  id UUID PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE CHECK (length(firebase_uid) BETWEEN 1 AND 128),
  google_provider_subject TEXT NOT NULL UNIQUE CHECK (length(google_provider_subject) BETWEEN 1 AND 255),
  email TEXT CHECK (email IS NULL OR length(email) <= 320),
  display_name TEXT CHECK (display_name IS NULL OR length(display_name) <= 200),
  picture_url TEXT CHECK (picture_url IS NULL OR length(picture_url) <= 2048),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (updated_at >= created_at)
);

CREATE TABLE account_service.site_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES account_service.site_users(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  csrf_token_hash BYTEA NOT NULL CHECK (octet_length(csrf_token_hash) = 32),
  previous_token_hash BYTEA UNIQUE CHECK (previous_token_hash IS NULL OR octet_length(previous_token_hash) = 32),
  previous_token_valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  last_authenticated_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK ((previous_token_hash IS NULL) = (previous_token_valid_until IS NULL)),
  CHECK (last_seen_at >= created_at),
  CHECK (last_authenticated_at >= created_at - INTERVAL '1 day'),
  CHECK (last_authenticated_at <= created_at + INTERVAL '1 minute'),
  CHECK (rotated_at >= created_at),
  CHECK (idle_expires_at > last_seen_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX site_sessions_user_active
  ON account_service.site_sessions (user_id, idle_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE account_service.login_challenges (
  token_hash BYTEA PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  return_path TEXT NOT NULL CHECK (length(return_path) BETWEEN 1 AND 1024),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE FUNCTION account_service.issue_login_challenge(
  input_token_hash BYTEA,
  input_return_path TEXT,
  input_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM account_service.login_challenges
    WHERE expires_at < input_now - INTERVAL '1 day';
  INSERT INTO account_service.login_challenges (
    token_hash, return_path, created_at, expires_at
  ) VALUES (
    input_token_hash, input_return_path, input_now, input_now + INTERVAL '10 minutes'
  );
END
$$;

CREATE FUNCTION account_service.consume_login_challenge(
  input_token_hash BYTEA,
  input_now TIMESTAMPTZ
)
RETURNS TABLE (return_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN QUERY
  UPDATE account_service.login_challenges
    SET consumed_at = input_now
    WHERE token_hash = input_token_hash
      AND consumed_at IS NULL
      AND expires_at > input_now
    RETURNING login_challenges.return_path;
END
$$;

CREATE FUNCTION account_service.create_session(
  input_firebase_uid TEXT,
  input_google_provider_subject TEXT,
  input_email TEXT,
  input_display_name TEXT,
  input_picture_url TEXT,
  input_session_id UUID,
  input_token_hash BYTEA,
  input_csrf_token_hash BYTEA,
  input_authenticated_at TIMESTAMPTZ,
  input_now TIMESTAMPTZ,
  input_previous_browser_token_hash BYTEA DEFAULT NULL
)
RETURNS TABLE (user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  resolved_user_id UUID;
BEGIN
  INSERT INTO account_service.site_users (
    id, firebase_uid, google_provider_subject, email, display_name, picture_url, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), input_firebase_uid, input_google_provider_subject, input_email,
    input_display_name, input_picture_url, input_now, input_now
  )
  ON CONFLICT (firebase_uid) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    picture_url = EXCLUDED.picture_url,
    updated_at = input_now
  WHERE site_users.google_provider_subject = EXCLUDED.google_provider_subject
  RETURNING id INTO resolved_user_id;

  IF resolved_user_id IS NULL THEN
    RAISE EXCEPTION 'Verified identity binding changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF input_previous_browser_token_hash IS NOT NULL THEN
    UPDATE account_service.site_sessions
      SET revoked_at = input_now
      WHERE revoked_at IS NULL
        AND (
          token_hash = input_previous_browser_token_hash
          OR (previous_token_hash = input_previous_browser_token_hash
              AND previous_token_valid_until > input_now)
        );
  END IF;

  INSERT INTO account_service.site_sessions (
    id, user_id, token_hash, csrf_token_hash, created_at, last_seen_at,
    last_authenticated_at, rotated_at, idle_expires_at
  ) VALUES (
    input_session_id, resolved_user_id, input_token_hash, input_csrf_token_hash,
    input_now, input_now, input_authenticated_at, input_now, input_now + INTERVAL '30 days'
  );

  RETURN QUERY SELECT resolved_user_id;
END
$$;

CREATE FUNCTION account_service.resolve_session(
  input_token_hash BYTEA,
  input_csrf_token_hash BYTEA,
  input_now TIMESTAMPTZ,
  input_require_csrf BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  session_id UUID,
  user_id UUID,
  email TEXT,
  display_name TEXT,
  picture_url TEXT,
  rotated_at TIMESTAMPTZ,
  last_authenticated_at TIMESTAMPTZ,
  idle_expires_at TIMESTAMPTZ,
  matched_previous_token BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT s.id, s.user_id,
      (s.previous_token_hash = input_token_hash) AS used_previous
    FROM account_service.site_sessions s
    WHERE s.revoked_at IS NULL
      AND s.idle_expires_at > input_now
      AND (
        s.token_hash = input_token_hash
        OR (s.previous_token_hash = input_token_hash AND s.previous_token_valid_until > input_now)
      )
      AND (NOT input_require_csrf OR s.csrf_token_hash = input_csrf_token_hash)
    LIMIT 1
  ), refreshed AS (
    UPDATE account_service.site_sessions s
      SET last_seen_at = CASE
            WHEN s.last_seen_at <= input_now - INTERVAL '1 hour' THEN input_now
            ELSE s.last_seen_at
          END,
          idle_expires_at = CASE
            WHEN s.last_seen_at <= input_now - INTERVAL '1 hour' THEN input_now + INTERVAL '30 days'
            ELSE s.idle_expires_at
          END
      FROM matched m
      WHERE s.id = m.id
      RETURNING s.id, s.user_id, s.rotated_at, s.last_authenticated_at,
        s.idle_expires_at, m.used_previous
  )
  SELECT r.id, r.user_id, u.email, u.display_name, u.picture_url,
    r.rotated_at, r.last_authenticated_at, r.idle_expires_at, r.used_previous
  FROM refreshed r
  JOIN account_service.site_users u ON u.id = r.user_id;
END
$$;

CREATE FUNCTION account_service.rotate_session(
  input_session_id UUID,
  input_expected_token_hash BYTEA,
  input_new_token_hash BYTEA,
  input_new_csrf_token_hash BYTEA,
  input_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE account_service.site_sessions
    SET previous_token_hash = token_hash,
        previous_token_valid_until = input_now + INTERVAL '5 minutes',
        token_hash = input_new_token_hash,
        csrf_token_hash = input_new_csrf_token_hash,
        rotated_at = input_now
    WHERE id = input_session_id
      AND token_hash = input_expected_token_hash
      AND revoked_at IS NULL
      AND idle_expires_at > input_now
      AND rotated_at <= input_now - INTERVAL '7 days';
  RETURN FOUND;
END
$$;

CREATE FUNCTION account_service.revoke_session(
  input_token_hash BYTEA,
  input_csrf_token_hash BYTEA,
  input_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE account_service.site_sessions
    SET revoked_at = input_now
    WHERE revoked_at IS NULL
      AND csrf_token_hash = input_csrf_token_hash
      AND (
        token_hash = input_token_hash
        OR (previous_token_hash = input_token_hash AND previous_token_valid_until > input_now)
      );
  RETURN FOUND;
END
$$;

REVOKE ALL ON SCHEMA account_service FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA account_service FROM PUBLIC;
REVOKE ALL ON FUNCTION account_service.issue_login_challenge(BYTEA, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_service.consume_login_challenge(BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_service.create_session(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BYTEA, BYTEA, TIMESTAMPTZ, TIMESTAMPTZ, BYTEA) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_service.resolve_session(BYTEA, BYTEA, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_service.rotate_session(UUID, BYTEA, BYTEA, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_service.revoke_session(BYTEA, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
