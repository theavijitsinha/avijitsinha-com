CREATE FUNCTION account_service.google_subject_matches(
  input_user_id UUID,
  input_google_subject TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_service.site_users
    WHERE id = input_user_id
      AND google_provider_subject = input_google_subject
  )
$$;

REVOKE ALL ON FUNCTION account_service.google_subject_matches(UUID, TEXT) FROM PUBLIC;
