use std::collections::HashMap;

use crate::error::{ApiError, ApiResult};

pub struct Mission {
    pub id: &'static str,
    pub size: i32,
    pub start: [i32; 2],
    pub goal: [i32; 2],
    pub par: i32,
    pub obstacles: &'static [[i32; 2]],
}

#[derive(Debug)]
pub struct Simulation {
    pub route: Vec<[i32; 2]>,
    pub steps: i32,
    pub stars: i32,
}

const WARMUP_OBSTACLES: &[[i32; 2]] = &[[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]];

const ZIGZAG_OBSTACLES: &[[i32; 2]] = &[
    [0, 2],
    [1, 2],
    [4, 1],
    [5, 1],
    [5, 2],
    [1, 4],
    [5, 4],
    [0, 5],
    [1, 5],
    [3, 5],
    [5, 5],
];

const FORTRESS_OBSTACLES: &[[i32; 2]] = &[
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [6, 1],
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
    [7, 7],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [1, 4],
    [5, 4],
    [1, 5],
    [3, 5],
    [4, 5],
    [5, 5],
    [1, 6],
    [5, 6],
    [1, 7],
    [2, 7],
    [3, 7],
    [5, 7],
    [6, 7],
];

const LABYRINTH_OBSTACLES: &[[i32; 2]] = &[
    [3, 0],
    [5, 0],
    [7, 0],
    [10, 0],
    [1, 1],
    [3, 1],
    [5, 1],
    [7, 1],
    [8, 1],
    [10, 1],
    [11, 1],
    [12, 1],
    [1, 2],
    [5, 2],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [6, 3],
    [7, 3],
    [8, 3],
    [9, 3],
    [10, 3],
    [11, 3],
    [12, 3],
    [12, 4],
    [0, 5],
    [1, 5],
    [2, 5],
    [3, 5],
    [5, 5],
    [6, 5],
    [7, 5],
    [8, 5],
    [9, 5],
    [11, 5],
    [12, 5],
    [3, 6],
    [5, 6],
    [7, 6],
    [11, 6],
    [1, 7],
    [3, 7],
    [7, 7],
    [9, 7],
    [10, 7],
    [13, 7],
    [0, 8],
    [1, 8],
    [3, 8],
    [4, 8],
    [5, 8],
    [7, 8],
    [9, 8],
    [12, 8],
    [13, 8],
    [3, 9],
    [7, 9],
    [11, 9],
    [1, 10],
    [2, 10],
    [3, 10],
    [5, 10],
    [7, 10],
    [8, 10],
    [9, 10],
    [10, 10],
    [11, 10],
    [12, 10],
    [5, 11],
    [8, 11],
    [0, 12],
    [1, 12],
    [2, 12],
    [3, 12],
    [4, 12],
    [5, 12],
    [6, 12],
    [8, 12],
    [10, 12],
    [12, 12],
    [13, 12],
    [10, 13],
];

pub static MISSIONS: &[Mission] = &[
    Mission {
        id: "warmup",
        size: 5,
        start: [0, 0],
        goal: [4, 4],
        par: 8,
        obstacles: WARMUP_OBSTACLES,
    },
    Mission {
        id: "zigzag",
        size: 7,
        start: [1, 1],
        goal: [4, 5],
        par: 9,
        obstacles: ZIGZAG_OBSTACLES,
    },
    Mission {
        id: "fortress",
        size: 9,
        start: [0, 0],
        goal: [4, 4],
        par: 28,
        obstacles: FORTRESS_OBSTACLES,
    },
    Mission {
        id: "labyrinth",
        size: 14,
        start: [7, 13],
        goal: [6, 0],
        par: 46,
        obstacles: LABYRINTH_OBSTACLES,
    },
];

pub fn mission(id: &str) -> Option<&'static Mission> {
    MISSIONS.iter().find(|mission| mission.id == id)
}

pub fn parse_and_simulate(mission: &Mission, source: &str) -> ApiResult<Simulation> {
    let commands = parse_commands(source)?;
    if commands.is_empty() {
        return Err(ApiError::bad_request("Submit at least one command"));
    }

    let mut current = mission.start;
    let mut route = vec![current];

    for command in commands {
        let delta = match command.as_str() {
            "up" => [0, -1],
            "down" => [0, 1],
            "left" => [-1, 0],
            "right" => [1, 0],
            _ => return Err(ApiError::internal()),
        };
        let next = [current[0] + delta[0], current[1] + delta[1]];

        if next[0] < 0 || next[1] < 0 || next[0] >= mission.size || next[1] >= mission.size {
            return Err(ApiError::bad_request(
                "The submitted route leaves the board",
            ));
        }
        if mission.obstacles.contains(&next) {
            return Err(ApiError::bad_request(
                "The submitted route hits an obstacle",
            ));
        }

        current = next;
        route.push(current);
        if current == mission.goal {
            let steps = (route.len() - 1) as i32;
            let stars = score(mission.par, steps);
            return Ok(Simulation {
                route,
                steps,
                stars,
            });
        }
    }

    Err(ApiError::bad_request(
        "The submitted route does not reach the mission goal",
    ))
}

fn score(par: i32, steps: i32) -> i32 {
    if steps <= par {
        3
    } else if steps <= par + 2.max((par as f32 * 0.25).ceil() as i32) {
        2
    } else {
        1
    }
}

fn parse_commands(source: &str) -> ApiResult<Vec<String>> {
    let aliases = HashMap::from([
        ("up", "up"),
        ("down", "down"),
        ("left", "left"),
        ("right", "right"),
        ("↑", "up"),
        ("↓", "down"),
        ("←", "left"),
        ("→", "right"),
        ("ขึ้น", "up"),
        ("ลง", "down"),
        ("ซ้าย", "left"),
        ("ขวา", "right"),
    ]);
    let lines: Vec<&str> = source.lines().collect();
    let mut commands = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let raw = lines[index].trim();
        if raw.is_empty() || raw.starts_with('#') || raw.starts_with("//") {
            index += 1;
            continue;
        }

        let normalized = raw.trim_end_matches([',', ';']).trim().to_lowercase();
        let parts: Vec<&str> = normalized.split_whitespace().collect();

        if parts.first() == Some(&"repeat") {
            let amount_text = parts
                .get(1)
                .map(|value| value.trim_end_matches(':'))
                .ok_or_else(|| {
                    ApiError::bad_request(format!("Line {}: repeat needs an amount", index + 1))
                })?;
            let amount = parse_amount(amount_text, index)?;
            let mut next_index = index + 1;
            while next_index < lines.len() && lines[next_index].trim().is_empty() {
                next_index += 1;
            }
            let repeated_line = lines
                .get(next_index)
                .map(|line| {
                    line.trim()
                        .trim_end_matches([',', ';'])
                        .trim()
                        .to_lowercase()
                })
                .unwrap_or_default();
            let repeated = lines
                .get(next_index)
                .and_then(|_| aliases.get(repeated_line.as_str()))
                .ok_or_else(|| {
                    ApiError::bad_request(format!(
                        "Line {}: repeat needs a valid command on the next line",
                        index + 1
                    ))
                })?;
            commands.extend(std::iter::repeat_n((*repeated).to_owned(), amount));
            index = next_index + 1;
        } else if parts.len() == 2 || (parts.len() == 3 && parts[1] == "x") {
            let command = aliases.get(parts[0]).ok_or_else(|| {
                ApiError::bad_request(format!("Line {}: unknown command", index + 1))
            })?;
            let amount_text = if parts.len() == 3 { parts[2] } else { parts[1] };
            let amount = parse_amount(amount_text, index)?;
            commands.extend(std::iter::repeat_n((*command).to_owned(), amount));
            index += 1;
        } else {
            let command = aliases.get(normalized.as_str()).ok_or_else(|| {
                ApiError::bad_request(format!("Line {}: unknown command", index + 1))
            })?;
            commands.push((*command).to_owned());
            index += 1;
        }

        if commands.len() > 100 {
            return Err(ApiError::bad_request(
                "Programs are limited to 100 movement commands",
            ));
        }
    }

    Ok(commands)
}

fn parse_amount(value: &str, line_index: usize) -> ApiResult<usize> {
    let amount: usize = value.parse().map_err(|_| {
        ApiError::bad_request(format!(
            "Line {}: command amount must be a number",
            line_index + 1
        ))
    })?;
    if !(1..=50).contains(&amount) {
        return Err(ApiError::bad_request(format!(
            "Line {}: command amount must be between 1 and 50",
            line_index + 1
        )));
    }
    Ok(amount)
}

#[cfg(test)]
mod tests {
    use super::{mission, parse_and_simulate};

    #[test]
    fn validates_and_scores_a_complete_route() {
        let result = parse_and_simulate(
            mission("warmup").expect("warmup mission"),
            "right 4\ndown 4",
        )
        .expect("valid route");

        assert_eq!(result.steps, 8);
        assert_eq!(result.stars, 3);
        assert_eq!(result.route.first(), Some(&[0, 0]));
        assert_eq!(result.route.last(), Some(&[4, 4]));
    }

    #[test]
    fn rejects_routes_that_hit_obstacles() {
        let error = parse_and_simulate(mission("warmup").expect("warmup mission"), "right\ndown")
            .expect_err("blocked route should fail");

        assert!(error.to_string().contains("obstacle"));
    }

    #[test]
    fn supports_repeat_syntax_and_direction_aliases() {
        let result = parse_and_simulate(
            mission("warmup").expect("warmup mission"),
            "repeat 4:\n→\nrepeat 4:\nลง",
        )
        .expect("valid repeated route");

        assert_eq!(result.steps, 8);
        assert_eq!(result.stars, 3);
    }
}
