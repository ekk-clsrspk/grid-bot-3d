mod auth;
mod config;
mod error;
mod missions;
mod models;
mod routes;

use std::{path::Path, str::FromStr, sync::Arc, time::Duration};

use axum::{
    Router,
    http::{
        HeaderValue, Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::{get, patch, post},
};
use config::Config;
use error::{ApiError, ApiResult};
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub struct AppState {
    db: SqlitePool,
    config: Config,
}

#[tokio::main]
async fn main() -> ApiResult<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "grid_bot_api=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    ensure_database_directory(&config.database_url)?;
    let connect_options = SqliteConnectOptions::from_str(&config.database_url)
        .map_err(|_| ApiError::configuration("DATABASE_URL is invalid"))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    let db = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(connect_options)
        .await?;

    sqlx::raw_sql(include_str!("../schema.sql"))
        .execute(&db)
        .await?;
    ensure_admin(&db, &config).await?;
    purge_expired_sessions(&db).await?;

    let address = (config.host, config.port);
    let cors = cors_layer(&config)?;
    let state = Arc::new(AppState { db, config });
    let app = Router::new()
        .route("/api/health", get(routes::health))
        .route("/api/auth/register", post(routes::register))
        .route("/api/auth/login", post(routes::login))
        .route("/api/auth/me", get(routes::me))
        .route("/api/auth/logout", post(routes::logout))
        .route(
            "/api/progress",
            get(routes::get_progress).delete(routes::reset_progress),
        )
        .route("/api/submissions", post(routes::create_submission))
        .route("/api/admin/overview", get(routes::admin_overview))
        .route(
            "/api/admin/users",
            get(routes::admin_users).post(routes::admin_create_user),
        )
        .route(
            "/api/admin/users/{id}",
            patch(routes::admin_update_user).delete(routes::admin_delete_user),
        )
        .route("/api/admin/submissions", get(routes::admin_submissions))
        .layer(cors)
        .with_state(state);

    let listener = TcpListener::bind(address)
        .await
        .map_err(|_| ApiError::configuration("Could not bind the configured host and port"))?;
    tracing::info!(?address, "Grid Bot API listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|_| ApiError::internal())
}

fn cors_layer(config: &Config) -> ApiResult<CorsLayer> {
    if config.cors_allowed_origins.is_empty() {
        return Err(ApiError::configuration(
            "CORS_ALLOWED_ORIGINS must contain at least one origin",
        ));
    }

    let origins = config
        .cors_allowed_origins
        .iter()
        .map(|origin| {
            HeaderValue::from_str(origin).map_err(|_| {
                ApiError::configuration("CORS_ALLOWED_ORIGINS contains an invalid origin")
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;

    Ok(CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE])
        .max_age(Duration::from_secs(3600)))
}

async fn ensure_admin(db: &SqlitePool, config: &Config) -> ApiResult<()> {
    if config.admin_password.chars().count() < 12 {
        return Err(ApiError::configuration(
            "ADMIN_PASSWORD must contain at least 12 characters",
        ));
    }
    let password_hash = auth::hash_password(config.admin_password.clone()).await?;
    let existing_admin: Option<i64> =
        sqlx::query_scalar("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
            .fetch_optional(db)
            .await?;

    let result = if let Some(admin_id) = existing_admin {
        sqlx::query(
            r#"
            UPDATE users
            SET username = ?, email = ?, password_hash = ?, status = 'active',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#,
        )
        .bind(config.admin_username.trim())
        .bind(config.admin_email.trim().to_lowercase())
        .bind(password_hash)
        .bind(admin_id)
        .execute(db)
        .await
    } else {
        sqlx::query(
            r#"
            INSERT INTO users (username, email, password_hash, role, status)
            VALUES (?, ?, ?, 'admin', 'active')
            "#,
        )
        .bind(config.admin_username.trim())
        .bind(config.admin_email.trim().to_lowercase())
        .bind(password_hash)
        .execute(db)
        .await
    };

    result.map_err(|error| {
        if matches!(&error, sqlx::Error::Database(database_error) if database_error.is_unique_violation())
        {
            ApiError::configuration(
                "ADMIN_USERNAME or ADMIN_EMAIL conflicts with an existing account",
            )
        } else {
            error.into()
        }
    })?;
    Ok(())
}

async fn purge_expired_sessions(db: &SqlitePool) -> ApiResult<()> {
    sqlx::query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP")
        .execute(db)
        .await?;
    Ok(())
}

fn ensure_database_directory(database_url: &str) -> ApiResult<()> {
    let Some(path) = database_url.strip_prefix("sqlite://") else {
        return Ok(());
    };
    let path = Path::new(path);
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|_| ApiError::configuration("Could not create the database directory"))?;
    }
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
