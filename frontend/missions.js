import { apiRequest } from "./api.js";

export const missions = [
  {
    id: "warmup",
    number: "01",
    name: "BOOT SEQUENCE",
    subtitle: "Opening Route",
    description: "Slip around the first barrier line and guide the bot to the opposite corner.",
    size: 5,
    start: [0, 0],
    goal: [4, 4],
    par: 8,
    difficulty: 1,
    obstacles: [
      [1, 1], [2, 1], [3, 1],
      [1, 3], [2, 3], [3, 3],
    ],
  },
  {
    id: "zigzag",
    number: "02",
    name: "SIGNAL MAZE",
    subtitle: "Zigzag Corridor",
    description: "Weave through the energy walls and reach the beacon.",
    size: 7,
    start: [1, 1],
    goal: [4, 5],
    par: 9,
    difficulty: 2,
    obstacles: [
      [0, 2], [1, 2], [4, 1], [5, 1], [5, 2], [1, 4],
      [5, 4], [0, 5], [1, 5], [3, 5], [5, 5],
    ],
  },
  {
    id: "fortress",
    number: "03",
    name: "CORE FORTRESS",
    subtitle: "9 × 9 Stronghold",
    description: "Circle the energy fortress and enter through the lower gate to reach the core.",
    size: 9,
    start: [0, 0],
    goal: [4, 4],
    par: 28,
    difficulty: 3,
    obstacles: [
      [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1],
      [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [5, 4],
      [1, 5], [3, 5], [4, 5], [5, 5],
      [1, 6], [5, 6],
      [1, 7], [2, 7], [3, 7], [5, 7], [6, 7],
    ],
  },
  {
    id: "labyrinth",
    number: "04",
    name: "GRID LABYRINTH",
    subtitle: "14 × 14 Labyrinth",
    description: "Push through the full-scale maze from the lower base to the top escape lane.",
    size: 14,
    start: [7, 13],
    goal: [6, 0],
    par: 46,
    difficulty: 3,
    obstacles: [
      [3, 0], [5, 0], [7, 0], [10, 0],
      [1, 1], [3, 1], [5, 1], [7, 1], [8, 1], [10, 1], [11, 1], [12, 1],
      [1, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
      [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
      [12, 4],
      [0, 5], [1, 5], [2, 5], [3, 5], [5, 5], [6, 5], [7, 5],
      [8, 5], [9, 5], [11, 5], [12, 5],
      [3, 6], [5, 6], [7, 6], [11, 6],
      [1, 7], [3, 7], [7, 7], [9, 7], [10, 7], [13, 7],
      [0, 8], [1, 8], [3, 8], [4, 8], [5, 8], [7, 8], [9, 8],
      [12, 8], [13, 8],
      [3, 9], [7, 9], [11, 9],
      [1, 10], [2, 10], [3, 10], [5, 10], [7, 10], [8, 10], [9, 10],
      [10, 10], [11, 10], [12, 10],
      [5, 11], [8, 11],
      [0, 12], [1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12],
      [8, 12], [10, 12], [12, 12], [13, 12],
      [10, 13],
    ],
  },
];

export function createEmptyProgress() {
  return {
    unlocked: 1,
    stars: {},
    bestSteps: {},
  };
}

export async function loadProgress() {
  try {
    return await apiRequest("/api/progress");
  } catch (error) {
    console.warn("Could not load server progress.", error);
    return createEmptyProgress();
  }
}

export async function resetProgress() {
  return apiRequest("/api/progress", { method: "DELETE" });
}
