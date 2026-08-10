import { describe, expect, it } from "vitest";
import {
  INITIAL_EASE_FACTOR,
  MAX_INTERVAL_BY_SAFETY,
  MIN_EASE_FACTOR,
  compareByPriority,
  initialState,
  isDue,
  review,
  type Quality,
} from "../src/domain/srs";

const NOW = Date.UTC(2026, 7, 10);
const DAY = 24 * 60 * 60 * 1000;

describe("initialState", () => {
  it("未学習カードは即座に出題対象になる", () => {
    const s = initialState(NOW);
    expect(s.repetition).toBe(0);
    expect(s.easeFactor).toBe(INITIAL_EASE_FACTOR);
    expect(s.lastReviewedAt).toBeNull();
    expect(isDue(s, NOW)).toBe(true);
  });
});

describe("review: 間隔の進み方", () => {
  it("1回目の正解で1日後", () => {
    const s = review(initialState(NOW), 4, "none", NOW);
    expect(s.repetition).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt).toBe(NOW + DAY);
  });

  it("2回目の正解で6日後", () => {
    let s = review(initialState(NOW), 4, "none", NOW);
    s = review(s, 4, "none", NOW);
    expect(s.repetition).toBe(2);
    expect(s.intervalDays).toBe(6);
  });

  it("3回目以降は前回間隔に易しさ係数を掛ける", () => {
    let s = review(initialState(NOW), 4, "none", NOW);
    s = review(s, 4, "none", NOW);
    const before = s.intervalDays;
    s = review(s, 4, "none", NOW);
    expect(s.intervalDays).toBe(Math.round(before * s.easeFactor));
    expect(s.intervalDays).toBeGreaterThan(before);
  });
});

describe("review: 失敗時の扱い", () => {
  it("失敗すると連続正解回数がリセットされ翌日に再出題される", () => {
    let s = initialState(NOW);
    for (let i = 0; i < 4; i++) s = review(s, 5, "none", NOW);
    expect(s.repetition).toBe(4);

    s = review(s, 1, "none", NOW);
    expect(s.repetition).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(s.lapses).toBe(1);
  });

  it("品質3は正解、品質2は失敗として扱う", () => {
    expect(review(initialState(NOW), 3, "none", NOW).repetition).toBe(1);
    expect(review(initialState(NOW), 2, "none", NOW).repetition).toBe(0);
  });

  it("失敗を重ねても易しさ係数は下限を下回らない", () => {
    let s = initialState(NOW);
    for (let i = 0; i < 20; i++) s = review(s, 0, "none", NOW);
    expect(s.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
  });
});

describe("review: 安全カードの間隔上限（requirements §F）", () => {
  it("safety_level:critical は上限日数を超えない", () => {
    let s = initialState(NOW);
    for (let i = 0; i < 15; i++) s = review(s, 5, "critical", NOW);
    expect(s.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_BY_SAFETY.critical);
  });

  it("safety_level:caution も上限日数を超えない", () => {
    let s = initialState(NOW);
    for (let i = 0; i < 15; i++) s = review(s, 5, "caution", NOW);
    expect(s.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_BY_SAFETY.caution);
  });

  it("通常カードは安全カードより長い間隔まで伸びる", () => {
    let normal = initialState(NOW);
    let critical = initialState(NOW);
    for (let i = 0; i < 15; i++) {
      normal = review(normal, 5, "none", NOW);
      critical = review(critical, 5, "critical", NOW);
    }
    expect(normal.intervalDays).toBeGreaterThan(critical.intervalDays);
  });

  it("間隔は必ず1日以上になる", () => {
    const qualities: Quality[] = [0, 1, 2, 3, 4, 5];
    for (const q of qualities) {
      expect(review(initialState(NOW), q, "critical", NOW).intervalDays).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("isDue", () => {
  it("期限前は出題対象にならない", () => {
    const s = review(initialState(NOW), 5, "none", NOW);
    expect(isDue(s, NOW)).toBe(false);
    expect(isDue(s, s.dueAt)).toBe(true);
  });
});

describe("compareByPriority", () => {
  it("期限超過が長いカードを先に出す", () => {
    const older = { ...initialState(NOW), dueAt: NOW - 5 * DAY, lastReviewedAt: NOW - 10 * DAY };
    const newer = { ...initialState(NOW), dueAt: NOW - 1 * DAY, lastReviewedAt: NOW - 2 * DAY };
    expect(compareByPriority(older, newer)).toBeLessThan(0);
  });

  it("未学習カードは学習済みの後に回す", () => {
    const unseen = initialState(NOW);
    const seen = { ...initialState(NOW), dueAt: NOW - DAY, lastReviewedAt: NOW - 2 * DAY };
    expect(compareByPriority(unseen, seen)).toBeGreaterThan(0);
  });
});
