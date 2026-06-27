use std::sync::Arc;

use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng as PasswordOsRng},
};
use axum::http::{HeaderMap, header::AUTHORIZATION};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};

use crate::{
    AppState,
    error::{ApiError, ApiResult},
    models::{AuthUser, UserPublic},
};

pub async fn hash_password(password: String) -> ApiResult<String> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut PasswordOsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|_| ApiError::internal())
    })
    .await
    .map_err(|_| ApiError::internal())?
}

pub async fn verify_password(password: String, encoded: String) -> ApiResult<bool> {
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&encoded).map_err(|_| ApiError::internal())?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    })
    .await
    .map_err(|_| ApiError::internal())?
}

pub async fn issue_session(state: &Arc<AppState>, user_id: i64) -> ApiResult<String> {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token = URL_SAFE_NO_PAD.encode(bytes);
    let token_hash = hash_token(&token);
    let expires_at = Utc::now() + Duration::hours(state.config.session_ttl_hours);

    sqlx::query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind(token_hash)
        .bind(expires_at.format("%Y-%m-%d %H:%M:%S").to_string())
        .execute(&state.db)
        .await?;

    Ok(token)
}

pub async fn authenticate(headers: &HeaderMap, state: &Arc<AppState>) -> ApiResult<AuthUser> {
    let token = bearer_token(headers)?;
    let token_hash = hash_token(token);
    let user = sqlx::query_as::<_, AuthUserRow>(
        r#"
        SELECT u.id, u.role, u.status
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
        "#,
    )
    .bind(token_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::unauthorized("Your session is invalid or expired"))?;

    if user.status == "suspended" {
        return Err(ApiError::forbidden("This account is suspended"));
    }

    Ok(AuthUser {
        id: user.id,
        role: user.role,
    })
}

pub async fn require_admin(headers: &HeaderMap, state: &Arc<AppState>) -> ApiResult<AuthUser> {
    let user = authenticate(headers, state).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden("Administrator access is required"));
    }
    Ok(user)
}

pub async fn public_user(state: &Arc<AppState>, user_id: i64) -> ApiResult<UserPublic> {
    sqlx::query_as::<_, UserPublic>(
        r#"
        SELECT id, username, email, role, status, created_at, last_login_at
        FROM users WHERE id = ?
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("User not found"))
}

pub fn bearer_token(headers: &HeaderMap) -> ApiResult<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::unauthorized("A bearer token is required"))
}

pub fn hash_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

#[derive(sqlx::FromRow)]
struct AuthUserRow {
    id: i64,
    role: String,
    status: String,
}
