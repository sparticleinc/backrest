import { Stack, Flex, Text, Card, Button } from "@chakra-ui/react";
import { NumberInputField } from "./NumberInput";
import { Field } from "../ui/field";
import cronstrue from "cronstrue/i18n";
import * as m from "../../paraglide/messages";
// @ts-ignore - runtime.js is generated without type declarations
import { getLocale } from "../../paraglide/runtime";

// 备份计划的「简易调度」UI：只暴露三种普通用户能理解的频率
// （每天 / 每周 / 每月）外加「停用」，时间精确到时与分，背后生成
// 标准 cron 表达式。复杂的 cron / 间隔调度仍由 ScheduleFormItem（高级
// 模式，?debug=1）处理；本组件解析不了时给出只读提示。
//
// 时钟固定为 CLOCK_LOCAL（部署在日本东京时区，即本地时间）。

const CLOCK_LOCAL = "CLOCK_LOCAL";

type Frequency = "daily" | "weekly" | "monthly" | "disabled" | "advanced";

interface SimpleState {
  freq: Frequency;
  hour: number;
  minute: number;
  weekdays: number[]; // cron dow，0=周日 .. 6=周六
  day: number; // cron dom，1..31
}

const DEFAULT_STATE: SimpleState = {
  freq: "daily",
  hour: 0,
  minute: 0,
  weekdays: [1], // 默认周一
  day: 1,
};

const isNum = (s: string) => /^\d+$/.test(s);

// 把 schedule（JSON 形态：{ cron, clock } / { maxFrequencyHours } / { disabled }）
// 解析成简易状态。无法用简易模式表达时返回 freq: "advanced"。
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

  // 每天：日和星期都为 *
  if (dom === "*" && dow === "*") {
    return { ...DEFAULT_STATE, freq: "daily", hour, minute };
  }
  // 每周：日为 *，星期为数字列表
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
  // 每月：日为数字，星期为 *
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

// 应用 locale → cronstrue locale（cronstrue 仅内置部分语言，其余回退英文）
const cronstrueLocale = (): string => {
  const map: Record<string, string> = {
    zh: "zh_CN",
    ja: "ja",
    en: "en",
  };
  return map[getLocale()] || "en";
};

const describeCron = (cron: string): string => {
  try {
    return cronstrue.toString(cron, { locale: cronstrueLocale() });
  } catch {
    try {
      return cronstrue.toString(cron, { locale: "en" });
    } catch {
      return cron;
    }
  }
};

// 本地化的星期短名（避免为 7×13 个标签新增 i18n 文案）。
// cron dow：0=周日 .. 6=周六。用一个已知日期映射出名称。
const weekdayShortName = (dow: number): string => {
  // 2024-01-07 是周日，+dow 天即对应星期
  const d = new Date(Date.UTC(2024, 0, 7 + dow));
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
};

// 展示顺序：周一..周日（cron 值 1,2,3,4,5,6,0）
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
    // 从当前状态继承时间，避免切换频率时丢失已选时刻
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
    if (weekdays.length === 0) weekdays = [dow]; // 至少保留一个
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
            {/* 频率 */}
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

            {/* 每周：星期选择 */}
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

            {/* 每月：日期选择 */}
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

            {/* 时刻：时 + 分 */}
            {showTime && (
              <Field label={m.add_plan_modal_simple_schedule_time()}>
                <Flex gap={2} align="center">
                  <NumberInputField
                    value={String(state.hour)}
                    onValueChange={(e: any) =>
                      setTime(
                        Math.min(Math.max(e.valueAsNumber || 0, 0), 23),
                        state.minute,
                      )
                    }
                    min={0}
                    max={23}
                    width="20"
                  />
                  <Text fontWeight="bold">:</Text>
                  <NumberInputField
                    value={String(state.minute)}
                    onValueChange={(e: any) =>
                      setTime(
                        state.hour,
                        Math.min(Math.max(e.valueAsNumber || 0, 0), 59),
                      )
                    }
                    min={0}
                    max={59}
                    width="20"
                  />
                </Flex>
              </Field>
            )}

            {/* 停用说明 */}
            {state.freq === "disabled" && (
              <Text color="fg.muted" fontSize="sm">
                {m.add_plan_modal_schedule_disabled_description()}
              </Text>
            )}

            {/* 高级表达式：简易模式无法编辑 */}
            {state.freq === "advanced" && (
              <Stack gap={2}>
                <Text color="fg.muted" fontSize="sm">
                  {m.add_plan_modal_simple_schedule_advanced_note()}
                </Text>
                {value?.cron && (
                  <Text color="fg.muted" fontSize="sm" fontStyle="italic">
                    {describeCron(value.cron)}
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

            {/* 人类可读预览 */}
            {showTime && value?.cron && (
              <Text color="fg.muted" fontSize="sm">
                {describeCron(value.cron)}
              </Text>
            )}
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
};
