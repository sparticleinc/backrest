import { Stack, Flex, Text, Card, Button } from "@chakra-ui/react";
import { NumberInputField } from "./NumberInput";
import { Field } from "../ui/field";
import { describeCron } from "../../lib/cronUtil";
import * as m from "../../paraglide/messages";
// @ts-ignore - runtime.js is generated without type declarations
import { getLocale } from "../../paraglide/runtime";

// バックアッププランの「簡易スケジュール」UI: 一般ユーザーが理解できる 3 種類の頻度
// （毎日 / 毎週 / 毎月）と「無効」だけを見せ、時刻は時・分まで指定でき、裏では
// 標準の cron 式を生成する。複雑な cron / 間隔スケジュールは引き続き ScheduleFormItem（詳細
// モード、?debug=1）で扱い、本コンポーネントで解析できない場合は読み取り専用の案内を表示する。
//
// クロックは CLOCK_LOCAL 固定（日本の東京タイムゾーンにデプロイされるため、ローカル時刻のこと）。

const CLOCK_LOCAL = "CLOCK_LOCAL";

type Frequency = "daily" | "weekly" | "monthly" | "disabled" | "advanced";

interface SimpleState {
  freq: Frequency;
  hour: number;
  minute: number;
  weekdays: number[]; // cron の dow、0=日曜 .. 6=土曜
  day: number; // cron dom，1..31
}

const DEFAULT_STATE: SimpleState = {
  freq: "daily",
  hour: 0,
  minute: 0,
  weekdays: [1], // デフォルトは月曜
  day: 1,
};

const isNum = (s: string) => /^\d+$/.test(s);

// schedule（JSON 形式: { cron, clock } / { maxFrequencyHours } / { disabled }）を
// 簡易状態に解析する。簡易モードで表現できない場合は freq: "advanced" を返す。
const parseSchedule = (schedule: any): SimpleState => {
  if (!schedule) return DEFAULT_STATE;
  if (schedule.disabled) return { ...DEFAULT_STATE, freq: "disabled" };
  if (schedule.maxFrequencyHours || schedule.maxFrequencyDays) {
    return { ...DEFAULT_STATE, freq: "advanced" };
  }

  const cron: string | undefined = schedule.cron;
  if (!cron) return DEFAULT_STATE;

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { ...DEFAULT_STATE, freq: "advanced" };

  const [min, hr, dom, mon, dow] = parts;
  if (!isNum(min) || !isNum(hr) || mon !== "*") {
    return { ...DEFAULT_STATE, freq: "advanced" };
  }
  const hour = +hr;
  const minute = +min;

  // 毎日: 日と曜日がどちらも *
  if (dom === "*" && dow === "*") {
    return { ...DEFAULT_STATE, freq: "daily", hour, minute };
  }
  // 毎週: 日が *、曜日が数値のリスト
  if (dom === "*" && dow !== "*") {
    const wds = dow.split(",");
    if (wds.length && wds.every(isNum)) {
      return {
        ...DEFAULT_STATE,
        freq: "weekly",
        hour,
        minute,
        weekdays: wds.map(Number).filter((w) => w >= 0 && w <= 6),
      };
    }
    return { ...DEFAULT_STATE, freq: "advanced" };
  }
  // 毎月: 日が数値、曜日が *
  if (isNum(dom) && dow === "*") {
    return { ...DEFAULT_STATE, freq: "monthly", hour, minute, day: +dom };
  }
  return { ...DEFAULT_STATE, freq: "advanced" };
};

const buildCron = (s: SimpleState): string => {
  if (s.freq === "weekly") {
    const wds = (s.weekdays.length ? s.weekdays : [1]).slice().sort((a, b) => a - b);
    return `${s.minute} ${s.hour} * * ${wds.join(",")}`;
  }
  if (s.freq === "monthly") {
    return `${s.minute} ${s.hour} ${s.day} * *`;
  }
  // daily
  return `${s.minute} ${s.hour} * * *`;
};

const describeCronSafe = (cron: string): string => {
  try {
    return describeCron(cron);
  } catch {
    return cron;
  }
};

// ローカライズされた曜日の短縮名（7×13 個のラベルのために i18n 文言を増やすのを避ける）。
// cron の dow: 0=日曜 .. 6=土曜。既知の日付から名前を割り出す。
const weekdayShortName = (dow: number): string => {
  // 2024-01-07 は日曜日なので、+dow 日がその曜日になる
  const d = new Date(Date.UTC(2024, 0, 7 + dow));
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
};

// 時・分の入力欄を空にすると 0 が補完される。ユーザー環境ではカーソルが 0 の前に残り、続けて入力すると
// 「80」のような誤った値になっていた（gbase-frontend-onprem#230）。補完の描画が終わった後に
// カーソルを明示的に末尾へ移し、続けて入力すると「08」になるようにする。
const moveCaretToEndIfCleared = (raw: string) => {
  if (raw !== "") return;
  const input = document.activeElement;
  if (!(input instanceof HTMLInputElement)) return;
  requestAnimationFrame(() => {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
};

// 表示順: 月曜..日曜（cron の値 1,2,3,4,5,6,0）
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const SimpleScheduleFormItem = ({
  value,
  onChange,
}: {
  value: any;
  onChange: (val: any) => void;
}) => {
  const state = parseSchedule(value);

  const emit = (next: SimpleState) => {
    onChange({ cron: buildCron(next), clock: CLOCK_LOCAL });
  };

  const handleFreqChange = (freq: Frequency) => {
    if (freq === "disabled") {
      onChange({ disabled: true, clock: CLOCK_LOCAL });
      return;
    }
    // 現在の状態から時刻を引き継ぎ、頻度を切り替えたときに選択済みの時刻が失われないようにする
    emit({ ...state, freq });
  };

  const setTime = (hour: number, minute: number) => {
    emit({ ...state, hour, minute });
  };

  const toggleWeekday = (dow: number) => {
    const has = state.weekdays.includes(dow);
    let weekdays = has
      ? state.weekdays.filter((w) => w !== dow)
      : [...state.weekdays, dow];
    if (weekdays.length === 0) weekdays = [dow]; // 最低 1 つは残す
    emit({ ...state, freq: "weekly", weekdays });
  };

  const frequencyOptions: { value: Frequency; label: string }[] = [
    { value: "daily", label: m.add_plan_modal_simple_schedule_daily() },
    { value: "weekly", label: m.add_plan_modal_simple_schedule_weekly() },
    { value: "monthly", label: m.add_plan_modal_simple_schedule_monthly() },
    { value: "disabled", label: m.add_plan_modal_schedule_disabled_label() },
  ];

  const showTime = state.freq === "daily" || state.freq === "weekly" || state.freq === "monthly";

  return (
    <Stack gap={4}>
      <Card.Root variant="subtle" width="fit-content" minW="sm">
        <Card.Body>
          <Stack gap={4}>
            {/* 頻度 */}
            <Field label={m.add_plan_modal_simple_schedule_frequency()}>
              <Flex gap={2} wrap="wrap">
                {frequencyOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={state.freq === opt.value ? "solid" : "outline"}
                    onClick={() => handleFreqChange(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Flex>
            </Field>

            {/* 毎週: 曜日の選択 */}
            {state.freq === "weekly" && (
              <Field label={m.add_plan_modal_simple_schedule_weekday_label()}>
                <Flex gap={1} wrap="wrap">
                  {WEEKDAY_ORDER.map((dow) => (
                    <Button
                      key={dow}
                      size="sm"
                      variant={state.weekdays.includes(dow) ? "solid" : "outline"}
                      onClick={() => toggleWeekday(dow)}
                      minW="44px"
                    >
                      {weekdayShortName(dow)}
                    </Button>
                  ))}
                </Flex>
              </Field>
            )}

            {/* 毎月: 日付の選択 */}
            {state.freq === "monthly" && (
              <NumberInputField
                label={m.add_plan_modal_simple_schedule_day_label()}
                helperText={m.add_plan_modal_simple_schedule_day_hint()}
                value={String(state.day)}
                onValueChange={(e: any) =>
                  emit({ ...state, day: e.valueAsNumber || 1 })
                }
                min={1}
                max={31}
                width="40"
              />
            )}

            {/* 時刻: 時 + 分 */}
            {showTime && (
              <Field label={m.add_plan_modal_simple_schedule_time()}>
                <Flex gap={2} align="center">
                  <NumberInputField
                    value={String(state.hour)}
                    onValueChange={(e: any) => {
                      setTime(
                        Math.min(Math.max(e.valueAsNumber || 0, 0), 23),
                        state.minute,
                      );
                      moveCaretToEndIfCleared(e.value);
                    }}
                    min={0}
                    max={23}
                    width="20"
                  />
                  <Text fontWeight="bold">:</Text>
                  <NumberInputField
                    value={String(state.minute)}
                    onValueChange={(e: any) => {
                      setTime(
                        state.hour,
                        Math.min(Math.max(e.valueAsNumber || 0, 0), 59),
                      );
                      moveCaretToEndIfCleared(e.value);
                    }}
                    min={0}
                    max={59}
                    width="20"
                  />
                </Flex>
              </Field>
            )}

            {/* 無効時の説明 */}
            {state.freq === "disabled" && (
              <Text color="fg.muted" fontSize="sm">
                {m.add_plan_modal_schedule_disabled_description()}
              </Text>
            )}

            {/* 詳細な式: 簡易モードでは編集できない */}
            {state.freq === "advanced" && (
              <Stack gap={2}>
                <Text color="fg.muted" fontSize="sm">
                  {m.add_plan_modal_simple_schedule_advanced_note()}
                </Text>
                {value?.cron && (
                  <Text color="fg.muted" fontSize="sm" fontStyle="italic">
                    {describeCronSafe(value.cron)}
                  </Text>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  width="fit-content"
                  onClick={() => handleFreqChange("daily")}
                >
                  {m.add_plan_modal_simple_schedule_reset()}
                </Button>
              </Stack>
            )}

            {/* 人が読めるプレビュー */}
            {showTime && value?.cron && (
              <Text color="fg.muted" fontSize="sm">
                {describeCronSafe(value.cron)}
              </Text>
            )}
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
};
