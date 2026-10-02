import type { Pool, PoolClient } from "pg";

interface DeploymentRole {
  readonly rolname: string;
  readonly rolcanlogin: boolean;
  readonly rolinherit: boolean;
  readonly rolsuper: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolreplication: boolean;
  readonly rolbypassrls: boolean;
}

interface RoleGrant {
  readonly granted_role_name: string;
}

export function quoteRoleIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("PostgreSQL role names must be safe unquoted identifiers");
  }
  return `"${value}"`;
}

async function readRoleGrants(client: PoolClient, memberName: string): Promise<readonly RoleGrant[]> {
  const result = await client.query<RoleGrant>(`
    SELECT granted_role.rolname AS granted_role_name
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles AS member ON member.oid = membership.member
    WHERE member.rolname = $1
    ORDER BY granted_role.rolname
  `, [memberName]);
  return result.rows;
}

async function validateDeploymentRolesWithClient(
  client: PoolClient,
  runtimeLoginName: string,
): Promise<void> {
  const identity = await client.query<{
    current_user: string;
    session_user: string;
    database_owner: string;
  }>(`
    SELECT
      current_user,
      session_user,
      pg_get_userbyid(database.datdba) AS database_owner
    FROM pg_database AS database
    WHERE database.datname = current_database()
  `);
  const databaseIdentity = identity.rows[0];
  if (
    !databaseIdentity
    || databaseIdentity.current_user !== databaseIdentity.session_user
    || databaseIdentity.current_user !== databaseIdentity.database_owner
    || databaseIdentity.current_user === runtimeLoginName
  ) {
    throw new Error("Account migrations require the separate database-owner login");
  }
  const migrationLoginName = databaseIdentity.session_user;

  const roles = await client.query<DeploymentRole>(`
    SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
      rolreplication, rolbypassrls
    FROM pg_roles
    WHERE rolname = ANY($1::TEXT[])
    ORDER BY rolname
  `, [[runtimeLoginName, migrationLoginName]]);
  const runtimeLogin = roles.rows.find(role => role.rolname === runtimeLoginName);
  const migrationLogin = roles.rows.find(role => role.rolname === migrationLoginName);
  if (
    !runtimeLogin
    || !runtimeLogin.rolcanlogin
    || runtimeLogin.rolinherit
    || runtimeLogin.rolsuper
    || runtimeLogin.rolcreatedb
    || runtimeLogin.rolcreaterole
    || runtimeLogin.rolreplication
    || runtimeLogin.rolbypassrls
    || !migrationLogin
    || !migrationLogin.rolcanlogin
    || migrationLogin.rolinherit
    || migrationLogin.rolsuper
    || migrationLogin.rolcreatedb
    || migrationLogin.rolcreaterole
    || migrationLogin.rolreplication
    || migrationLogin.rolbypassrls
  ) {
    throw new Error("The account PostgreSQL deployment roles are not least privilege");
  }

  if ((await readRoleGrants(client, runtimeLoginName)).length !== 0) {
    throw new Error("The account PostgreSQL runtime login has an unexpected parent role");
  }
  if ((await readRoleGrants(client, migrationLoginName)).length !== 0) {
    throw new Error("The account PostgreSQL migration login has an unexpected parent role");
  }
}

export async function validateDeploymentRoles(pool: Pool, runtimeLoginName: string): Promise<void> {
  quoteRoleIdentifier(runtimeLoginName);
  const client = await pool.connect();
  try {
    await validateDeploymentRolesWithClient(client, runtimeLoginName);
  } finally {
    client.release();
  }
}

export async function configureRuntimePrivileges(pool: Pool, runtimeLoginName: string): Promise<void> {
  const runtimeLogin = quoteRoleIdentifier(runtimeLoginName);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('avijitsinha-account-role-configuration'), hashtext(current_database()))");
    await validateDeploymentRolesWithClient(client, runtimeLoginName);

    await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON SCHEMA account_service FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA account_service FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA account_service FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_service FROM PUBLIC");
    await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA account_service REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC");

    await client.query(`REVOKE ALL ON SCHEMA public FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON SCHEMA account_service FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA account_service FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA account_service FROM ${runtimeLogin}`);
    await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_service FROM ${runtimeLogin}`);
    await client.query(`GRANT USAGE ON SCHEMA account_service TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.issue_login_challenge(BYTEA, TEXT, TIMESTAMPTZ) TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.consume_login_challenge(BYTEA, TIMESTAMPTZ) TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.create_session(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BYTEA, BYTEA, TIMESTAMPTZ, TIMESTAMPTZ, BYTEA) TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.resolve_session(BYTEA, BYTEA, TIMESTAMPTZ, BOOLEAN) TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.rotate_session(UUID, BYTEA, BYTEA, BYTEA, TIMESTAMPTZ) TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.revoke_session(BYTEA, BYTEA, TIMESTAMPTZ) TO ${runtimeLogin}`);
    await client.query(`GRANT EXECUTE ON FUNCTION account_service.google_subject_matches(UUID, TEXT) TO ${runtimeLogin}`);

    await validateDeploymentRolesWithClient(client, runtimeLoginName);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the configuration error. */ }
    throw error;
  } finally {
    client.release();
  }
}
