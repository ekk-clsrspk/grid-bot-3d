use std::collections::HashMap;

use serde::Serialize;
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, FromRow)]
pub struct UserPublic {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub created_at: String,
    pub last_login_at: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: i64,
    pub role: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}

#[derive(Serialize)]
pub struct MessageResponse {
    pub message: &'static str,
}

#[derive(Serialize)]
pub struct ProgressResponse {
    pub unlocked: usize,
    pub stars: HashMap<String, i64>,
    #[serde(rename = "bestSteps")]
    pub best_steps: HashMap<String, i64>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SubmissionRecord {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub email: String,
    pub mission_id: String,
    pub code: String,
    pub route_json: String,
    pub steps: i64,
    pub stars: i64,
    pub duration_ms: i64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct SubmissionView {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub email: String,
    pub mission_id: String,
    pub code: String,
    pub route: Vec<[i32; 2]>,
    pub steps: i64,
    pub stars: i64,
    pub duration_ms: i64,
    pub created_at: String,
}

impl TryFrom<SubmissionRecord> for SubmissionView {
    type Error = serde_json::Error;

    fn try_from(record: SubmissionRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            user_id: record.user_id,
            username: record.username,
            email: record.email,
            mission_id: record.mission_id,
            code: record.code,
            route: serde_json::from_str(&record.route_json)?,
            steps: record.steps,
            stars: record.stars,
            duration_ms: record.duration_ms,
            created_at: record.created_at,
        })
    }
}

#[derive(Serialize, FromRow)]
pub struct AdminUserView {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub created_at: String,
    pub last_login_at: Option<String>,
    pub submission_count: i64,
    pub best_star_total: i64,
}

#[derive(Serialize)]
pub struct AdminOverview {
    pub total_users: i64,
    pub active_users: i64,
    pub suspended_users: i64,
    pub total_submissions: i64,
    pub average_duration_ms: i64,
    pub completion_rate: f64,
}

#[derive(Serialize)]
pub struct ListResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
}
