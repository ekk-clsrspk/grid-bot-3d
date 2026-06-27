use std::{collections::HashMap, sync::Arc};

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row, Sqlite};

use crate::{
    AppState,
    auth::{
        authenticate, bearer_token, hash_password, hash_token, issue_session, public_user,
        require_admin, verify_password,
    },
    error::{ApiError, ApiResult},
    missions::{MISSIONS, mission, parse_and_simulate},
    models::{
        AdminOverview, AdminUserView, AuthResponse, ListResponse, MessageResponse,
        ProgressResponse, SubmissionRecord, SubmissionView, UserPublic,
    },
};

const AVERAGE_DURATION_QUERY: &str = r#"
    SELECT CAST(COALESCE(ROUND(AVG(duration_ms)), 0) AS INTEGER)
    FROM submissions
"#;

#[derive(Deserialize)]
pub struct RegisterRequest {
    username: String,
    email: String,
    password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    login: String,
    password: String,
}

#[derive(Deserialize)]
pub struct SubmissionRequest {
    mission_id: String,
    code: String,
    duration_ms: i64,
}

#[derive(Serialize)]
pub struct SubmissionResponse {
    submission: SubmissionView,
    progress: ProgressResponse,
}

#[derive(Deserialize, Default)]
pub struct UserListQuery {
    search: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct SubmissionListQuery {
    search: Option<String>,
    mission_id: Option<String>,
    user_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    username: String,
    email: String,
    password: String,
}

#[derive(Deserialize)]
pub struct UpdateUserRequest {
    username: Option<String>,
    email: Option<String>,
    password: Option<String>,
    status: Option<String>,
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> ApiResult<(StatusCode, Json<AuthResponse>)> {
    let username = validate_username(&payload.username)?;
    let email = validate_email(&payload.email)?;
    validate_password(&payload.password)?;
    let password_hash = hash_password(payload.password).await?;

    let result = sqlx::query(
        r#"
        INSERT INTO users (username, email, password_hash, role, status)
        VALUES (?, ?, ?, 'user', 'active')
        "#,
    )
    .bind(&username)
    .bind(&email)
    .bind(password_hash)
    .execute(&state.db)
    .await;

    let user_id = match result {
        Ok(result) => result.last_insert_rowid(),
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::conflict(
                "That username or email address is already in use",
            ));
        }
        Err(error) => return Err(error.into()),
    };

    let token = issue_session(&state, user_id).await?;
    let user = public_user(&state, user_id).await?;
    Ok((StatusCode::CREATED, Json(AuthResponse { token, user })))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let login = payload.login.trim();
    if login.is_empty() || payload.password.is_empty() {
        return Err(ApiError::bad_request("Login and password are required"));
    }

    let row = sqlx::query(
        r#"
        SELECT id, password_hash, status
        FROM users
        WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
        LIMIT 1
        "#,
    )
    .bind(login)
    .bind(login)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::unauthorized("Incorrect username, email, or password"))?;

    let user_id: i64 = row.get("id");
    let encoded: String = row.get("password_hash");
    let status: String = row.get("status");
    if !verify_password(payload.password, encoded).await? {
        return Err(ApiError::unauthorized(
            "Incorrect username, email, or password",
        ));
    }
    if status == "suspended" {
        return Err(ApiError::forbidden("This account is suspended"));
    }

    sqlx::query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    let token = issue_session(&state, user_id).await?;
    let user = public_user(&state, user_id).await?;
    Ok(Json(AuthResponse { token, user }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<UserPublic>> {
    let auth = authenticate(&headers, &state).await?;
    Ok(Json(public_user(&state, auth.id).await?))
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<MessageResponse>> {
    let token = bearer_token(&headers)?;
    sqlx::query("DELETE FROM sessions WHERE token_hash = ?")
        .bind(hash_token(token))
        .execute(&state.db)
        .await?;
    Ok(Json(MessageResponse {
        message: "Signed out",
    }))
}

pub async fn get_progress(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<ProgressResponse>> {
    let auth = authenticate(&headers, &state).await?;
    if auth.role == "admin" {
        return Err(ApiError::forbidden(
            "Administrator accounts cannot access gameplay",
        ));
    }
    Ok(Json(progress_for_user(&state, auth.id).await?))
}

pub async fn reset_progress(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<ProgressResponse>> {
    let auth = authenticate(&headers, &state).await?;
    if auth.role == "admin" {
        return Err(ApiError::forbidden(
            "Administrator accounts cannot access gameplay",
        ));
    }
    sqlx::query("DELETE FROM submissions WHERE user_id = ?")
        .bind(auth.id)
        .execute(&state.db)
        .await?;
    Ok(Json(empty_progress()))
}

pub async fn create_submission(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<SubmissionRequest>,
) -> ApiResult<(StatusCode, Json<SubmissionResponse>)> {
    let auth = authenticate(&headers, &state).await?;
    if auth.role == "admin" {
        return Err(ApiError::forbidden(
            "Administrator accounts cannot submit gameplay results",
        ));
    }
    if payload.code.len() > 10_000 {
        return Err(ApiError::bad_request("Submitted code is too long"));
    }
    if !(0..=86_400_000).contains(&payload.duration_ms) {
        return Err(ApiError::bad_request(
            "Duration must be between 0 and 24 hours",
        ));
    }

    let selected_mission =
        mission(&payload.mission_id).ok_or_else(|| ApiError::not_found("Mission not found"))?;
    let progress = progress_for_user(&state, auth.id).await?;
    let mission_index = MISSIONS
        .iter()
        .position(|candidate| candidate.id == selected_mission.id)
        .ok_or_else(ApiError::internal)?;
    if mission_index >= progress.unlocked {
        return Err(ApiError::forbidden("Complete earlier missions first"));
    }

    let simulation = parse_and_simulate(selected_mission, &payload.code)?;
    let route_json = serde_json::to_string(&simulation.route).map_err(|_| ApiError::internal())?;
    let result = sqlx::query(
        r#"
        INSERT INTO submissions
          (user_id, mission_id, code, route_json, steps, stars, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(auth.id)
    .bind(selected_mission.id)
    .bind(payload.code)
    .bind(route_json)
    .bind(simulation.steps)
    .bind(simulation.stars)
    .bind(payload.duration_ms)
    .execute(&state.db)
    .await?;

    let submission = submission_by_id(&state, result.last_insert_rowid()).await?;
    let progress = progress_for_user(&state, auth.id).await?;
    Ok((
        StatusCode::CREATED,
        Json(SubmissionResponse {
            submission,
            progress,
        }),
    ))
}

pub async fn admin_overview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<AdminOverview>> {
    require_admin(&headers, &state).await?;

    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'user'")
        .fetch_one(&state.db)
        .await?;
    let active_users: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'user' AND status = 'active'")
            .fetch_one(&state.db)
            .await?;
    let suspended_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE role = 'user' AND status = 'suspended'",
    )
    .fetch_one(&state.db)
    .await?;
    let total_submissions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM submissions")
        .fetch_one(&state.db)
        .await?;
    let average_duration_ms: i64 = sqlx::query_scalar(AVERAGE_DURATION_QUERY)
        .fetch_one(&state.db)
        .await?;
    let completed_pairs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (SELECT 1 FROM submissions GROUP BY user_id, mission_id)",
    )
    .fetch_one(&state.db)
    .await?;
    let completion_rate = if total_users == 0 {
        0.0
    } else {
        (completed_pairs as f64 / (total_users as f64 * MISSIONS.len() as f64) * 100.0).min(100.0)
    };

    Ok(Json(AdminOverview {
        total_users,
        active_users,
        suspended_users,
        total_submissions,
        average_duration_ms,
        completion_rate,
    }))
}

pub async fn admin_users(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(filters): Query<UserListQuery>,
) -> ApiResult<Json<ListResponse<AdminUserView>>> {
    require_admin(&headers, &state).await?;

    let search = filters.search.unwrap_or_default().trim().to_owned();
    let status = filters.status.unwrap_or_else(|| "all".to_owned());
    if !["all", "active", "suspended"].contains(&status.as_str()) {
        return Err(ApiError::bad_request("Invalid status filter"));
    }

    let mut query = QueryBuilder::<Sqlite>::new(
        r#"
        SELECT
          u.id, u.username, u.email, u.role, u.status, u.created_at, u.last_login_at,
          COUNT(s.id) AS submission_count,
          COALESCE((
            SELECT SUM(best_stars) FROM (
              SELECT MAX(stars) AS best_stars
              FROM submissions ss
              WHERE ss.user_id = u.id
              GROUP BY mission_id
            )
          ), 0) AS best_star_total
        FROM users u
        LEFT JOIN submissions s ON s.user_id = u.id
        WHERE u.role = 'user'
        "#,
    );
    if !search.is_empty() {
        let pattern = format!("%{search}%");
        query
            .push(" AND (u.username LIKE ")
            .push_bind(pattern.clone())
            .push(" OR u.email LIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if status != "all" {
        query.push(" AND u.status = ").push_bind(status);
    }
    query.push(" GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500");

    let items = query
        .build_query_as::<AdminUserView>()
        .fetch_all(&state.db)
        .await?;
    let total = items.len() as i64;
    Ok(Json(ListResponse { items, total }))
}

pub async fn admin_create_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CreateUserRequest>,
) -> ApiResult<(StatusCode, Json<UserPublic>)> {
    require_admin(&headers, &state).await?;
    let username = validate_username(&payload.username)?;
    let email = validate_email(&payload.email)?;
    validate_password(&payload.password)?;
    let password_hash = hash_password(payload.password).await?;

    let result = sqlx::query(
        r#"
        INSERT INTO users (username, email, password_hash, role, status)
        VALUES (?, ?, ?, 'user', 'active')
        "#,
    )
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .execute(&state.db)
    .await;

    let user_id = match result {
        Ok(result) => result.last_insert_rowid(),
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::conflict(
                "That username or email address is already in use",
            ));
        }
        Err(error) => return Err(error.into()),
    };

    Ok((
        StatusCode::CREATED,
        Json(public_user(&state, user_id).await?),
    ))
}

pub async fn admin_update_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
    Json(payload): Json<UpdateUserRequest>,
) -> ApiResult<Json<UserPublic>> {
    require_admin(&headers, &state).await?;
    let current = public_user(&state, user_id).await?;
    if current.role == "admin" {
        return Err(ApiError::forbidden(
            "The environment-managed admin account cannot be edited here",
        ));
    }

    let username = match payload.username {
        Some(value) => validate_username(&value)?,
        None => current.username,
    };
    let email = match payload.email {
        Some(value) => validate_email(&value)?,
        None => current.email,
    };
    let status = payload.status.unwrap_or(current.status);
    if !["active", "suspended"].contains(&status.as_str()) {
        return Err(ApiError::bad_request("Status must be active or suspended"));
    }

    let result = if let Some(password) = payload.password.filter(|value| !value.is_empty()) {
        validate_password(&password)?;
        let password_hash = hash_password(password).await?;
        sqlx::query(
            r#"
            UPDATE users
            SET username = ?, email = ?, status = ?, password_hash = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#,
        )
        .bind(username)
        .bind(email)
        .bind(&status)
        .bind(password_hash)
        .bind(user_id)
        .execute(&state.db)
        .await
    } else {
        sqlx::query(
            r#"
            UPDATE users
            SET username = ?, email = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#,
        )
        .bind(username)
        .bind(email)
        .bind(&status)
        .bind(user_id)
        .execute(&state.db)
        .await
    };

    match result {
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::conflict(
                "That username or email address is already in use",
            ));
        }
        Err(error) => return Err(error.into()),
    }

    if status == "suspended" {
        sqlx::query("DELETE FROM sessions WHERE user_id = ?")
            .bind(user_id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(public_user(&state, user_id).await?))
}

pub async fn admin_delete_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
) -> ApiResult<StatusCode> {
    require_admin(&headers, &state).await?;
    let user = public_user(&state, user_id).await?;
    if user.role == "admin" {
        return Err(ApiError::forbidden(
            "The environment-managed admin account cannot be deleted",
        ));
    }

    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(user_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn admin_submissions(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(filters): Query<SubmissionListQuery>,
) -> ApiResult<Json<ListResponse<SubmissionView>>> {
    require_admin(&headers, &state).await?;

    let mut query = QueryBuilder::<Sqlite>::new(
        r#"
        SELECT
          s.id, s.user_id, u.username, u.email, s.mission_id, s.code,
          s.route_json, s.steps, s.stars, s.duration_ms, s.created_at
        FROM submissions s
        JOIN users u ON u.id = s.user_id
        WHERE 1 = 1
        "#,
    );
    if let Some(user_id) = filters.user_id {
        query.push(" AND s.user_id = ").push_bind(user_id);
    }
    if let Some(mission_id) = filters
        .mission_id
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty() && value != "all")
    {
        query.push(" AND s.mission_id = ").push_bind(mission_id);
    }
    if let Some(search) = filters
        .search
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    {
        let pattern = format!("%{search}%");
        query
            .push(" AND (u.username LIKE ")
            .push_bind(pattern.clone())
            .push(" OR u.email LIKE ")
            .push_bind(pattern.clone())
            .push(" OR s.code LIKE ")
            .push_bind(pattern)
            .push(")");
    }
    query.push(" ORDER BY s.created_at DESC LIMIT 500");

    let records = query
        .build_query_as::<SubmissionRecord>()
        .fetch_all(&state.db)
        .await?;
    let items = records
        .into_iter()
        .map(SubmissionView::try_from)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| ApiError::internal())?;
    let total = items.len() as i64;
    Ok(Json(ListResponse { items, total }))
}

async fn progress_for_user(state: &Arc<AppState>, user_id: i64) -> ApiResult<ProgressResponse> {
    let rows = sqlx::query(
        r#"
        SELECT mission_id, MAX(stars) AS stars, MIN(steps) AS best_steps
        FROM submissions
        WHERE user_id = ?
        GROUP BY mission_id
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let mut stars = HashMap::new();
    let mut best_steps = HashMap::new();
    for row in rows {
        let mission_id: String = row.get("mission_id");
        stars.insert(mission_id.clone(), row.get("stars"));
        best_steps.insert(mission_id, row.get("best_steps"));
    }

    let unlocked = MISSIONS
        .iter()
        .enumerate()
        .fold(1, |highest, (index, mission)| {
            if stars.get(mission.id).copied().unwrap_or(0) > 0 {
                highest.max((index + 2).min(MISSIONS.len()))
            } else {
                highest
            }
        });

    Ok(ProgressResponse {
        unlocked,
        stars,
        best_steps,
    })
}

fn empty_progress() -> ProgressResponse {
    ProgressResponse {
        unlocked: 1,
        stars: HashMap::new(),
        best_steps: HashMap::new(),
    }
}

async fn submission_by_id(state: &Arc<AppState>, id: i64) -> ApiResult<SubmissionView> {
    let record = sqlx::query_as::<_, SubmissionRecord>(
        r#"
        SELECT
          s.id, s.user_id, u.username, u.email, s.mission_id, s.code,
          s.route_json, s.steps, s.stars, s.duration_ms, s.created_at
        FROM submissions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    SubmissionView::try_from(record).map_err(|_| ApiError::internal())
}

fn validate_username(value: &str) -> ApiResult<String> {
    let username = value.trim();
    if !(3..=32).contains(&username.chars().count()) {
        return Err(ApiError::bad_request(
            "Username must be between 3 and 32 characters",
        ));
    }
    if !username
        .chars()
        .all(|character| character.is_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err(ApiError::bad_request(
            "Username may only contain letters, numbers, hyphens, and underscores",
        ));
    }
    Ok(username.to_owned())
}

fn validate_email(value: &str) -> ApiResult<String> {
    let email = value.trim().to_lowercase();
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 || parts[0].is_empty() || !parts[1].contains('.') || email.len() > 254 {
        return Err(ApiError::bad_request("Enter a valid email address"));
    }
    Ok(email)
}

fn validate_password(value: &str) -> ApiResult<()> {
    if !(8..=128).contains(&value.chars().count()) {
        return Err(ApiError::bad_request(
            "Password must be between 8 and 128 characters",
        ));
    }
    Ok(())
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(database_error)
            if database_error.code().is_some_and(|code| code == "2067" || code == "1555")
    )
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::AVERAGE_DURATION_QUERY;

    #[tokio::test]
    async fn average_duration_is_an_integer_with_or_without_submissions() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database");
        sqlx::raw_sql(include_str!("../schema.sql"))
            .execute(&pool)
            .await
            .expect("schema");

        let empty_average: i64 = sqlx::query_scalar(AVERAGE_DURATION_QUERY)
            .fetch_one(&pool)
            .await
            .expect("empty average");
        assert_eq!(empty_average, 0);

        let user_id = sqlx::query(
            r#"
            INSERT INTO users (username, email, password_hash)
            VALUES ('test-user', 'test@example.com', 'unused')
            "#,
        )
        .execute(&pool)
        .await
        .expect("user")
        .last_insert_rowid();

        for duration_ms in [1_000_i64, 2_001_i64] {
            sqlx::query(
                r#"
                INSERT INTO submissions
                  (user_id, mission_id, code, route_json, steps, stars, duration_ms)
                VALUES (?, 'warmup', 'right', '[[0,0],[1,0]]', 1, 3, ?)
                "#,
            )
            .bind(user_id)
            .bind(duration_ms)
            .execute(&pool)
            .await
            .expect("submission");
        }

        let populated_average: i64 = sqlx::query_scalar(AVERAGE_DURATION_QUERY)
            .fetch_one(&pool)
            .await
            .expect("populated average");
        assert_eq!(populated_average, 1_501);
    }
}
