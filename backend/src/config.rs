use std::{env, net::IpAddr, str::FromStr};

use crate::error::{ApiError, ApiResult};

#[derive(Clone)]
pub struct Config {
    pub host: IpAddr,
    pub port: u16,
    pub database_url: String,
    pub session_ttl_hours: i64,
    pub cors_allowed_origins: Vec<String>,
    pub admin_username: String,
    pub admin_email: String,
    pub admin_password: String,
}

impl Config {
    pub fn from_env() -> ApiResult<Self> {
        dotenvy::dotenv().ok();

        let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_owned());
        let port = env::var("PORT").unwrap_or_else(|_| "8080".to_owned());
        let session_ttl_hours = env::var("SESSION_TTL_HOURS").unwrap_or_else(|_| "168".to_owned());

        Ok(Self {
            host: IpAddr::from_str(&host)
                .map_err(|_| ApiError::configuration("HOST must be a valid IP address"))?,
            port: port
                .parse()
                .map_err(|_| ApiError::configuration("PORT must be a valid number"))?,
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite://data/grid-bot.sqlite".to_owned()),
            session_ttl_hours: session_ttl_hours
                .parse()
                .map_err(|_| ApiError::configuration("SESSION_TTL_HOURS must be a valid number"))?,
            cors_allowed_origins: env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_else(|_| "https://gridbot.aek-lab.space".to_owned())
                .split(',')
                .map(str::trim)
                .filter(|origin| !origin.is_empty())
                .map(str::to_owned)
                .collect(),
            admin_username: required("ADMIN_USERNAME")?,
            admin_email: required("ADMIN_EMAIL")?,
            admin_password: required("ADMIN_PASSWORD")?,
        })
    }
}

fn required(name: &str) -> ApiResult<String> {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ApiError::configuration(format!("{name} is required")))
}
