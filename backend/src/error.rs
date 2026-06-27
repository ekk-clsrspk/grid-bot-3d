use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("{message}")]
    Client {
        status: StatusCode,
        code: &'static str,
        message: String,
    },
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("configuration error: {0}")]
    Configuration(String),
    #[error("internal server error")]
    Internal,
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    code: &'static str,
    message: String,
}

impl ApiError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::client(StatusCode::BAD_REQUEST, "bad_request", message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::client(StatusCode::UNAUTHORIZED, "unauthorized", message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::client(StatusCode::FORBIDDEN, "forbidden", message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::client(StatusCode::NOT_FOUND, "not_found", message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::client(StatusCode::CONFLICT, "conflict", message)
    }

    pub fn configuration(message: impl Into<String>) -> Self {
        Self::Configuration(message.into())
    }

    pub fn internal() -> Self {
        Self::Internal
    }

    fn client(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self::Client {
            status,
            code,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            Self::Client {
                status,
                code,
                message,
            } => (status, code, message),
            Self::Configuration(message) => {
                tracing::error!(%message, "configuration error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "configuration_error",
                    "Server configuration is invalid".to_owned(),
                )
            }
            Self::Database(error) => {
                tracing::error!(%error, "database request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "database_error",
                    "The database request failed".to_owned(),
                )
            }
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "An internal server error occurred".to_owned(),
            ),
        };

        (
            status,
            Json(ErrorBody {
                error: ErrorDetail { code, message },
            }),
        )
            .into_response()
    }
}
